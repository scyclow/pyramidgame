
const toETH = amt => ethers.utils.parseEther(String(amt))
const txValue = amt => ({ value: toETH(amt) })

async function main() {
    const signers = await ethers.getSigners()

    picker = signers[0]
    marketMaker = signers[1]
    predicter1 = signers[2]
    predicter2 = signers[3]


    const PredictTheNumberFactory = await ethers.getContractFactory('PredictTheNumber', picker)
    const NumberCoinFactory = await ethers.getContractFactory('NumberCoin', picker)

    PredictTheNumber = await PredictTheNumberFactory.deploy()
    await PredictTheNumber.deployed()


    ONE = await NumberCoinFactory.attach(
      await PredictTheNumber.ONE()
    )
    TWO = await NumberCoinFactory.attach(
      await PredictTheNumber.TWO()
    )
    THREE = await NumberCoinFactory.attach(
      await PredictTheNumber.THREE()
    )
    FOUR = await NumberCoinFactory.attach(
      await PredictTheNumber.FOUR()
    )
    FIVE = await NumberCoinFactory.attach(
      await PredictTheNumber.FIVE()
    )

    await PredictTheNumber.connect(marketMaker).create(txValue('1'))


    allCoins = [ONE, TWO, THREE, FOUR, FIVE]


  console.log(`PredictTheNumber:`, PredictTheNumber.address)
  console.log(`ONE:`, ONE.address)
  console.log(`TWO:`, TWO.address)
  console.log(`THREE:`, THREE.address)
  console.log(`FOUR:`, FOUR.address)
  console.log(`FIVE:`, FIVE.address)

}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });