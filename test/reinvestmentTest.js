const { expect } = require('chai')
const { ethers } = require('hardhat')
const { expectRevert } = require('@openzeppelin/test-helpers')

const toETH = amt => ethers.utils.parseEther(String(amt))
const txValue = amt => ({ value: toETH(amt) })
const ethVal = n => Number(ethers.utils.formatEther(n))

const getBalance = async a => ethVal(await ethers.provider.getBalance(a.address))

const send = (from, to, amount) => from.sendTransaction({ to: to.address, ...txValue(amount) })

let PyramidGame, PyramidGameLeaders, signers, PG, PGL

describe('PyramidGame Reinvestment', () => {
  beforeEach(async () => {
    signers = await ethers.getSigners()

    const PyramidGameFactory = await ethers.getContractFactory('PyramidGame', signers[0])
    const PyramidGameLeadersFactory = await ethers.getContractFactory('PyramidGameLeaders', signers[0])
    const PyramidGameLeaderURIFactory = await ethers.getContractFactory('PyramidGameLeaderURI', signers[0])

    const initialAmount = ethers.utils.parseEther('0.01')
    const colors = ['#000', '#46ff5a', '#283fff', '#ff1b1b']

    PyramidGameLeaderURI = await PyramidGameLeaderURIFactory.deploy()
    await PyramidGameLeaderURI.deployed()

    PyramidGame = await PyramidGameFactory.deploy(initialAmount, colors, PyramidGameLeaderURI.address)
    await PyramidGame.deployed()
    PyramidGameLeaders = await PyramidGameLeadersFactory.attach(
      await PyramidGame.leaders()
    )

    PG = (s) => PyramidGame.connect(s)
    PGL = (s) => PyramidGameLeaders.connect(s)
  })

  describe('Single leader reinvestment', () => {
    it('correctly handles one leader reinvesting with 12 equal leaders', async () => {
      // Setup: Create 12 leaders with 100 ETH each
      // Note: Signer 0 contributes 99.99 to account for 0.01 initial balance
      await PG(signers[0]).contribute(txValue(99.99))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(100))
      }

      // Verify initial state (all leaders have 100 ETH)
      for (let i = 0; i < 12; i++) {
        expect(ethVal(await PGL(signers[0]).contributions(i))).to.be.closeTo(100, 0.000001)
      }
      expect(ethVal(await PGL(signers[0]).contributionTotal())).to.be.closeTo(1200, 0.000001)

      // Leader 0 opts to reinvest
      await PGL(signers[0]).setReinvestment(0, true)
      expect(await PGL(signers[0]).isReinvested(0)).to.equal(true)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.closeTo(100, 0.000001)

      // Record balances before contribution
      const balancesBefore = []
      for (let i = 1; i < 12; i++) {
        balancesBefore[i] = await getBalance(signers[i])
      }

      // Random person contributes 1 ETH
      const contribution = 1
      await PG(signers[15]).contribute(txValue(contribution))

      // Calculate expected values
      const totalContributions = 1200
      const leaderContribution = 100
      const reinvestedTotal = leaderContribution
      const payoutShares = totalContributions - reinvestedTotal

      // Verify payouts for leaders 1-11
      for (let i = 1; i < 12; i++) {
        const balanceAfter = await getBalance(signers[i])
        const expectedIncrease = (contribution * leaderContribution) / payoutShares
        expect(balanceAfter - balancesBefore[i]).to.be.closeTo(expectedIncrease, 0.0001)
      }

      // Verify leader 0's contribution increased (infinite reinvestment)
      const leader0Contribution = ethVal(await PGL(signers[0]).contributions(0))
      const leader0Increase = (contribution * leaderContribution) / payoutShares
      expect(leader0Contribution).to.be.closeTo(leaderContribution + leader0Increase, 0.000001)

      // Verify other leaders' contributions unchanged
      for (let i = 1; i < 12; i++) {
        expect(ethVal(await PGL(signers[0]).contributions(i))).to.be.closeTo(leaderContribution, 0.000001)
      }

      // Verify total contributions increased
      expect(ethVal(await PGL(signers[0]).contributionTotal())).to.be.closeTo(totalContributions + leader0Increase, 0.000001)
    })
  })

  describe('Multiple leaders reinvestment', () => {
    it('correctly handles two leaders reinvesting with 12 equal leaders', async () => {
      // Setup: Create 12 leaders with 100 ETH each
      await PG(signers[0]).contribute(txValue(99.99))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(100))
      }

      // Leaders 0 and 1 opt to reinvest
      await PGL(signers[0]).setReinvestment(0, true)
      await PGL(signers[1]).setReinvestment(1, true)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.closeTo(200, 0.000001)

      // Record balances before contribution
      const balancesBefore = []
      for (let i = 2; i < 12; i++) {
        balancesBefore[i] = await getBalance(signers[i])
      }

      // Random person contributes 1 ETH
      const contribution = 1
      await PG(signers[15]).contribute(txValue(contribution))

      // Calculate expected values
      const totalContributions = 1200
      const leaderContribution = 100
      const reinvestedTotal = 200
      const payoutShares = totalContributions - reinvestedTotal

      // Verify payouts for leaders 2-11
      for (let i = 2; i < 12; i++) {
        const balanceAfter = await getBalance(signers[i])
        const expectedIncrease = (contribution * leaderContribution) / payoutShares
        expect(balanceAfter - balancesBefore[i]).to.be.closeTo(expectedIncrease, 0.0001)
      }

      // Verify leaders 0 and 1's contributions each increased
      const reinvestIncrease = (contribution * leaderContribution) / payoutShares
      expect(ethVal(await PGL(signers[0]).contributions(0))).to.be.closeTo(leaderContribution + reinvestIncrease, 0.000001)
      expect(ethVal(await PGL(signers[0]).contributions(1))).to.be.closeTo(leaderContribution + reinvestIncrease, 0.000001)

      // Verify other leaders' contributions unchanged
      for (let i = 2; i < 12; i++) {
        expect(ethVal(await PGL(signers[0]).contributions(i))).to.be.closeTo(leaderContribution, 0.000001)
      }

      // Verify total contributions increased
      const totalIncrease = reinvestIncrease * 2 // Two leaders reinvesting
      expect(ethVal(await PGL(signers[0]).contributionTotal())).to.be.closeTo(totalContributions + totalIncrease, 0.000001)
    })

    it('correctly handles all leaders reinvesting', async () => {
      // Setup: Create 12 leaders with 100 ETH each
      await PG(signers[0]).contribute(txValue(99.99))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(100))
      }

      // All leaders opt to reinvest
      for (let i = 0; i < 12; i++) {
        await PGL(signers[i]).setReinvestment(i, true)
      }
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.closeTo(1200, 0.000001)

      // Random person contributes 1 ETH
      const contribution = 1
      await PG(signers[15]).contribute(txValue(contribution))

      // Calculate expected values
      const totalContributions = 1200
      const leaderContribution = 100
      const numLeaders = 12
      const reinvestIncrease = contribution / numLeaders

      // Verify each leader's contribution increased
      for (let i = 0; i < numLeaders; i++) {
        expect(ethVal(await PGL(signers[0]).contributions(i))).to.be.closeTo(leaderContribution + reinvestIncrease, 0.000001)
      }

      // Verify total contributions increased by full contribution amount
      expect(ethVal(await PGL(signers[0]).contributionTotal())).to.be.closeTo(totalContributions + contribution, 0.000001)

      // Verify contract holds the contribution (no payouts were made)
      expect(ethVal(await ethers.provider.getBalance(PyramidGame.address))).to.be.closeTo(contribution, 0.000001)
    })
  })

  describe('Unequal contributions with reinvestment', () => {
    it('correctly handles reinvestment with varying contribution amounts', async () => {
      // Setup: Create 12 leaders with different contribution amounts
      const amounts = [50, 100, 150, 200, 50, 100, 150, 200, 50, 100, 150, 200]
      await PG(signers[0]).contribute(txValue(amounts[0] - 0.01))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(amounts[i]))
      }

      const totalContributions = amounts.reduce((a, c) => a + c, 0)

      // Leaders 0 and 2 opt to reinvest
      await PGL(signers[0]).setReinvestment(0, true)
      await PGL(signers[2]).setReinvestment(2, true)

      const leader0Contribution = amounts[0]
      const leader2Contribution = amounts[2]
      const reinvestedTotal = leader0Contribution + leader2Contribution
      const payoutShares = totalContributions - reinvestedTotal

      // Record balances before contribution
      const balancesBefore = []
      for (let i = 1; i < 12; i++) {
        if (i !== 2) {
          balancesBefore[i] = await getBalance(signers[i])
        }
      }

      // Random person contributes 1 ETH
      const contribution = 1
      await PG(signers[15]).contribute(txValue(contribution))

      // Verify payouts (proportional to contribution amount)
      const leader1Payout = (contribution * amounts[1]) / payoutShares
      const leader3Payout = (contribution * amounts[3]) / payoutShares
      expect(await getBalance(signers[1]) - balancesBefore[1]).to.be.closeTo(leader1Payout, 0.0001)
      expect(await getBalance(signers[3]) - balancesBefore[3]).to.be.closeTo(leader3Payout, 0.0001)

      // Verify reinvesting leaders' contributions increased
      const leader0Increase = (contribution * leader0Contribution) / payoutShares
      const leader2Increase = (contribution * leader2Contribution) / payoutShares
      expect(ethVal(await PGL(signers[0]).contributions(0))).to.be.closeTo(leader0Contribution + leader0Increase, 0.000001)
      expect(ethVal(await PGL(signers[0]).contributions(2))).to.be.closeTo(leader2Contribution + leader2Increase, 0.000001)
    })
  })

  describe('Reinvestment permissions', () => {
    it('only allows token owner to set reinvestment', async () => {
      // Setup: Create 12 leaders with 100 ETH each
      await PG(signers[0]).contribute(txValue(99.99))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(100))
      }

      // Signer 1 owns token 1, try to have signer 2 set reinvestment on it
      await expectRevert(
        PGL(signers[2]).setReinvestment(1, true),
        'Only token owner can perform this action'
      )

      // Verify the owner CAN set it
      await PGL(signers[1]).setReinvestment(1, true)
      expect(await PGL(signers[0]).isReinvested(1)).to.equal(true)
    })
  })

  describe('Toggling reinvestment', () => {
    it('allows leaders to toggle reinvestment on and off', async () => {
      // Setup: Create 12 leaders with 100 ETH each
      await PG(signers[0]).contribute(txValue(99.99))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(100))
      }

      // Leader 0 enables reinvestment
      await PGL(signers[0]).setReinvestment(0, true)
      expect(await PGL(signers[0]).isReinvested(0)).to.equal(true)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.closeTo(100, 0.000001)

      // Contribution happens - leader 0 should reinvest
      await PG(signers[15]).contribute(txValue(1))
      expect(ethVal(await PGL(signers[0]).contributions(0))).to.be.closeTo(100 + 1/11, 0.000001)

      // Leader 0 disables reinvestment
      await PGL(signers[0]).setReinvestment(0, false)
      expect(await PGL(signers[0]).isReinvested(0)).to.equal(false)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.closeTo(0, 0.000001)

      // Record balance before next contribution
      const balanceBefore = await getBalance(signers[0])

      // Contribution happens - leader 0 should receive payout now
      await PG(signers[16]).contribute(txValue(1))

      const balanceAfter = await getBalance(signers[0])
      // Leader 0 should receive approximately their share
      expect(balanceAfter - balanceBefore).to.be.greaterThan(0.08) // roughly 1/12
    })

    it('does not change state if setting to the same value', async () => {
      // Setup: Create 12 leaders
      await PG(signers[0]).contribute(txValue(99.99))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(100))
      }

      // Enable reinvestment
      await PGL(signers[0]).setReinvestment(0, true)
      const reinvestedTotalAfterFirst = ethVal(await PGL(signers[0]).reinvestedTotal())

      // Try to enable again (should be no-op)
      await PGL(signers[0]).setReinvestment(0, true)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.equal(reinvestedTotalAfterFirst)

      // Disable reinvestment
      await PGL(signers[0]).setReinvestment(0, false)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.closeTo(0, 0.000001)

      // Try to disable again (should be no-op)
      await PGL(signers[0]).setReinvestment(0, false)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.closeTo(0, 0.000001)
    })
  })

  describe('Reinvestment with leader changes', () => {
    it('correctly updates reinvestedTotal when a reinvesting leader is replaced', async () => {
      // Setup: Create 12 leaders with 1 ETH each
      await PG(signers[0]).contribute(txValue(0.99))
      for (let i = 1; i < 12; i++) {
        await PG(signers[i]).contribute(txValue(1))
      }

      // Leader 0 enables reinvestment
      await PGL(signers[0]).setReinvestment(0, true)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.closeTo(1, 0.000001)

      const reinvestedTotalBefore = ethVal(await PGL(signers[0]).reinvestedTotal())

      // New person contributes 2 ETH
      // Token 0 will reinvest and increase, so it won't be the lowest anymore
      // Signer 15 should replace the lowest leader (probably token 1 with 1 ETH)
      await PG(signers[15]).contribute(txValue(2))

      // Find which token signer 15 owns
      let signer15TokenId = null
      for (let i = 0; i < 12; i++) {
        if (await PGL(signers[0]).ownerOf(i) === signers[15].address) {
          signer15TokenId = i
          break
        }
      }

      expect(signer15TokenId).to.not.equal(null)

      // The replaced token should have its reinvestment flag cleared (via _beforeTokenTransfer)
      expect(await PGL(signers[0]).isReinvested(signer15TokenId)).to.equal(false)

      // Token 0 should still be reinvesting
      expect(await PGL(signers[0]).isReinvested(0)).to.equal(true)

      // reinvestedTotal should have increased (token 0's contribution increased)
      expect(ethVal(await PGL(signers[0]).reinvestedTotal())).to.be.greaterThan(reinvestedTotalBefore)
    })
  })
})
