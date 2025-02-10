


async function main() {
    const signers = await ethers.getSigners()

    picker = signers[0]
    marketMaker = signers[1]
    predicter1 = signers[2]
    predicter2 = signers[3]


    const PredictBaseFactory = await ethers.getContractFactory('PredictBase', picker)
    const PredictCoinFactory = await ethers.getContractFactory('PredictCoin', picker)

    PredictBase = await PredictBaseFactory.deploy()
    await PredictBase.deployed()


    ONE = await PredictCoinFactory.attach(
      await PredictBase.ONE()
    )
    TWO = await PredictCoinFactory.attach(
      await PredictBase.TWO()
    )
    THREE = await PredictCoinFactory.attach(
      await PredictBase.THREE()
    )
    FOUR = await PredictCoinFactory.attach(
      await PredictBase.FOUR()
    )
    FIVE = await PredictCoinFactory.attach(
      await PredictBase.FIVE()
    )

    allCoins = [ONE, TWO, THREE, FOUR, FIVE]


  console.log(`PredictBase:`, PredictBase.address)
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