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
    const PyramidGameLeaderURIFactory = await ethers.getContractFactory('PyramidGameLeaderURI', signers[0])

    PyramidGameLeaderURI = await PyramidGameLeaderURIFactory.deploy()
    await PyramidGameLeaderURI.deployed()

    const initialAmount = ethers.utils.parseEther('0.01')
    const colors = ['#000', '#46ff5a', '#283fff', '#ff1b1b']

    PyramidGame = await PyramidGameFactory.deploy(initialAmount, colors, PyramidGameLeaderURI.address)
    await PyramidGame.deployed()
    PyramidGameLeaders = await PyramidGameLeadersFactory.attach(
      await PyramidGame.leaders()
    )


    PG = (s) => PyramidGame.connect(s)
    PGL = (s) => PyramidGameLeaders.connect(s)
  })



  describe('init', () => {
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

          const totalContributions = val + ((coinBalances[s.address] / 100_000) || 0)

          // replace lowest leader
          if (totalContributions > contributions[lowestToken]) {

            // refund lowest leader in coins
            coinBalances[tokenOwners[lowestToken]] = contributions[lowestToken] * 100_000

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
            coinBalances[s.address] += val * 100_000
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
        contributions[tokenId] += amount / 100_000

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




      await transferCoin(signers[5], signers[7], 20001)

      await claimLeadership(signers[7])
      await addToLeaderContributionBalance(signers[0], 0, 1000)



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
      console.log(getJsonURI(uri))

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


      await PG(signers[1]).contribute(txValue(0.01))

      expect(await getBalance(ReinvestTest)).to.equal(0)
      expect(await getBalance(PyramidGame)).to.equal(0.01)

      const signer0b4 = await getBalance(signers[0])
      const signer1b4 = await getBalance(signers[1])

      await PG(signers[2]).forceDistribution()

      expect(await getBalance(signers[1])).to.be.closeTo(signer1b4 + 0.005, 0.00000000001)
      expect(await getBalance(PyramidGame)).to.equal(0.005)


    })

    // TODO check contributions, forwards, commits permissions + delegations

  })


})

