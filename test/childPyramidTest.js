const { expect } = require('chai')
const { ethers } = require('hardhat')

const toETH = amt => ethers.utils.parseEther(String(amt))
const txValue = amt => ({ value: toETH(amt) })
const ethVal = n => Number(ethers.utils.formatEther(n))

let PyramidGame, PyramidGameLeaders, signers, PG, PGL

describe('PyramidGame Child Deployment', () => {
  beforeEach(async () => {
    signers = await ethers.getSigners()

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

  describe('deployChildPyramidGame', () => {
    it('deploys a minimal proxy clone', async () => {
      // Check initial state
      expect(await PyramidGame.totalChildren()).to.equal(0)

      // Deploy child with ETH
      const tx = await PG(signers[1]).deployChildPyramidGame('Child Game', 'CHILD', 'CHILDL', { value: toETH(0.05) })
      const receipt = await tx.wait()

      // Check event was emitted
      const event = receipt.events.find(e => e.event === 'ChildPyramidDeployed')
      expect(event).to.not.be.undefined
      expect(event.args.deployer).to.equal(signers[1].address)

      const childAddress = event.args.childAddress

      // Verify child was added to array
      expect(await PyramidGame.totalChildren()).to.equal(1)
      expect(await PyramidGame.children(0)).to.equal(childAddress)

      // Verify child has custom name and symbol
      const PyramidGameFactory = await ethers.getContractFactory('PyramidGame')
      const childPyramid = PyramidGameFactory.attach(childAddress)
      expect(await childPyramid.name()).to.equal('Child Game')
      expect(await childPyramid.symbol()).to.equal('CHILD')

      // Verify child leaders has custom name and symbol
      const childLeadersAddress = await childPyramid.leaders()
      const PyramidGameLeadersFactory = await ethers.getContractFactory('PyramidGameLeaders')
      const childLeaders = PyramidGameLeadersFactory.attach(childLeadersAddress)
      expect(await childLeaders.name()).to.equal('Child Game Leaderboard')
      expect(await childLeaders.symbol()).to.equal('CHILDL')
    })

    it('deploys multiple children and tracks them all', async () => {
      // Deploy three children
      const tx1 = await PG(signers[0]).deployChildPyramidGame('Child 1', 'CHILD1', 'C1', { value: toETH(0.01) })
      const receipt1 = await tx1.wait()
      const child1 = receipt1.events.find(e => e.event === 'ChildPyramidDeployed').args.childAddress

      const tx2 = await PG(signers[1]).deployChildPyramidGame('Child 2', 'CHILD2', 'C2', { value: toETH(0.01) })
      const receipt2 = await tx2.wait()
      const child2 = receipt2.events.find(e => e.event === 'ChildPyramidDeployed').args.childAddress

      const tx3 = await PG(signers[2]).deployChildPyramidGame('Child 3', 'CHILD3', 'C3', { value: toETH(0.01) })
      const receipt3 = await tx3.wait()
      const child3 = receipt3.events.find(e => e.event === 'ChildPyramidDeployed').args.childAddress

      // Verify all children are tracked
      expect(await PyramidGame.totalChildren()).to.equal(3)
      expect(await PyramidGame.children(0)).to.equal(child1)
      expect(await PyramidGame.children(1)).to.equal(child2)
      expect(await PyramidGame.children(2)).to.equal(child3)

      // Verify each child is unique
      expect(child1).to.not.equal(child2)
      expect(child2).to.not.equal(child3)
      expect(child1).to.not.equal(child3)
    })

    it('child wallet receives parent tokens when deployed with ETH', async () => {
      // Deploy child with ETH - this initializes child AND contributes to parent
      const tx = await PG(signers[0]).deployChildPyramidGame('Child Game', 'CHILD', 'CHILDL', { value: toETH(1) })
      const receipt = await tx.wait()
      const childAddress = receipt.events.find(e => e.event === 'ChildPyramidDeployed').args.childAddress

      // Connect to child
      const PyramidGameFactory = await ethers.getContractFactory('PyramidGame')
      const childPyramid = PyramidGameFactory.attach(childAddress)

      // Get child's wallet
      const childWalletAddress = await childPyramid.wallet()

      // Check that child's wallet has tokens/NFT in the parent (this PyramidGame)
      const parentLeadersAddress = await PyramidGame.leaders()
      const PyramidGameLeadersFactory = await ethers.getContractFactory('PyramidGameLeaders')
      const parentLeaders = PyramidGameLeadersFactory.attach(parentLeadersAddress)

      // Child wallet should own a leader token in parent (since 1 ETH > 0.01 ETH initial)
      const balance = await parentLeaders.balanceOf(childWalletAddress)
      expect(balance.toNumber()).to.be.greaterThan(0)
    })

    it('complex child game flow: accumulate parent ERC20, claim leadership, receive distributions', async () => {
      // Step 1: Fill all 12 slots in parent - deployer contributes 0.99 more to get to 1 ETH, then add 11 more with 1 ETH each
      await PG(signers[0]).contribute(txValue(0.99)) // Deployer now has 1 ETH total (0.01 + 0.99)
      for (let i = 1; i <= 11; i++) {
        await PG(signers[i]).contribute(txValue(1))
      }

      const parentLeadersAddr = await PyramidGame.leaders()
      const PyramidGameLeadersFactory = await ethers.getContractFactory('PyramidGameLeaders')
      const parentLeaders = PyramidGameLeadersFactory.attach(parentLeadersAddr)

      // Verify 12 leaders
      expect(await parentLeaders.totalSupply()).to.equal(12)

      // Lowest leader should have 1 ETH
      const [lowestIx, lowestAmount] = await parentLeaders.lowestLeader()
      expect(ethVal(lowestAmount)).to.equal(1)

      // Step 2: Deploy child game with 0.75 ETH (not enough to claim leadership)
      const childDeployer = signers[13]
      const txDeploy = await PG(childDeployer).deployChildPyramidGame('Child Game', 'CHILD', 'CHILDL', txValue(0.75))
      const receiptDeploy = await txDeploy.wait()
      const childAddress = receiptDeploy.events.find(e => e.event === 'ChildPyramidDeployed').args.childAddress

      const PyramidGameFactory = await ethers.getContractFactory('PyramidGame')
      const childPyramid = PyramidGameFactory.attach(childAddress)
      const childWalletAddr = await childPyramid.wallet()
      const childLeadersAddr = await childPyramid.leaders()
      const childLeaders = PyramidGameLeadersFactory.attach(childLeadersAddr)

      const PyramidGameWalletFactory = await ethers.getContractFactory('PyramidGameWallet')
      const childWallet = PyramidGameWalletFactory.attach(childWalletAddr)

      // Step 3: Child wallet should have parent ERC20 (0.75)
      const childWalletParentERC20 = ethVal(await PyramidGame.balanceOf(childWalletAddr))
      expect(childWalletParentERC20).to.equal(0.75)
      expect(await parentLeaders.balanceOf(childWalletAddr)).to.equal(0) // No parent NFT yet

      // Step 4: Another participant contributes to child game
      const childParticipant = signers[14]
      await childPyramid.connect(childParticipant).contribute(txValue(0.5))

      // Verify child participant has child NFT, no parent ERC20 or NFTs
      expect(await childLeaders.balanceOf(childParticipant.address)).to.equal(1)
      expect(await PyramidGame.balanceOf(childParticipant.address)).to.equal(0)
      expect(await parentLeaders.balanceOf(childParticipant.address)).to.equal(0)

      // Step 5: Child participant contributes 0.5 ETH to parent, gets parent ERC20
      await PG(childParticipant).contribute(txValue(0.5))
      const childParticipantParentERC20 = ethVal(await PyramidGame.balanceOf(childParticipant.address))
      expect(childParticipantParentERC20).to.equal(0.5)

      // Transfer all parent ERC20 to child wallet
      const tokenAmount = await PyramidGame.balanceOf(childParticipant.address)
      await PyramidGame.connect(childParticipant).transfer(childWalletAddr, tokenAmount)

      // Child wallet should now have 0.75 + 0.5 = 1.25 worth of parent ERC20
      const childWalletTotalERC20 = ethVal(await PyramidGame.balanceOf(childWalletAddr))
      expect(childWalletTotalERC20).to.be.closeTo(1.25, 0.01)

      // Step 6: Both child participants sign for child wallet to claim leadership on parent
      // Prepare claimLeadership call
      const claimLeadershipData = PyramidGame.interface.encodeFunctionData('claimLeadership')
      const txNonce = 1

      // Create message hash using abi.encode (not packed encoding)
      const messageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes', 'uint256'],
          [PyramidGame.address, 0, claimLeadershipData, txNonce]
        )
      )

      // Both child leaders sign (they each own a child NFT)
      // signMessage() automatically adds the EIP-191 prefix
      const sig1 = await childDeployer.signMessage(ethers.utils.arrayify(messageHash))
      const sig2 = await childParticipant.signMessage(ethers.utils.arrayify(messageHash))

      // Execute transaction
      await childWallet.executeLeaderTransaction(
        PyramidGame.address,
        0,
        claimLeadershipData,
        txNonce,
        [0, 1], // token IDs
        [sig1, sig2]
      )

      // Verify child wallet now owns parent NFT and has no parent ERC20
      expect(await parentLeaders.balanceOf(childWalletAddr)).to.equal(1)
      expect(ethVal(await PyramidGame.balanceOf(childWalletAddr))).to.be.closeTo(0, 0.01)

      // Step 7: New participant sends 0.9 ETH to parent
      const childWalletBalanceBefore = ethVal(await ethers.provider.getBalance(childWalletAddr))
      const newParticipant = signers[15]
      await PG(newParticipant).contribute(txValue(0.9))

      // Child wallet should receive distribution
      const childWalletBalanceAfter = ethVal(await ethers.provider.getBalance(childWalletAddr))
      expect(childWalletBalanceAfter).to.be.greaterThan(childWalletBalanceBefore)

      // Step 8: Child participants sign for child wallet to distribute its balance
      const childWalletBalance = await ethers.provider.getBalance(childWalletAddr)
      const distributeData = childPyramid.interface.encodeFunctionData('distribute')
      const txNonce2 = 2

      // Create message hash using abi.encode (not packed encoding)
      // distribute() takes no params, but we pass the balance as msg.value
      const messageHash2 = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes', 'uint256'],
          [childPyramid.address, childWalletBalance, distributeData, txNonce2]
        )
      )

      const sig1_2 = await childDeployer.signMessage(ethers.utils.arrayify(messageHash2))
      const sig2_2 = await childParticipant.signMessage(ethers.utils.arrayify(messageHash2))

      // Get balances before distribution
      const deployerBalanceBefore = ethVal(await ethers.provider.getBalance(childDeployer.address))
      const participantBalanceBefore = ethVal(await ethers.provider.getBalance(childParticipant.address))

      await childWallet.executeLeaderTransaction(
        childPyramid.address,
        childWalletBalance,
        distributeData,
        txNonce2,
        [0, 1],
        [sig1_2, sig2_2]
      )

      // Verify distribution occurred
      const deployerBalanceAfter = ethVal(await ethers.provider.getBalance(childDeployer.address))
      const participantBalanceAfter = ethVal(await ethers.provider.getBalance(childParticipant.address))

      expect(deployerBalanceAfter).to.be.greaterThan(deployerBalanceBefore)
      expect(participantBalanceAfter).to.be.greaterThan(participantBalanceBefore)

      // Child wallet should be nearly empty (just dust from rounding)
      const childWalletFinalBalance = ethVal(await ethers.provider.getBalance(childWalletAddr))
      expect(childWalletFinalBalance).to.be.closeTo(0, 0.01)
    })
  })
})
