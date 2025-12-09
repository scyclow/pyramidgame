
const toETH = amt => ethers.utils.parseEther(String(amt))
const txValue = amt => ({ value: toETH(amt) })

async function main() {
  const signers = await ethers.getSigners()

  const PyramidGameFactory = await ethers.getContractFactory('PyramidGame', signers[0])
  const PyramidGame = await PyramidGameFactory.deploy(txValue(0.01))
  await PyramidGame.deployed()

  const PG = (s) => PyramidGame.connect(signers[s])



  await PG(0).contribute(txValue(0.99))

  for (let i = 1; i< 13; i++) await PG(i).contribute(txValue(i* 0.01 + 0.01))

  await signers[0].sendTransaction({
    to: '0x8D55ccAb57f3Cba220AB3e3F3b7C9F59529e5a65',
    ...txValue(10)
  })

  const leadersAddr = await PyramidGame.leaders()
  const walletAddr = await PyramidGame.wallet()

  console.log('PyramidGame:', PyramidGame.address)
  console.log('PyramidGameLeaders:', leadersAddr)
  console.log('PyramidGameWallet:', walletAddr)
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });