const { expect } = require('chai')
const { ethers, waffle } = require('hardhat')
const { expectRevert, time, snapshot, balance } = require('@openzeppelin/test-helpers')

const toETH = amt => ethers.utils.parseEther(String(amt))
const txValue = amt => ({ value: toETH(amt) })
const ethVal = n => Number(ethers.utils.formatEther(n))
const num = n => Number(n)

const getBalance = async a => ethVal(await ethers.provider.getBalance(a.address))

function times(t, fn) {
  const out = []
  for (let i = 0; i < t; i++) out.push(fn(i))
  return out
}

const utf8Clean = raw => raw.replace(/data.*utf8,/, '')
const b64Clean = raw => raw.replace(/data.*,/, '')
const b64Decode = raw => Buffer.from(b64Clean(raw), 'base64').toString('utf8')
const getJsonURI = rawURI => JSON.parse(utf8Clean(rawURI))
const getSVG = rawURI => b64Decode(JSON.parse(utf8Clean(rawURI)).image)

const send = (from, to, amount) => from.sendTransaction({ to: to.address, ...txValue(amount) })
const roughGasUsed = tx => {
  return tx.wait().then(r => ethVal(r.gasUsed) * ethVal(tx.gasPrice) * 10**18)
}

const sumGasUsed = txs => Promise.all(txs.map(roughGasUsed)).then(t => t.reduce((a, c) => a + c, 0))

const expectBalanceEquals = async (s, expectedBalance) => {
  return expect(await getBalance(s) + await sumGasUsed(txs[s.address])).to.be.closeTo(expectedBalance, 0.000000001)
}









const ONE_DAY = 60 * 60 * 24
const TEN_MINUTES = 60 * 10
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const safeTransferFrom = 'safeTransferFrom(address,address,uint256)'

const contractBalance = contract => contract.provider.getBalance(contract.address)







let PyramidGame, PyramidGameLeaders, signers, txs, PG, PGL

describe('PyramidGame', () => {
  beforeEach(async () => {
    signers = await ethers.getSigners()
    txs = {}

    signers.forEach(s => {
      txs[s.address] = []
    })


    const PyramidGameFactory = await ethers.getContractFactory('PyramidGame', signers[0])
    const PyramidGameLeadersFactory = await ethers.getContractFactory('PyramidGameLeaders', signers[0])

    const initialAmount = ethers.utils.parseEther('0.01')

    PyramidGame = await PyramidGameFactory.deploy({ value: initialAmount })
    await PyramidGame.deployed()
    PyramidGameLeaders = await PyramidGameLeadersFactory.attach(
      await PyramidGame.leaders()
    )


    PG = (s) => PyramidGame.connect(s)
    PGL = (s) => PyramidGameLeaders.connect(s)
  })



  describe('init', () => {
    it('has correct name and symbol', async () => {
      expect(await PyramidGame.name()).to.equal('Pyramid Game')
      expect(await PyramidGame.symbol()).to.equal('PYRAMID')
      expect(await PyramidGameLeaders.name()).to.equal('Pyramid Game Leaderboard')
      expect(await PyramidGameLeaders.symbol()).to.equal('LEADER')
    })

    it('makes the right payments', async () => {
      const contributions = {0:.01}
      const estimatedWinnings = {[signers[0].address]:0}
      const payments = {}
      const forwards = {}
      const tokenOwners = {0:signers[0].address}
      const coinBalances = {}
      const ethSent = {}

      const startingBalances = {}
      for (let s = 0; s < signers.length; s++) {
        startingBalances[signers[s].address] = await getBalance(signers[s])
      }




      const contribute = async (s, val) => {
        if (!estimatedWinnings[s.address]) estimatedWinnings[s.address] = 0
        if (!payments[s.address]) payments[s.address] = []
        if (!coinBalances[s.address]) coinBalances[s.address] = 0

        const leaderTotal = Object.values(contributions).reduce((a, c) => a + c, 0)

        const recentPayments = []

        console.log('=======CONTRIBUTION=======')

        let ownedToken
        await Promise.all(Object.keys(tokenOwners).map(async tokenId => {
          const recipient = forwards[tokenId] || (
            await PGL(s).exists(tokenId) ? await PGL(s).ownerOf(tokenId) : null
          )

          estimatedWinnings[recipient] = estimatedWinnings[recipient] || 0
          estimatedWinnings[recipient] += val * (contributions[tokenId] / leaderTotal)


          const p = {
            tokenId,
            sender: s.address,
            recipient: recipient,
            share: val * (contributions[tokenId] / leaderTotal),
            percent: (contributions[tokenId] / leaderTotal),
            total: val,
          }
          payments[recipient]?.push?.(p)
          recentPayments.push(p)

          if (tokenOwners[tokenId] === s.address) ownedToken = tokenId

        }))

        ethSent[s.address] = (ethSent[s.address]||0) + val



        if (ownedToken) contributions[ownedToken] += val
        else {
          reorg(s, val)
        }

        const r = await PG(s).contribute(txValue(val))
        txs[s.address].push(r)



        for (let s = 0; s < signers.length; s++) {
          const a = signers[s].address
          try {
            await expectBalanceEquals(
              signers[s],
              (startingBalances[a]||0) + (estimatedWinnings[a]||0) - (ethSent[a]||0)
            )

            const coinsOwned = ethVal(await PG(signers[s]).balanceOf(signers[s].address))
            expect(coinsOwned).to.be.closeTo(coinBalances[signers[s].address] || 0, 0.000000001)
          } catch (e) {

            console.log('========PAYMENTS======')
            console.log(recentPayments)
            await logStats()

            console.log(estimatedWinnings)

            console.log('UNEXPECTED BALANCES', signers[s].address)
            console.log((startingBalances[signers[s].address]||0), (estimatedWinnings[signers[s].address]||0), (ethSent[signers[s].address]||0))
            throw new Error(e)
          }
        }
        return r
      }




      function reorg(s, val) {
        // Not all leader tokens have been allocated
        if (Object.keys(tokenOwners).length < 12) {
          const tokenId = Object.keys(tokenOwners).length
          tokenOwners[tokenId] = s.address
          contributions[tokenId] = val
        } else {
          const lowestToken = Object.keys(contributions).reduce((a, c) =>
            contributions[c] < contributions[a] ? c : a
          , 0)

          const totalContributions = val + ((coinBalances[s.address]) || 0)

          // replace lowest leader
          if (totalContributions > contributions[lowestToken]) {

            // refund lowest leader in coins
            coinBalances[tokenOwners[lowestToken]] = contributions[lowestToken]

            // update leader coin contributions
            contributions[lowestToken] = totalContributions

            // change leader
            tokenOwners[lowestToken] = s.address

            // remove new leader's coins
            coinBalances[s.address] = 0

            // reset the recipient
            forwards[lowestToken] = s.address


          // credit sender in coins
          } else {
            coinBalances[s.address] += val
          }

        }
      }


      const setRecipient = async (s, tokenId, recipient) => {

        forwards[tokenId] = recipient.address

        const r = await PGL(s).setRecipient(tokenId, recipient.address)

        txs[s.address].push(r)
        return r
      }






      const transferToken = async (s, tokenId, recipient) => {
        forwards[tokenId] = recipient.address

        tokenOwners[tokenId] = recipient.address
        const r = await PGL(s)[safeTransferFrom](s.address, recipient.address, tokenId)
        txs[s.address].push(r)
        return r
      }


      const claimLeadership = async (s) => {
        reorg(s, 0)

        const r = await PG(s).claimLeadership()
        txs[s.address].push(r)
        return r
      }


      const transferCoin = async (s1, s2, amount) => {

        coinBalances[s1.address] -= amount
        coinBalances[s2.address] += amount

        const r = await PG(s1).transfer(s2.address, toETH(amount))
        txs[s1.address].push(r)
        return r
      }


      const addToLeaderContributionBalance = async (s, tokenId, amount) => {
        coinBalances[s.address] -= amount
        contributions[tokenId] += amount

        const r = await PG(s).addToLeaderContributionBalance(tokenId, toETH(amount))
        txs[s.address].push(r)
        return r
      }






      for (let i = 0; i < 12; i++) {
        await contribute(signers[i], i / 10)

        if (i % 2) {
          await setRecipient(signers[i], i, signers[i - 1])
        }
      }

      await transferToken(signers[1], 1, signers[15])
      await transferToken(signers[2], 2, signers[16])


      for (let i = 12; i < 20; i++) {
        await contribute(signers[i], i / 10)
      }


      for (let t = 0; t < 1; t++) {
        for (let i = 0; i < 20; i++) {
          await contribute(signers[i], (i+1)* t / 32)
        }
      }




      await transferCoin(signers[5], signers[7], 0.20001)

      await claimLeadership(signers[7])
      await addToLeaderContributionBalance(signers[0], 0, 0.01)



      await contribute(signers[4], 1)





      await logStats()


      async function logStats() {

        console.log('FORWARDS:')
        const f = []
        for (let i = 0; i < Object.keys(tokenOwners).length; i++) {
          f.push({
            id: i,
            recipient: await PGL(signers[0]).recipientOf(i),
            predictedRecipient: forwards[i] || tokenOwners[i]
          })
        }
        console.table(f)

        console.log('TOKENS:')

        const tokens = []
        for (let i = 0; i < Object.keys(tokenOwners).length; i++) {
          tokens.push({
            id: i,
            owner: await PGL(signers[0]).ownerOf(i),
            predictedOwner: tokenOwners[i],
            contributions: ethVal(await PGL(signers[0]).contributions(i)),
            predictedContributions: contributions[i],
            // matchingForward: forwards[i] === await PGL(signers[0]).recipientOf(i) ? 'true' : `${forwards[i]} !== ${await PGL(signers[0]).recipientOf(i)}`
          })
        }

        console.table(tokens)

        const actualTokensOwned = {}
        for (let id = 0; id < 12; id++) {
          actualTokensOwned[id] = await PGL(signers[0]).ownerOf(id)
        }



        console.log('ADDRS:')
        const addrs = []
        for (let s = 0; s < signers.length; s++) {
          const addr = signers[s].address
          addrs.push({
            addr,
            actualBalance: (await getBalance(signers[s])).toFixed(3),
            predictedBalance: ((startingBalances[addr]||0) + (estimatedWinnings[addr]||0) - (ethSent[addr]||0)).toFixed(3),
            coinsOwned: ethVal(await PG(signers[s]).balanceOf(signers[s].address)),
            predictedCoinsOwned: coinBalances[signers[s].address] || 0,
            tokenOwned: Object.keys(actualTokensOwned).filter(id => actualTokensOwned[id] === addr).join(', '),
            predictedTokenOwned: Object.keys(tokenOwners).filter(id => tokenOwners[id] === addr).join(', '),
          })
        }

        console.table(addrs)

      }

    })

    it('sending directly to contracts should work', async () => {
      await send(signers[0], PyramidGame, 1)
      await send(signers[0], PyramidGameLeaders, 1)
    })

    it('token uri should work', async () => {
      const uri = await PGL(signers[0]).tokenURI(0)
      const metadata = getJsonURI(uri)
      console.log(metadata)

      // Verify token name includes the leaderboard name and slot number
      expect(metadata.name).to.equal('Pyramid Game Leaderboard Slot #0')

      for (let i = 1; i < 12; i++) {
        await send(signers[i], PyramidGame, 1)

      const uri = await PGL(signers[i]).tokenURI(i)
      console.log(getJsonURI(uri))
      }

    })

    it('permissions should work', async () => {
      await expectRevert(
        PGL(signers[0]).incrementContributionBalance(0, 100000),
        'Only the root address can perform this action'
      )

      await expectRevert(
        PGL(signers[1]).mint(signers[1].address, 100000),
        'Only the root address can perform this action'
      )

      await expectRevert(
        PGL(signers[1]).reorg(0, signers[1].address, 100000),
        'Only the root address can perform this action'
      )

      await expectRevert(
        PGL(signers[1]).setRecipient(0, signers[1].address),
        'Only token owner can perform this action'
      )
    })

    it('shouldnt break from recursion', async () => {
      const ReinvestTestFactory = await ethers.getContractFactory('ReinvestTest', signers[0])
      const ReinvestTest = await ReinvestTestFactory.deploy()
      await ReinvestTest.deployed()


      await PGL(signers[0]).setRecipient(0, ReinvestTest.address)


      await PG(signers[1]).contribute(txValue(0.05))

      expect(await getBalance(ReinvestTest)).to.equal(0)
      expect(await getBalance(PyramidGame)).to.equal(0.05)

      const signer0b4 = await getBalance(signers[0])
      const signer1b4 = await getBalance(signers[1])

      await PG(signers[2]).forceDistribution()

      // Token 0 has 0.01 contribution (from initialization)
      // Token 1 has 0.05 contribution (from signers[1])
      // Total contributions: 0.06
      // Token 1's share of 0.05 ETH distribution: 0.05 * (0.05/0.06) = 0.0417 ETH
      const expectedGain = 0.05 * (5/6)
      expect(await getBalance(signers[1])).to.be.closeTo(signer1b4 + expectedGain, 0.00000000001)

      // Remaining balance should be token 0's share: 0.05 * (0.01/0.06) = 0.00833...
      expect(await getBalance(PyramidGame)).to.be.closeTo(0.05 * (1/6), 0.00000000001)


    })

    it('deployer gets their ETH back (minus gas) after deployment', async () => {
      const deployer = signers[10]
      const initialAmount = ethers.utils.parseEther('1')

      const balanceBefore = await getBalance(deployer)

      const PyramidGameFactory = await ethers.getContractFactory('PyramidGame', deployer)
      const testPyramidGame = await PyramidGameFactory.deploy({ value: initialAmount })
      await testPyramidGame.deployed()

      const balanceAfter = await getBalance(deployer)

      // Deployer should have roughly the same balance (within 0.01 ETH for gas costs)
      // They send 1 ETH but get it back from the wallet
      expect(balanceAfter).to.be.closeTo(balanceBefore, 0.01)
    })

    // TODO check contributions, forwards, commits permissions + delegations

  })

  describe('wallet multisig', () => {
    it('leaders can collectively update URI contract, but not individually', async () => {
      // Create multiple leaders by having people contribute
      await PG(signers[1]).contribute(txValue(0.1))
      await PG(signers[2]).contribute(txValue(0.2))
      await PG(signers[3]).contribute(txValue(0.3))
      await PG(signers[4]).contribute(txValue(0.4))
      await PG(signers[5]).contribute(txValue(0.5))
      await PG(signers[6]).contribute(txValue(0.6))
      await PG(signers[7]).contribute(txValue(0.7))

      // Deploy a new TokenURI contract to use as the new URI
      const TokenURIFactory = await ethers.getContractFactory('TokenURI', signers[0])
      const newURI = await TokenURIFactory.deploy()
      await newURI.deployed()

      // Get the current URI to verify it changes
      const oldURI = await PyramidGameLeaders.uri()
      expect(oldURI).to.not.equal(newURI.address)

      // Test 1: Single leader cannot update URI directly
      await expect(
        PGL(signers[0]).updateURI(newURI.address)
      ).to.be.revertedWith('Only the root wallet can perform this action')

      // Test 2: Leaders can collectively update URI through wallet
      const wallet = await PyramidGame.wallet()

      // Prepare the transaction data
      const target = PyramidGameLeaders.address
      const value = 0
      const data = PyramidGameLeaders.interface.encodeFunctionData('updateURI', [newURI.address])
      const txNonce = 1

      // Create message hash (same as in the contract using abi.encode)
      const messageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes', 'uint256'],
          [target, value, data, txNonce]
        )
      )

      // Get 7 leaders to sign (majority of 12 is 7)
      const leaderTokenIds = [0, 1, 2, 3, 4, 5, 6]
      const signatures = []

      for (let i = 0; i < leaderTokenIds.length; i++) {
        const tokenId = leaderTokenIds[i]
        const owner = await PyramidGameLeaders.ownerOf(tokenId)
        const signer = signers.find(s => s.address === owner)

        // signMessage automatically adds the Ethereum prefix
        const signature = await signer.signMessage(ethers.utils.arrayify(messageHash))
        signatures.push(signature)
      }

      // Execute the transaction through the wallet
      const PyramidGameWallet = await ethers.getContractAt('PyramidGameWallet', wallet)
      await PyramidGameWallet.executeLeaderTransaction(
        target,
        value,
        data,
        txNonce,
        leaderTokenIds,
        signatures
      )

      // Verify the URI was updated
      const updatedURI = await PyramidGameLeaders.uri()
      expect(updatedURI).to.equal(newURI.address)
    })

    it('reverts when insufficient leaders sign (only 6 out of 12)', async () => {
      // Create 12 leaders total (deployer already has 1, add 11 more)
      await PG(signers[1]).contribute(txValue(0.1))
      await PG(signers[2]).contribute(txValue(0.2))
      await PG(signers[3]).contribute(txValue(0.3))
      await PG(signers[4]).contribute(txValue(0.4))
      await PG(signers[5]).contribute(txValue(0.5))
      await PG(signers[6]).contribute(txValue(0.6))
      await PG(signers[7]).contribute(txValue(0.7))
      await PG(signers[8]).contribute(txValue(0.8))
      await PG(signers[9]).contribute(txValue(0.9))
      await PG(signers[10]).contribute(txValue(1.0))
      await PG(signers[11]).contribute(txValue(1.1))

      // Deploy a new TokenURI contract to use as the new URI
      const TokenURIFactory = await ethers.getContractFactory('TokenURI', signers[0])
      const newURI = await TokenURIFactory.deploy()
      await newURI.deployed()

      const wallet = await PyramidGame.wallet()

      // Prepare the transaction data
      const target = PyramidGameLeaders.address
      const value = 0
      const data = PyramidGameLeaders.interface.encodeFunctionData('updateURI', [newURI.address])
      const txNonce = 2

      // Create message hash
      const messageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes', 'uint256'],
          [target, value, data, txNonce]
        )
      )

      // Get only 6 leaders to sign (insufficient - need 7 for majority)
      const leaderTokenIds = [0, 1, 2, 3, 4, 5]
      const signatures = []

      for (let i = 0; i < leaderTokenIds.length; i++) {
        const tokenId = leaderTokenIds[i]
        const owner = await PyramidGameLeaders.ownerOf(tokenId)
        const signer = signers.find(s => s.address === owner)

        const signature = await signer.signMessage(ethers.utils.arrayify(messageHash))
        signatures.push(signature)
      }

      // Execute should fail with insufficient votes
      const PyramidGameWallet = await ethers.getContractAt('PyramidGameWallet', wallet)
      await expect(
        PyramidGameWallet.executeLeaderTransaction(
          target,
          value,
          data,
          txNonce,
          leaderTokenIds,
          signatures
        )
      ).to.be.revertedWith('Insufficient votes')
    })

    it('first participant cannot update wallet, but majority can, and new wallet can update URI', async () => {
      // Create 12 leaders total (deployer already has 1, add 11 more)
      await PG(signers[1]).contribute(txValue(0.1))
      await PG(signers[2]).contribute(txValue(0.2))
      await PG(signers[3]).contribute(txValue(0.3))
      await PG(signers[4]).contribute(txValue(0.4))
      await PG(signers[5]).contribute(txValue(0.5))
      await PG(signers[6]).contribute(txValue(0.6))
      await PG(signers[7]).contribute(txValue(0.7))
      await PG(signers[8]).contribute(txValue(0.8))
      await PG(signers[9]).contribute(txValue(0.9))
      await PG(signers[10]).contribute(txValue(1.0))
      await PG(signers[11]).contribute(txValue(1.1))

      // Get current wallet
      const oldWallet = await PyramidGame.wallet()

      // Test 1: First participant (signers[0]) cannot directly call updateWallet
      await expect(
        PG(signers[0]).updateWallet(signers[0].address)
      ).to.be.revertedWith('Only the wallet can perform this action')

      // Test 2: Deploy a new wallet contract to use as the new wallet
      const PyramidGameWalletFactory = await ethers.getContractFactory('PyramidGameWallet', signers[0])
      const newWallet = await PyramidGameWalletFactory.deploy(
        PyramidGame.address,
        PyramidGameLeaders.address,
        signers[0].address // parent - just use signers[0] for testing
      )
      await newWallet.deployed()

      // Prepare the transaction to update the wallet
      const target = PyramidGame.address
      const value = 0
      const data = PyramidGame.interface.encodeFunctionData('updateWallet', [newWallet.address])
      const txNonce = 3

      // Create message hash
      const messageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes', 'uint256'],
          [target, value, data, txNonce]
        )
      )

      // Get 7 leaders to sign (majority)
      const leaderTokenIds = [0, 1, 2, 3, 4, 5, 6]
      const signatures = []

      for (let i = 0; i < leaderTokenIds.length; i++) {
        const tokenId = leaderTokenIds[i]
        const owner = await PyramidGameLeaders.ownerOf(tokenId)
        const signer = signers.find(s => s.address === owner)

        const signature = await signer.signMessage(ethers.utils.arrayify(messageHash))
        signatures.push(signature)
      }

      // Execute the transaction through the old wallet
      const PyramidGameWallet = await ethers.getContractAt('PyramidGameWallet', oldWallet)
      await PyramidGameWallet.executeLeaderTransaction(
        target,
        value,
        data,
        txNonce,
        leaderTokenIds,
        signatures
      )

      // Verify the wallet was updated
      const updatedWallet = await PyramidGame.wallet()
      expect(updatedWallet).to.equal(newWallet.address)
      expect(updatedWallet).to.not.equal(oldWallet)

      // Test 3: New wallet can successfully update the URI contract
      const TokenURIFactory = await ethers.getContractFactory('TokenURI', signers[0])
      const newURI = await TokenURIFactory.deploy()
      await newURI.deployed()

      const oldURI = await PyramidGameLeaders.uri()

      // Prepare transaction to update URI using the new wallet
      const uriTarget = PyramidGameLeaders.address
      const uriValue = 0
      const uriData = PyramidGameLeaders.interface.encodeFunctionData('updateURI', [newURI.address])
      const uriTxNonce = 1 // New wallet has its own nonce counter

      // Create message hash for URI update
      const uriMessageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes', 'uint256'],
          [uriTarget, uriValue, uriData, uriTxNonce]
        )
      )

      // Get signatures from the same 7 leaders
      const uriSignatures = []
      for (let i = 0; i < leaderTokenIds.length; i++) {
        const tokenId = leaderTokenIds[i]
        const owner = await PyramidGameLeaders.ownerOf(tokenId)
        const signer = signers.find(s => s.address === owner)

        const signature = await signer.signMessage(ethers.utils.arrayify(uriMessageHash))
        uriSignatures.push(signature)
      }

      // Execute through the NEW wallet
      await newWallet.executeLeaderTransaction(
        uriTarget,
        uriValue,
        uriData,
        uriTxNonce,
        leaderTokenIds,
        uriSignatures
      )

      // Verify URI was updated by the new wallet
      const finalURI = await PyramidGameLeaders.uri()
      expect(finalURI).to.equal(newURI.address)
      expect(finalURI).to.not.equal(oldURI)
    })

    it('with 4 leaders, 3 signatures (majority) should succeed', async () => {
      // Create 4 leaders total (deployer already has 1, add 3 more)
      await PG(signers[1]).contribute(txValue(0.1))
      await PG(signers[2]).contribute(txValue(0.2))
      await PG(signers[3]).contribute(txValue(0.3))

      // Verify we have 4 leaders
      const totalSupply = await PyramidGameLeaders.totalSupply()
      expect(totalSupply).to.equal(4)

      // Deploy a new TokenURI contract to test with
      const TokenURIFactory = await ethers.getContractFactory('TokenURI', signers[0])
      const newURI = await TokenURIFactory.deploy()
      await newURI.deployed()

      const wallet = await PyramidGame.wallet()

      // Prepare the transaction data
      const target = PyramidGameLeaders.address
      const value = 0
      const data = PyramidGameLeaders.interface.encodeFunctionData('updateURI', [newURI.address])
      const txNonce = 4

      // Create message hash
      const messageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes', 'uint256'],
          [target, value, data, txNonce]
        )
      )

      // Get 3 leaders to sign (majority of 4 is > 2, so 3 is sufficient)
      const leaderTokenIds = [0, 1, 2]
      const signatures = []

      for (let i = 0; i < leaderTokenIds.length; i++) {
        const tokenId = leaderTokenIds[i]
        const owner = await PyramidGameLeaders.ownerOf(tokenId)
        const signer = signers.find(s => s.address === owner)

        const signature = await signer.signMessage(ethers.utils.arrayify(messageHash))
        signatures.push(signature)
      }

      // Execute should succeed with 3 out of 4 signatures
      const PyramidGameWallet = await ethers.getContractAt('PyramidGameWallet', wallet)
      await PyramidGameWallet.executeLeaderTransaction(
        target,
        value,
        data,
        txNonce,
        leaderTokenIds,
        signatures
      )

      // Verify the URI was updated
      const updatedURI = await PyramidGameLeaders.uri()
      expect(updatedURI).to.equal(newURI.address)
    })
  })

  describe('distribute()', () => {
    it('distributes ETH proportionally without updating contribution balances', async () => {
      // Setup: Create 3 leaders with different contributions
      await PG(signers[0]).contribute(txValue(0.99))
      await PG(signers[1]).contribute(txValue(0.5))
      await PG(signers[2]).contribute(txValue(0.25))

      // Verify initial contributions
      expect(ethVal(await PGL(signers[0]).contributions(0))).to.be.closeTo(1, 0.000001)
      expect(ethVal(await PGL(signers[0]).contributions(1))).to.be.closeTo(0.5, 0.000001)
      expect(ethVal(await PGL(signers[0]).contributions(2))).to.be.closeTo(0.25, 0.000001)
      expect(ethVal(await PGL(signers[0]).contributionTotal())).to.be.closeTo(1.75, 0.000001)

      // Record balances before distribution
      const balances = {}
      for (let i = 0; i < 3; i++) {
        balances[i] = await getBalance(signers[i])
      }

      // Someone calls distribute with 1 ETH
      await PG(signers[10]).distribute(txValue(1))

      // Calculate expected distributions (proportional to contributions)
      const totalContributions = 1.75
      const distribution = 1
      const expected = {
        0: (1 / totalContributions) * distribution,
        1: (0.5 / totalContributions) * distribution,
        2: (0.25 / totalContributions) * distribution
      }

      // Verify ETH was distributed proportionally
      expect(await getBalance(signers[0]) - balances[0]).to.be.closeTo(expected[0], 0.0001)
      expect(await getBalance(signers[1]) - balances[1]).to.be.closeTo(expected[1], 0.0001)
      expect(await getBalance(signers[2]) - balances[2]).to.be.closeTo(expected[2], 0.0001)

      // Verify contribution balances are UNCHANGED
      expect(ethVal(await PGL(signers[0]).contributions(0))).to.be.closeTo(1, 0.000001)
      expect(ethVal(await PGL(signers[0]).contributions(1))).to.be.closeTo(0.5, 0.000001)
      expect(ethVal(await PGL(signers[0]).contributions(2))).to.be.closeTo(0.25, 0.000001)
      expect(ethVal(await PGL(signers[0]).contributionTotal())).to.be.closeTo(1.75, 0.000001)

      // Verify total supply unchanged (no new leaders)
      expect(num(await PGL(signers[0]).totalSupply())).to.equal(3)

      // Verify contract has no remaining balance
      expect(await getBalance(PyramidGame)).to.be.closeTo(0, 0.000001)
    })

    it('distributes to full leaderboard correctly', async () => {
      // Setup: Create 12 leaders
      await PG(signers[0]).contribute(txValue(0.99))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(0.1))
      }

      const totalContributions = 2.1 // 1.0 (signer 0: 0.01 initial + 0.99) + 1.1 (11 signers × 0.1)
      expect(ethVal(await PGL(signers[0]).contributionTotal())).to.be.closeTo(totalContributions, 0.000001)

      // Record balances before distribution
      const balances = {}
      for (let i = 0; i < 12; i++) {
        balances[i] = await getBalance(signers[i])
      }

      // Distribute 2 ETH
      await PG(signers[15]).distribute(txValue(2))

      // Verify distributions
      expect(await getBalance(signers[0]) - balances[0]).to.be.closeTo((1 / totalContributions) * 2, 0.0001)
      expect(await getBalance(signers[1]) - balances[1]).to.be.closeTo((0.1 / totalContributions) * 2, 0.0001)

      // Verify contribution balances unchanged
      expect(ethVal(await PGL(signers[0]).contributionTotal())).to.be.closeTo(totalContributions, 0.000001)
    })
  })


})

