




(if user has erc20 balance or a leaderboard slot)

  <h2>Your Assets:</h2>
    <h3>Total Sent: (sum up all $pyramid + leaderboard contributions from all nfts owned by user)</h3>
    (if total sent > 0)
      <p>This is x% of all contributions made</p>

  (if user is leader)
    <h3>Leaderboard Slot(s) Held: ...</h3>
    <h3>Your Payout: ...</h3> (add up % from all tokens owned)
  (if user has erc20 balance)
    <h3>$PYRAMID BALANCE: ...</h3>

  (if user has erc20 balance)
    (if user is not a leader)
      (if erc20 balance > lowest leader contribution balance)
        "Your $PYRAMID balance is high enough to get on the Leaderboard"
        - button: Claim Leaderboard Slot -> claimLeadership
      (else)
        display lowest leader contribution balance
        succinctly tell user how much more they need to send to get a leaderboard slot


    (for each leaderboard slot nft:)
      <div with border>
        token name
        token image
        recipient address (if different from owner)
        - form to set a recipient address
        (if $PYRAMID balance)
          - form to addToLeaderContributionBalance

      </div>




<h2>Pyramid Games All The Way Down</h2>
  "description placeholder"

  update the create a new child PG form to have the correct interface/fields

  (if any child games)
    display all child PGs (total $, slots filled, etc)



