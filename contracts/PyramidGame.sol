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


import "./Dependencies.sol";
import "./PyramidGameLeaderboard.sol";
import "./PyramidGameWallet.sol";


pragma solidity ^0.8.30;


/// @title Pyramid Game
/// @author steviep.eth
/// @notice A pyramid scheme game in which all ETH sent to the contract is split proportionally among the top previous senders.
/// Two phases take place when an ETH contribution is made to the Pyramid Game contract: DISTRIBUTION and REORG.
/// The DISTRIBUTION phase splits the contribution among the Leaders.
/// This split is proportional, based on how much Leaders have directly or indirectly contributed.
/// The REORG phase then recalculates the contribution totals and determines the new Leaders.
/// Leadership is managed by a LEADERBOARD NFT, which can be transfered to another address.
/// The LEADERBOARD NFT is automatically transferred upon Leadership recalculation if necessary.
/// Contribution amounts are managed by an ERC-20 token, $PYRAMID.
/// New $PYRAMID is minted to contributors when they fail to become a Leader, and when former Leaders are kicked off the Leader Board.
/// $PYRAMID is burned when a contributor becomes a Leader.
/// The total circulating $PYRAMID supply equals the total historical ETH contributions made, minus the sum of all contributions associated with current Leaders.
contract PyramidGame is ERC20 {
  uint8 constant public SLOTS = 12;
  uint8 constant public INVALID_SLOT = SLOTS + 1;

  /// @notice The Leaders contract managing the leader NFTs and contribution balances
  PyramidGameLeaderboard public leaderboard;

  /// @notice The Wallet contract controlled by majority of leaders for governance actions
  PyramidGameWallet public wallet;

  /// @notice Array of child pyramid game addresses deployed from this pyramid
  address[] public children;

  /// @notice The parent pyramid or deployer address (EOA for root pyramids, contract address for child pyramids)
  address public parent;

  /// @dev Flag to ensure initialize() can only be called once
  bool private initialized;

  /// @dev Custom name and symbol for this instance (allows child pyramids to have custom branding)
  string private _customName;
  string private _customSymbol;

  event Contribution(address indexed sender, uint256 amount);
  event ChildPyramidDeployed(address indexed childAddress, address indexed deployer, uint256 initialAmount);

  constructor() payable ERC20("Pyramid Game", "PYRAMID") {
    initialize(msg.sender, '', '', '');
  }

  /// @notice Returns the name of the token
  function name() public view virtual override returns (string memory) {
    return bytes(_customName).length > 0 ? _customName : super.name();
  }

  /// @notice Returns the symbol of the token
  function symbol() public view virtual override returns (string memory) {
    return bytes(_customSymbol).length > 0 ? _customSymbol : super.symbol();
  }



  /// @notice Initialize the Pyramid Game instance
  /// @dev Can only be called once. Called by constructor for normal deployments, or manually for proxy clones.
  ///      Creates the Leaderboard NFT contract and Wallet governance contract.
  ///      The wallet receives msg.value and transfers it to the parent (deployer for root, parent pyramid for children).
  /// @param deployer The address that will receive the first leader NFT (token ID 0)
  /// @param gameName The name of the game/ERC20 token (e.g., "Pyramid Game"). Empty string uses default from constructor.
  /// @param tokenSymbol The symbol of the ERC20 token (e.g., "PYRAMID"). Empty string uses default from constructor.
  /// @param leaderSymbol The symbol of the leader NFT (e.g., "LEADER"). Empty string uses default "LEADER".
  function initialize(
    address deployer,
    string memory gameName,
    string memory tokenSymbol,
    string memory leaderSymbol
  ) public payable {
    require(msg.value > 0, 'Must include starting bid');
    require(!initialized);
    initialized = true;
    parent = msg.sender;
    _customName = gameName;
    _customSymbol = tokenSymbol;

    string memory nftName = bytes(gameName).length > 0
      ? string(abi.encodePacked(gameName, " Leaderboard"))
      : "Pyramid Game Leaderboard";
    string memory nftSymbol = bytes(leaderSymbol).length > 0 ? leaderSymbol : "LEADER";

    leaderboard = new PyramidGameLeaderboard(deployer, SLOTS, msg.value, nftName, nftSymbol);
    wallet = new PyramidGameWallet{value: msg.value}(address(this), address(leaderboard), payable(msg.sender));

    emit Contribution(msg.sender, msg.value);
  }


  ////// CONTRIBUTIONS

  /// @notice View a participant's direct and indirect contributions
  function outstandingContributions(address contributor) public view returns (uint256) {
    return balanceOf(contributor);
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

  /// @notice Claims Leadership role for the caller if they have amassed enough $PYRAMID.
  function claimLeaderboardSlot() external {
    _reorg(msg.sender, 0);
  }


  /// @notice Allows existing leaders to burn $PYRAMID and increment their LEADER token's contribution balance
  function addToLeaderContributionBalance(uint256 tokenId, uint256 tokenAmount) external {
    _burn(msg.sender, tokenAmount);
    leaderboard.incrementContributionBalance(tokenId, tokenAmount);
  }


  /// @notice Force a distribution if the contract accrues a balance
  /// @dev This may occur if distributions are directly or indirectly forwarded back to the contract.
  ///      Distributes the entire contract balance to leaders proportionally.
  function forceDistribution() external ignoreReentry {
    _distribute(address(this).balance);
  }

  /// @notice Distribute ETH to leaders proportionally without updating contribution balances
  /// @dev Does not trigger a reorg or mint/burn tokens. Useful for distributing revenue or donations to leaders.
  function distribute() external payable ignoreReentry {
    _distribute(msg.value);
  }



  ////// INTERNAL


  /// @dev Reentry is ignored instead of disallowed in order to safeguard against recursive
  /// distributions. Sending a LEADER token to the Pyramid Game contract (or setting it as a recipient)
  /// would otherwise lead to an infinite loop. Throwing an error in this case would completely brick all
  /// contributions. Any balance accrued by the contract from failed reentries can be manually
  /// distributed through `forceDistribution`.
  function _contribute() internal ignoreReentry {
    uint8 senderIsLeaderTokenId = _distribute(msg.value);

    if (senderIsLeaderTokenId != INVALID_SLOT) {
      leaderboard.incrementContributionBalance(uint256(senderIsLeaderTokenId), msg.value);
    } else {
      _reorg(msg.sender, msg.value);
    }

    emit Contribution(msg.sender, msg.value);
  }


  /// @dev Given the cached Leaders: calculate the total contribution amounts, determine each
  /// Leader's percentage of the sum, and distribute the original contribution proportionally.
  function _distribute(uint256 amount) internal returns (uint8) {
    uint8 senderIsLeaderTokenId = INVALID_SLOT;

    // Single batch read of all leader data and contribution total
    (PyramidGameLeaderboard.LeaderData[] memory leaderCache, uint256 contributionTotal) = leaderboard.getAllLeaderData();

    // Distribute using cached data (no external calls in loop)
    uint256 leaderCount = leaderCache.length;
    unchecked {
      for (uint8 ix; ix < leaderCount; ++ix) {
        if (leaderCache[ix].owner == msg.sender) {
          senderIsLeaderTokenId = ix;
        }

        uint256 amountToTransfer = (amount * uint256(leaderCache[ix].contribution)) / contributionTotal;

        address recipient = leaderCache[ix].recipient != address(0)
          ? leaderCache[ix].recipient
          : leaderCache[ix].owner;

        _safeTransferETH(recipient, amountToTransfer);
      }
    }

    return senderIsLeaderTokenId;
  }


  /// @dev After the distribution has been made, recalculate the leaderboard.
  function _reorg(address contributor, uint256 contributionAmount) internal {
    if (leaderboard.totalSupply() < SLOTS) {
      leaderboard.mint(contributor, contributionAmount);
    } else {
      (uint256 tokenId, uint256 leaderAmount) = leaderboard.lowestLeader();
      uint256 senderContributions = outstandingContributions(contributor) + contributionAmount;
      if (senderContributions > leaderAmount) {
        _replaceLowestLeader(tokenId, contributor, leaderAmount, senderContributions);
      } else {
        _mint(contributor, contributionAmount);
      }
    }
  }

  /// @dev Find the leader with the lowest total contribution amount and replace them with the sender.
  function _replaceLowestLeader(uint256 tokenId, address contributor, uint256 leaderAmount, uint256 senderContributions) internal {
    _mint(leaderboard.ownerOf(tokenId), leaderAmount);
    leaderboard.reorg(tokenId, contributor, senderContributions - leaderAmount);
    _burn(contributor, balanceOf(contributor));
  }


  /**
   * @notice Transfer ETH and return the success status.
   * @dev This function only forwards 60,000 gas to the callee.
   */
  function _safeTransferETH(address to, uint256 value) internal returns (bool) {
    (bool success, ) = to.call{ value: value, gas: 60_000 }("");
    return success;
  }



  bool transient locked;
  modifier ignoreReentry {
    if (locked) return;
    locked = true;
    _;
    locked = false;
  }



  ////// CHILD PYRAMID DEPLOYMENT

  /// @notice Deploy a minimal proxy clone of this Pyramid Game
  /// @dev Uses EIP-1167 minimal proxy pattern - the clone will delegate all calls to this contract's code
  /// @dev msg.value is used to initialize the child's first leader and contribute to the parent pyramid
  /// @param gameName The name of the game/ERC20 token for the child pyramid
  /// @param tokenSymbol The symbol of the ERC20 token for the child pyramid
  /// @param leaderSymbol The symbol of the leader NFT for the child pyramid
  /// @return clone The address of the newly deployed minimal proxy
  function deployChildPyramidGame(
    string memory gameName,
    string memory tokenSymbol,
    string memory leaderSymbol
  ) external payable returns (address payable clone) {
    // Create EIP-1167 minimal proxy that delegates to this contract
    bytes20 targetBytes = bytes20(address(this));
    assembly {
      // Get free memory pointer
      let cloneContract := mload(0x40)

      // Store first part of proxy bytecode (initialization + runtime header)
      mstore(cloneContract, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)

      // Store the implementation address (this contract)
      mstore(add(cloneContract, 0x14), targetBytes)

      // Store second part of proxy bytecode (runtime footer)
      mstore(add(cloneContract, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)

      // Deploy the proxy contract (55 bytes total)
      clone := create(0, cloneContract, 0x37)
    }
    require(clone != address(0), "Deployment failed");

    // Initialize the clone (it will create its own leaders and wallet)
    PyramidGame(clone).initialize{value: msg.value}(msg.sender, gameName, tokenSymbol, leaderSymbol);

    children.push(clone);
    emit ChildPyramidDeployed(clone, msg.sender, msg.value);
  }

  /// @notice Get the total number of child pyramids
  /// @return The count of child pyramids
  function totalChildren() external view returns (uint256) {
    return children.length;
  }


  ////// TOKEN REDIRECTION TO WALLET

  /// @notice Redirect received ERC721 to wallet
  function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns(bytes4) {
    IERC721(msg.sender).transferFrom(address(this), address(wallet), tokenId);
    return this.onERC721Received.selector;
  }

  /// @notice Sweep any ERC20 tokens to wallet
  function sweepERC20(address token) external {
    uint256 balance = IERC20(token).balanceOf(address(this));
    if (balance > 0) {
      IERC20(token).transfer(address(wallet), balance);
    }
  }

  /// @notice Update the wallet contract to a new address
  /// @dev Can only be called by the current wallet (via multisig governance). Allows upgrading wallet logic.
  /// @param newWallet The address of the new wallet contract
  function updateWallet(PyramidGameWallet newWallet) external {
    require(msg.sender == address(wallet), 'Only the wallet can perform this action');
    wallet = newWallet;
  }

}


