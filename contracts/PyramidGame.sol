// SPDX-License-Identifier: MIT

/*

  _____                           _     _
 |  __ \                         (_)   | |
 | |__) |   _ _ __ __ _ _ __ ___  _  __| |
 |  ___/ | | | '__/ _` | '_ ` _ \| |/ _` |
 | |   | |_| | | | (_| | | | | | | | (_| |
 |_|    \__, |_|  \__,_|_| |_| |_|_|\__,_|
    _______/ |
  / ________/
 | |  __  __ _ _ __ ___   ___
 | | |_ |/ _` | '_ ` _ \ / _ \
 | |__| | (_| | | | | | |  __/
  \_____|\__,_|_| |_| |_|\___|



by steviep.eth
2025

*/




pragma solidity ^0.8.28;


interface ERC20 {
  function transfer(address, uint256) external;

}
interface ERC721 {
  function safeTransferFrom(address, address, uint256) external;
  function safeTransferFrom(address, address, uint256, bytes calldata) external;
}

interface ERC1155 {
  function safeTransferFrom(address, address, uint256, uint256, bytes calldata) external;
  function safeBatchTransferFrom(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external;
}

/// @title Pyramid Game
/// @author steviep.eth
/// @notice A pyramid scheme game in which all ETH sent to the contract is split among the top previous senders.
/// Two phases take place when an ETH contribution is made to the Pyramid Game contract: distribution and recaching.
/// The distribution phase splits the contribution among the top 10 previous contributors (i.e. the "Leaders").
/// This split is proportional, based on the cumulative amount of previous contributions made by the leaders.
/// The recaching phase stores the sender's contribution, and then recalculates the top 10 contributors
/// All players can optionally forward payments to another address.
/// All non-leaders can consolidate their contributions with another player's contributions.
/// All players can delegate forward and consolidation permissions to another operator.
contract PyramidGame {
  uint constant public SLOTS = 10;
  address[SLOTS] public leaders;

  mapping(address => uint256) public contributions;
  mapping(address => address) public forwards;
  mapping(address => bool) public commitments;
  mapping(address => address) public delegations;

  event Contribution(address addr, uint256 amount);
  event Distribution(address addr, uint256 amount);

  address public tokenManager;

  constructor() {
    tokenManager = msg.sender;
    leaders[0] = msg.sender;
    contributions[msg.sender] = 0.01 ether;
  }

  /// @notice Denotes whether an address is a top-10 contributor, and will receive a distribution
  /// when the Pyramid Game contract receives funds.
  function isLeader(address account) public view returns (bool) {
    for (uint8 i; i < SLOTS; i++) {
      if (leaders[i] == account) return true;
    }
    return false;
  }

  /// @notice The total amount of ETH contributed by all current leaders.
  function leaderSum() public view returns (uint256) {
    uint256 sum;
    for (uint8 ix; ix < SLOTS; ix++) {
      sum += leaderContributions(ix);
    }

    return sum;
  }

  /// @notice The total amount of ETH contributed by individual leaders.
  /// @param ix The index of the leader in the leaders list
  /// @return Total contributions of the the address
  function leaderContributions(uint8 ix) public view returns (uint256) {
    return contributions[leaders[ix]];
  }


  /// @notice All sends to the contract trigger contribution functionality. There is no difference
  /// between doing this and calling `contribute`.
  receive () external payable {
    _contribute();
  }

  /// @notice Explicitly make a contribution. There is no difference between calling this function and sending to the contract.
  function contribute() external payable {
    _contribute();
  }

  /// @notice Designates a target address for which all leader distributions will be forwarded to.
  /// @dev This action can be delecated to an operator.
  function forward(address origin, address target) external onlyOriginOrDelegate(origin) {
    require(!commitments[origin], 'Forward cannot be changed');
    forwards[origin] = target;
  }

  /// @notice Commits a forward. This cannot be undone.
  /// @dev This action can be delecated to an operator.
  function commitForward(address origin) external onlyOriginOrDelegate(origin) {
    commitments[origin] = true;
  }

  /// @notice Credits the origin's total contribution amount and debits the target's total contribution amount.
  /// @dev This action can be delecated to an operator.
  /// @dev The origin address cannot be an active leader. This restriction prevents players from dropping off
  /// the leaderboard and leaving an empty slot.
  function consolidate(address origin, address target, uint256 amount) external onlyOriginOrDelegate(origin) {
    require(!isLeader(msg.sender), 'Leader cannot consolidate');
    require(contributions[msg.sender] >= amount, 'Amount exceeds previous contributions');

    contributions[msg.sender] -= amount;

    _reCache(target, amount);
  }

  /// @notice Renounces the sender's previous contributions, and removes them from the leaderboard.
  /// @dev This may leave an empty slot.
  function leave() external {
    contributions[msg.sender] = 0;
  }

  /// @notice Delegates an operator to take forward and consolidation actions.
  function delegate(address operator) external {
    delegations[msg.sender] = operator;
  }

  modifier onlyOriginOrDelegate(address account) {
    require(account == msg.sender || delegations[account] == msg.sender);
    _;
  }

  /// @dev Force a distribution if the contract accrues a balance. This may occur if
  /// distributions are directly or indirectly forwarded back to the contract.
  function forceDistribution() external ignoreReentry {
    _distribute(address(this).balance);
  }


  bool transient locked;
  modifier ignoreReentry {
    if (locked) return;
    locked = true;

    _;

    locked = false;
  }

  /// @dev Reentry is ignored instead of disallowed in order to safeguard against recursive
  /// distributions. Setting a forward address to the Pyramid Game contract would otherwise
  /// lead to an infinite loop. Throwing an error in this case would completely brick all
  /// contributions. Any balance accrued by the contract from failed reentries can be manually
  /// distributed through `forceDistribution`.
  function _contribute() private ignoreReentry {
    _distribute(msg.value);
    _reCache(msg.sender, msg.value);
    emit Contribution(msg.sender, msg.value);
  }


  /// @dev Given the cached top 10 contributors (the leaders): calculate the total contribution amounts
  /// of all leaders, determine each leader's percentage of the sum, and distribute the original contribution
  /// proportionally.
  function _distribute(uint256 amount) private {
    uint256 sum = leaderSum();

    for (uint8 ix; ix < SLOTS; ix++) {
      if (leaders[ix] == address(0)) return;

      uint256 amountToTransfer = (amount * leaderContributions(ix)) / sum;
      address recipient = forwards[leaders[ix]] == address(0) ? leaders[ix] : forwards[leaders[ix]];

      (bool distributionMade,) = payable(recipient).call{value: amountToTransfer}('');

      if (distributionMade) {
        emit Distribution(recipient, amountToTransfer);
      }
    }
  }

  /// @dev After the distribution has been made, credit the sender's total contribution amount
  /// and recalculate the leaderboard.
  function _reCache(address contributor, uint256 amount) private {
    bool existingContribution = contributions[contributor] > 0;

    contributions[contributor] += amount;

    if (leaderContributions(9) == 0) {
      _setFirstEmptySlot(contributor);
    } else {
      _replaceLowestLeader(contributor);
    }
  }

  /// @dev If there are fewer than 10 contributors, designate the first empty slot to the sender.
  function _setFirstEmptySlot(address contributor) private {
    for (uint8 ix; ix < SLOTS; ix++) {
      if (leaders[ix] == contributor) {
        return;
      } else if (leaderContributions(ix) == 0) {
        leaders[ix] = contributor;
        return;
      }
    }
  }

  /// @dev Find the leader with the lowest total contribution amount and replace them with the sender.
  function _replaceLowestLeader(address contributor) private {
    uint8 lowestLeaderIx;

    for (uint8 ix = 0; ix < SLOTS; ix++) {
      if (leaders[ix] == contributor) return;

      if (leaderContributions(ix) < leaderContributions(lowestLeaderIx)) {
        lowestLeaderIx = ix;
      }
    }

    if (leaderContributions(lowestLeaderIx) < contributions[contributor]) {
      leaders[lowestLeaderIx] = contributor;

    }
  }






  // RECOVER ERC20s, ERC721s, ERC1155s

  modifier onlyTokenManager() {
    require(msg.sender == tokenManager, 'Only TokenManager can perform this action');
    _;
  }

  /// @notice Transfer the token manager role to another address.
  function transferTokenManager(address newManager) external onlyTokenManager {
    tokenManager = newManager;
  }

  /// @notice Recover all ERC20 tokens sent to the contract.
  function transferERC20(address contractAddr, uint256 amount) external onlyTokenManager {
    ERC20(contractAddr).transfer(contractAddr, amount);
  }

  /// @notice Recover all ERC721 tokens sent to the contract.
  function transferERC721(address contractAddr, address to, uint256 tokenId) external onlyTokenManager {
    ERC721(contractAddr).safeTransferFrom(address(this), to, tokenId);
  }

  /// @notice Recover all ERC721 tokens sent to the contract.
  function transferERC721(address contractAddr, address to, uint256 tokenId, bytes calldata data) external onlyTokenManager {
    ERC721(contractAddr).safeTransferFrom(address(this), to, tokenId, data);
  }

  /// @notice Recover all ERC1155 tokens sent to the contract.
  function transferERC1155(address contractAddr, address to, uint256 id, uint256 amount, bytes calldata data) external onlyTokenManager {
    ERC1155(contractAddr).safeTransferFrom(address(this), to, id, amount, data);
  }

  /// @notice Recover all ERC1155 tokens sent to the contract.
  function transferERC1155(address contractAddr, address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data) external onlyTokenManager {
    ERC1155(contractAddr).safeBatchTransferFrom(address(this), to, ids, amounts, data);
  }

  function onERC721Received(address, address, uint256, bytes calldata) external pure returns(bytes4) {
    return this.onERC721Received.selector;
  }

  function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
    return this.onERC1155Received.selector;
  }

  function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
    return this.onERC1155BatchReceived.selector;
  }
}