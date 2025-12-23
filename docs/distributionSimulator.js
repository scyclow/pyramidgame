/**
 * Simulates the Pyramid Game distribution logic using a state machine
 * Based on the logic in test/pyramidGameTest.js
 *
 * @param {Array} contributionEvents - Array of Contribution events with {sender, amount, blockNumber, logIndex}
 * @param {Array} transferEvents - Array of Transfer events for leaderboard NFTs with {from, to, tokenId, blockNumber, logIndex}
 * @param {number} maxLeaders - Maximum number of leader slots (typically 12)
 * @param {string} parentAddr - Parent address of the game (deployer for root, PyramidGame for child)
 * @returns {Object} { sentTotals: {[addr]: val}, receivedTotals: {[addr]: val} }
 */
export function simulateDistributions(contributionEvents, transferEvents, maxLeaders = 12, parentAddr = null) {
  const sentTotals = {} // address -> total ETH sent
  const receivedTotals = {} // address -> total ETH received

  const tokenContributions = {} // tokenId -> contribution balance
  const tokenOwners = {} // tokenId -> owner address
  const tokenRecipients = {} // tokenId -> recipient address (defaults to owner)
  const coinBalances = {} // address -> $PYRAMID balance

  const ethVal = n => Number(window.ethers.utils.formatEther(n))

  // Combine and sort all events by block number and log index
  const allEvents = [
    ...contributionEvents.map(e => ({ ...e, type: 'contribution' })),
    ...transferEvents.map(e => ({ ...e, type: 'transfer' }))
  ].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
    return (a.logIndex || 0) - (b.logIndex || 0)
  })

  // Helper: Find lowest leader token
  function lowestLeaderToken() {
    let lowestId = null
    let lowestAmount = Infinity

    for (const [tokenId, contribution] of Object.entries(tokenContributions)) {
      if (contribution < lowestAmount) {
        lowestAmount = contribution
        lowestId = tokenId
      }
    }

    return { tokenId: lowestId, amount: lowestAmount }
  }

  // Helper: Reorg logic when a non-leader contributes
  function reorg(sender, amount) {
    const numTokens = Object.keys(tokenOwners).length

    // Not all leader tokens have been allocated yet
    if (numTokens < maxLeaders) {
      const tokenId = numTokens
      tokenOwners[tokenId] = sender
      tokenRecipients[tokenId] = sender
      tokenContributions[tokenId] = amount
    } else {
      // All slots filled - check if sender can replace lowest leader
      const lowest = lowestLeaderToken()
      const senderTotal = amount + (coinBalances[sender] || 0)

      if (senderTotal > lowest.amount) {
        // Replace lowest leader
        const oldOwner = tokenOwners[lowest.tokenId]

        // Give old leader their contribution as $PYRAMID
        coinBalances[oldOwner] = lowest.amount

        // Update token
        tokenOwners[lowest.tokenId] = sender
        tokenRecipients[lowest.tokenId] = sender
        tokenContributions[lowest.tokenId] = senderTotal

        // Burn sender's $PYRAMID
        coinBalances[sender] = 0
      } else {
        // Sender gets $PYRAMID instead
        coinBalances[sender] = (coinBalances[sender] || 0) + amount
      }
    }
  }

  // Track if we've seen the first contribution (initialization)
  let isFirstContribution = true

  // Process events in chronological order
  for (const event of allEvents) {
    if (event.type === 'transfer') {
      const tokenId = Number(event.tokenId)
      const to = event.to.toLowerCase()
      const from = event.from.toLowerCase()

      // Mint
      if (from === window.ethers.constants.AddressZero.toLowerCase()) {
        tokenOwners[tokenId] = to
        tokenRecipients[tokenId] = to
        if (tokenContributions[tokenId] === undefined) {
          tokenContributions[tokenId] = 0
        }
      } else {
        // Transfer - update owner and reset recipient to new owner
        tokenOwners[tokenId] = to
        tokenRecipients[tokenId] = to
      }
    } else if (event.type === 'contribution') {
      const amount = ethVal(event.amount)
      const sender = event.sender.toLowerCase()

      // Handle initial contribution specially
      if (isFirstContribution && parentAddr) {
        isFirstContribution = false
        const parent = parentAddr.toLowerCase()

        // Track total sent for deployer
        sentTotals[sender] = (sentTotals[sender] || 0) + amount

        // For root game: deployer gets refunded (parent == sender)
        // For child game: parent receives the initial ETH
        receivedTotals[parent] = (receivedTotals[parent] || 0) + amount

        // Skip the distribution logic for initialization
        // The first token (0) starts with this contribution but no distribution happens
        const numTokens = Object.keys(tokenOwners).length
        if (numTokens < maxLeaders) {
          const tokenId = numTokens
          tokenOwners[tokenId] = sender
          tokenRecipients[tokenId] = sender
          tokenContributions[tokenId] = amount
        }
        continue
      }

      // Track total sent
      sentTotals[sender] = (sentTotals[sender] || 0) + amount

      // Calculate total leader contributions
      const leaderTotal = Object.values(tokenContributions).reduce((sum, c) => sum + c, 0)

      // Distribute to all current leaders
      if (leaderTotal > 0) {
        for (const [tokenId, contribution] of Object.entries(tokenContributions)) {
          const recipient = tokenRecipients[tokenId]
          const share = amount * (contribution / leaderTotal)

          receivedTotals[recipient] = (receivedTotals[recipient] || 0) + share
        }
      }

      // Update state based on reorg logic
      const senderOwnsToken = Object.keys(tokenOwners).find(
        id => tokenOwners[id] === sender
      )

      if (senderOwnsToken !== undefined) {
        // Sender owns a token - increment its contribution
        tokenContributions[senderOwnsToken] += amount
      } else {
        // Sender doesn't own a token - run reorg
        reorg(sender, amount)
      }
    }
  }

  return { sentTotals, receivedTotals }
}
