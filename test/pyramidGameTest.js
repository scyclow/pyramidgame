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
  return expect(await getBalance(signers[s]) + await sumGasUsed(txs[s])).to.be.closeTo(expectedBalance, 0.00000000001)
}









const ONE_DAY = 60 * 60 * 24
const TEN_MINUTES = 60 * 10
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const safeTransferFrom = 'safeTransferFrom(address,address,uint256)'

const contractBalance = contract => contract.provider.getBalance(contract.address)







let PyramidGame, signers, txs, PG

describe('PyramidGame', () => {
  beforeEach(async () => {
    signers = await ethers.getSigners()
    txs = {}

    for (let i = 0; i < 20; i++) {
      txs[i] = []
    }


    const PyramidGameFactory = await ethers.getContractFactory('PyramidGame', signers[0])


    PyramidGame = await PyramidGameFactory.deploy()
    await PyramidGame.deployed()


    PG = (s) => PyramidGame.connect(signers[s])
  })



  describe('init', () => {
    it('makes the right payments', async () => {
      const contributions = {0:.01}
      const estimatedWinnings = {0:0}
      const payments = {0:[]}
      const forwards = {}

      const top10 = () => Object.entries(contributions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(x => x[0])


      const contribute = async (s, val) => {
        if (!estimatedWinnings[s]) estimatedWinnings[s] = 0
        if (!contributions[s]) contributions[s] = 0
        if (!payments[s]) payments[s] = []

        let leaderTotal = 0
        top10().forEach(j => {
          leaderTotal += contributions[j]
        })

        top10().forEach(j => {
          const recipient = forwards[j] || j

          estimatedWinnings[recipient] += val * (contributions[recipient] / leaderTotal)

          payments[recipient]?.push?.({
            sender: s,
            share: val * (contributions[recipient] / leaderTotal),
            percent: (contributions[recipient] / leaderTotal),
            total: val,
          })
        })



        contributions[s] += val

        const r = await PG(s).contribute(txValue(val))
        txs[s].push(r)
        return r
      }


      const commitForward = async (s, origin) => {
        const r = await PG(s).commitForward(origin)
        txs[s].push(r)
        return r
      }

      const forward = async (s, origin, target) => {
        if (target === ZERO_ADDR) {
          forwards[s] = undefined
        } else {
          forwards[s] = signers.map(s => s.address.toLowerCase()).indexOf(target.toLowerCase())
        }
        const r = await PG(s).forward(origin, target)
        txs[s].push(r)
        return r
      }

      const consolidate = async (s, origin, target, amount) => {
        const ix = signers.map(s => s.address.toLowerCase()).indexOf(target.toLowerCase())

        contributions[s] -= amount
        contributions[ix] += amount


        const r = await PG(s).consolidate(origin, target, toETH(amount))
        txs[s].push(r)
        return r
      }

      const leave = async (s) => {
        contributions[s] = 0
        const r = await PG(s).leave()
        txs[s].push(r)
        return r
      }


      const startingBalances = {}
      for (let i = 0; i < 20; i++) {
        startingBalances[i] = await getBalance(signers[i])
      }



      for (let t = 0; t < 4; t++) {
        for (let i = 0; i < 15; i++) {
          const contribution = !i && !t ? 0.99 : (1 - (i/100))//Math.floor(Math.random() * 100000) / 10000
          await contribute(i, contribution)
        }
      }


      await forward(0, signers[0].address, signers[2].address)

      await contribute(15, 3)

      await forward(0, signers[0].address, ZERO_ADDR)

      await contribute(16, 3)

      await forward(1, signers[1].address, signers[2].address)
      await commitForward(1, signers[1].address)

      await expectRevert(
        forward(1, signers[0].address, ZERO_ADDR),
        'Forward cannot be changed'
      )

      await contribute(12, 1)

      await consolidate(15, signers[15].address, signers[16].address, 2.5)

      for (let i = 0; i < 1; i++) {
        await expectBalanceEquals(i, (startingBalances[i]||0) + (estimatedWinnings[i]||0) - (contributions[i]||0) + (i ? 0 : 0.01))
      }


      const preLeave = await getBalance(signers[0])
      await leave(0)
      await contribute(12, 10)
      const postLeave = await getBalance(signers[0])

      await expect(preLeave).to.be.closeTo(postLeave, 0.0001)


      await expectRevert(
        consolidate(12, signers[12].address, signers[0].address, 5),
        'Leader cannot consolidate'
      )

      await expectRevert(
        consolidate(15, signers[15].address, signers[16].address, 500),
        'Amount exceeds previous contributions'
      )

    })

    it.only('shouldnt break', async () => {
      const ReinvestTestFactory = await ethers.getContractFactory('ReinvestTest', signers[0])
      const ReinvestTest = await ReinvestTestFactory.deploy()
      await ReinvestTest.deployed()


      await PG(0).forward(signers[0].address, ReinvestTest.address)


      await PG(1).contribute(txValue(0.01))

      expect(await getBalance(ReinvestTest)).to.equal(0)
      expect(await getBalance(PyramidGame)).to.equal(0.01)

      const signer0b4 = await getBalance(signers[0])
      const signer1b4 = await getBalance(signers[1])

      await PG(2).forceDistribution()

      expect(await getBalance(signers[1])).to.equal(signer1b4 + 0.005)
      expect(await getBalance(PyramidGame)).to.equal(0.005)


      await PG(0).forward(signers[0].address, ReinvestTest.address)

      await PG(2).forceDistribution()
      expect(await getBalance(signers[1])).to.equal(signer1b4 + 0.0075)

    })

    // TODO check contributions, forwards, commits permissions + delegations

  })


})

