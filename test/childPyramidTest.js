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

  describe('deployChildPyramidGame', () => {
    it('deploys a minimal proxy clone', async () => {
      const initialAmount = toETH(0.05)
      const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00']

      // Check initial state
      expect(await PyramidGame.totalChildren()).to.equal(0)

      // Deploy child
      const tx = await PG(signers[1]).deployChildPyramidGame(initialAmount, colors)
      const receipt = await tx.wait()

      // Check event was emitted
      const event = receipt.events.find(e => e.event === 'ChildPyramidDeployed')
      expect(event).to.not.be.undefined
      expect(event.args.deployer).to.equal(signers[1].address)

      const childAddress = event.args.childAddress

      // Verify child was added to array
      expect(await PyramidGame.totalChildren()).to.equal(1)
      expect(await PyramidGame.children(0)).to.equal(childAddress)
    })

    it('deploys multiple children and tracks them all', async () => {
      const initialAmount = toETH(0.01)
      const colors = ['#000', '#46ff5a', '#283fff', '#ff1b1b']

      // Deploy three children
      const tx1 = await PG(signers[0]).deployChildPyramidGame(initialAmount, colors)
      const receipt1 = await tx1.wait()
      const child1 = receipt1.events.find(e => e.event === 'ChildPyramidDeployed').args.childAddress

      const tx2 = await PG(signers[1]).deployChildPyramidGame(initialAmount, colors)
      const receipt2 = await tx2.wait()
      const child2 = receipt2.events.find(e => e.event === 'ChildPyramidDeployed').args.childAddress

      const tx3 = await PG(signers[2]).deployChildPyramidGame(initialAmount, colors)
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

    it('child clones can receive contributions', async () => {
      const initialAmount = toETH(0.01)
      const colors = ['#000', '#46ff5a', '#283fff', '#ff1b1b']

      // Deploy child
      const tx = await PG(signers[0]).deployChildPyramidGame(initialAmount, colors)
      const receipt = await tx.wait()
      const childAddress = receipt.events.find(e => e.event === 'ChildPyramidDeployed').args.childAddress

      // Connect to child as PyramidGame
      const PyramidGameFactory = await ethers.getContractFactory('PyramidGame')
      const childPyramid = PyramidGameFactory.attach(childAddress)

      // Contribute to child
      await childPyramid.connect(signers[1]).contribute({ value: toETH(1) })

      // Verify contribution was recorded
      // Note: The child delegates to parent, so state is stored in child's storage
      expect(await childPyramid.contributions(signers[1].address)).to.equal(toETH(1))
    })
  })
})
