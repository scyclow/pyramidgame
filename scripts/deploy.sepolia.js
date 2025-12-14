
const toETH = amt => ethers.utils.parseEther(String(amt))
const txValue = amt => ({ value: toETH(amt) })

async function main() {
  const signers = await ethers.getSigners()

  const PyramidGameFactory = await ethers.getContractFactory('PyramidGame', signers[4])
  const PyramidGame = await PyramidGameFactory.deploy(txValue(0.01))
  await PyramidGame.deployed()

  const PG = (s) => PyramidGame.connect(signers[s])

  // Create 12 leaders to fill all leaderboard slots
  // signer[4] has 0.01 ETH from deployment (slot 0, will be lowest)
  await PG(2).contribute(txValue(0.05))   // signer 2 gets slot 1
  await PG(3).contribute(txValue(0.1))    // signer 3 gets slot 2
  await PG(14).contribute(txValue(0.15))  // signer 14 gets slot 3 (will transfer to signer 3)
  await PG(5).contribute(txValue(0.2))
  await PG(6).contribute(txValue(0.3))
  await PG(7).contribute(txValue(0.4))
  await PG(8).contribute(txValue(0.5))
  await PG(9).contribute(txValue(0.6))
  await PG(10).contribute(txValue(0.7))
  await PG(11).contribute(txValue(0.8))
  await PG(12).contribute(txValue(0.9))
  await PG(13).contribute(txValue(1.0))

  // All 12 slots are now filled
  // Lowest leader (signer[4]) has 0.01 ETH

  // Signer 14 transfers their slot (token ID 3) to signer 3
  const leadersAddr = await PyramidGame.leaderboard()
  const PyramidGameLeaderboard = await ethers.getContractAt('PyramidGameLeaderboard', leadersAddr)
  await PyramidGameLeaderboard.connect(signers[14]).transferFrom(signers[14].address, signers[3].address, 3)

  // signer[0] contributes slightly less than threshold (not enough to claim)
  await PG(0).contribute(txValue(0.009))  // Gets 0.009 ETH in PYRAMID (less than 0.01)

  // signer[1] contributes more than threshold (enough to claim)
  await PG(1).contribute(txValue(0.04))   // Gets 0.04 ETH in PYRAMID (more than 0.01)

  // signer[1] transfers some $PYRAMID to signer[2]
  await PG(1).transfer(signers[2].address, ethers.utils.parseEther('0.01'))  // Transfers 0.01 ETH worth of $PYRAMID

  await signers[0].sendTransaction({
    to: '0x8D55ccAb57f3Cba220AB3e3F3b7C9F59529e5a65',
    ...txValue(10)
  })

  const walletAddr = await PyramidGame.wallet()

  console.log('PyramidGame:', PyramidGame.address)
  console.log('PyramidGameLeaderboard:', leadersAddr)
  console.log('PyramidGameWallet:', walletAddr)
  console.log('\nGame State:')
  console.log('- All 12 leaderboard slots filled')
  console.log('- Lowest leader (signer[4]) has 0.01 ETH')
  console.log('- signer[0] has 0.009 ETH in PYRAMID (not enough to claim)')
  console.log('- signer[1] has 0.03 ETH in PYRAMID (can claim leadership!)')
  console.log('- signer[2] has 1 leader slot + 0.01 ETH in PYRAMID')
  console.log('- signer[3] has 2 leader slots')
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });