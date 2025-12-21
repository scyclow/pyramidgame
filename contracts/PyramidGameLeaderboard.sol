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
import "./PyramidGame.sol";

pragma solidity ^0.8.30;


/// @title Pyramid Game Leaderboard
/// @author steviep.eth
/// @notice NFT contract that manages the Leader Board for Pyramid Game
/// @dev Each NFT represents a leadership position with an associated contribution balance
///      The contribution balance determines the leader's share of distributions
contract PyramidGameLeaderboard is ERC721 {
  /// @notice Stores all data for a leader token
  /// @dev Packed into a single storage slot for gas optimization
  struct LeaderData {
    address owner;          // Current owner of the leader NFT
    uint96 contribution;    // ETH contribution amount (in wei, max ~79 billion ETH)
    address recipient;      // Address to receive distributions (defaults to owner if zero address)
  }

  /// @notice Address of the PyramidGame contract that controls this leaderboard
  address public root;

  /// @notice Sum of all leader contribution balances
  uint256 public contributionTotal;

  /// @notice Number of leader NFTs currently minted
  uint256 public totalSupply = 1;

  /// @notice Maximum number of leader slots
  uint256 public immutable SLOTS;


  /// @notice Contract that generates token metadata URIs
  PyramidGameLeaderboardTokenURI public uri;

  /// @dev Maps token ID to leader data
  mapping(uint256 => LeaderData) private leaderData;


  /// @notice Initialize the leaderboard contract
  /// @param deployer Address to receive the first leader NFT (token ID 0)
  /// @param slots Maximum number of leader positions
  /// @param initialAmount Initial contribution amount for the deployer
  /// @param leaderName Name of the leader NFT collection
  /// @param leaderSymbol Symbol of the leader NFT collection
  constructor(
    address deployer,
    uint256 slots,
    uint256 initialAmount,
    string memory leaderName,
    string memory leaderSymbol
  ) ERC721(leaderName, leaderSymbol) {
    root = msg.sender;
    SLOTS = slots;
    uri = new PyramidGameLeaderboardTokenURI();

    _mint(deployer, 0);
    leaderData[0].owner = deployer;
    incrementContributionBalance(0, initialAmount);
  }

  /// @notice Receive function forwards any ETH sent directly to this contract back to the root PyramidGame
  receive () external payable {
    (bool success, ) = payable(root).call{ value: msg.value }("");
    success;
  }

  /// @notice Check if a token ID has been minted
  /// @param tokenId The token ID to check
  /// @return bool True if the token exists
  function exists(uint256 tokenId) external view returns (bool) {
    return _exists(tokenId);
  }

  /// @notice Check if an address is approved to manage a token or is the owner
  /// @param spender Address to check approval for
  /// @param tokenId Token ID to check
  /// @return bool True if spender is approved or owner
  function isApprovedOrOwner(address spender, uint256 tokenId) external view returns (bool) {
    return _isApprovedOrOwner(spender, tokenId);
  }

  /// @notice Batch read all leader data and contribution total in a single call for gas efficiency
  /// @return result Array of all leader data structs
  /// @return total The sum of all leader contributions
  function getAllLeaderData() external view returns (LeaderData[] memory result, uint256 total) {
    total = contributionTotal;
    uint256 supply = totalSupply;
    result = new LeaderData[](supply);
    unchecked {
      for (uint8 i; i < supply; ++i) {
        result[i] = leaderData[i];
      }
    }
  }

  /// @notice Get contribution amount for a leader token
  /// @param tokenId The token ID to query
  /// @return uint256 The contribution amount in wei
  function contributions(uint256 tokenId) external view returns (uint256) {
    return leaderData[tokenId].contribution;
  }

  /// @notice Get the recipient address for a leader token's distributions
  /// @param tokenId The token ID to query
  /// @return address The recipient address (defaults to owner if not set)
  function recipientOf(uint256 tokenId) external view returns (address) {
    address r = leaderData[tokenId].recipient;
    return r != address(0) ? r : leaderData[tokenId].owner;
  }

  /// @notice Find the leader with the lowest contribution
  /// @return uint256 Token ID of the lowest leader
  /// @return uint256 Contribution amount of the lowest leader
  function lowestLeader() external view returns (uint256, uint256) {
    uint256 lowestLeaderIx = 0;
    uint256 lowestLeaderAmount = leaderData[0].contribution;

    unchecked {
      for (uint256 ix = 1; ix < totalSupply; ++ix) {
        if (leaderData[ix].contribution < lowestLeaderAmount) {
          lowestLeaderIx = ix;
          lowestLeaderAmount = leaderData[ix].contribution;
        }
      }
    }

    return (lowestLeaderIx, lowestLeaderAmount);
  }

  /// @notice Check if an address is currently a leader
  /// @param addr Address to check
  /// @return bool True if the address owns at least one leader NFT
  function isLeader(address addr) external view returns (bool) {
    return balanceOf(addr) > 0;
  }



  /// SET RECIPIENTS

  /// @notice Set the recipient address for a leader token's distributions
  /// @dev Can be called by the token owner or an approved operator
  ///      If set to address(0), distributions will go to the owner
  /// @param tokenId The token ID to set recipient for
  /// @param recipient The address to receive distributions
  function setRecipient(uint256 tokenId, address recipient) external {
    require(
      _isApprovedOrOwner(msg.sender, tokenId),
      'Only token owner or approved operator can perform this action'
    );
    leaderData[tokenId].recipient = recipient;
  }

  /// @dev Sync recipient and owner on token transfer
  ///      Automatically sets the recipient to the new owner
  function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal virtual override {
    leaderData[tokenId].recipient = to;
    leaderData[tokenId].owner = to;
  }


  /// ONLY THE PYRAMID GAME CONTRACT CAN TAKE THESE ACTIONS

  /// @dev Restricts function access to the root PyramidGame contract
  modifier onlyRoot {
    require(msg.sender == root, 'Only the root address can perform this action');
    _;
  }

  /// @notice Increase a leader's contribution balance
  /// @dev Can only be called by the root PyramidGame contract
  /// @param tokenId Token ID to increment
  /// @param incrementAmount Amount to add to the contribution balance
  function incrementContributionBalance(uint256 tokenId, uint256 incrementAmount) public onlyRoot {
    uint256 newContribution = leaderData[tokenId].contribution + incrementAmount;
    require(newContribution <= type(uint96).max, 'Contribution exceeds uint96 limit');

    leaderData[tokenId].contribution = uint96(newContribution);
    contributionTotal += incrementAmount;

    emit MetadataUpdate(tokenId);
  }

  /// @notice Mint a new leader NFT
  /// @dev Can only be called by the root PyramidGame contract
  ///      Automatically increments totalSupply
  /// @param recipient Address to receive the new leader NFT
  /// @param incrementAmount Initial contribution amount for the new leader
  function mint(address recipient, uint256 incrementAmount) external onlyRoot {
    require(totalSupply < SLOTS);
    _mint(recipient, totalSupply);
    leaderData[totalSupply].owner = recipient;
    incrementContributionBalance(totalSupply, incrementAmount);
    unchecked {
      totalSupply += 1;
    }
  }

  /// @notice Transfer a leader NFT and increment its contribution
  /// @dev Can only be called by the root PyramidGame contract
  ///      Used during leaderboard reorganization
  /// @param tokenId Token ID to transfer
  /// @param recipient New owner of the token
  /// @param incrementAmount Amount to add to the contribution balance
  function reorg(uint256 tokenId, address recipient, uint256 incrementAmount) external onlyRoot {
    incrementContributionBalance(tokenId, incrementAmount);
    _transfer(ownerOf(tokenId), recipient, tokenId);
  }


  /// METADATA

  /// @notice Get the token URI for a leader NFT
  /// @param tokenId The token ID to query
  /// @return string The token URI (data URI with JSON metadata)
  function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
    return uri.tokenURI(tokenId);
  }

  /// @notice Update the PyramidGameLeaderboardTokenURI contract used to generate metadata
  /// @dev Can only be called by the Leaderboard wallet (via multisig governance)
  ///      Allows upgrading metadata generation logic
  /// @param newURI Address of the new PyramidGameLeaderboardTokenURI contract
  function updateURI(address newURI) external {
    require(msg.sender == address(PyramidGame(payable(root)).wallet()), 'Only the Leaderboard wallet can perform this action');
    uri = PyramidGameLeaderboardTokenURI(newURI);
    emit BatchMetadataUpdate(0, SLOTS);
  }

  /// @notice Emitted when metadata for a single token is updated (ERC-4906)
  event MetadataUpdate(uint256 _tokenId);

  /// @notice Emitted when metadata for a range of tokens is updated (ERC-4906)
  event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

  /// @notice Check interface support
  /// @dev Supports ERC-721, ERC-2981 (royalties), and ERC-4906 (metadata updates)
  /// @param interfaceId The interface identifier to check
  /// @return bool True if the interface is supported
  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721) returns (bool) {
    // ERC2981 & ERC4906
    return interfaceId == bytes4(0x2a55205a) || interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
  }

}

contract PyramidGameLeaderboardTokenURI {
  PyramidGameLeaderboard public leaderboard;
  constructor() {
    leaderboard = PyramidGameLeaderboard(payable(msg.sender));
  }

  function tokenURI(uint256 tokenId) public view returns (string memory) {
    string memory tokenString = Strings.toString(tokenId);

    bytes memory encodedSVG = abi.encodePacked(
      'data:image/svg+xml;base64,',
      Base64.encode(abi.encodePacked(rawSVG(tokenId)))
    );

    return string(abi.encodePacked(
      'data:application/json;utf8,'
      '{"name": "', leaderboard.name(),' Slot #', tokenString,
      '", "description": "Pyramid Game is a zero-sum wealth redistirbution game that uses cutting-edge pyramid scheme technology. It is not a financial security.",'
      '"license": "CC0",'
      '"image": "', encodedSVG,
      '", "attributes": [{ "trait_type": "Leader Token Contributions", "value": "', Strings.toString(leaderboard.contributions(tokenId)), ' wei" }]'
      '}'
    ));
  }

  function rawSVG(uint256 tokenId) public pure returns (string memory) {
    string memory black = '#000';
    string memory green = '#46ff5a';
    string memory blue = '#001cff';
    string memory red = '#ff1b1b';

    string[2][12] memory colorPairs = [
      [black, green],
      [blue, green],
      [red, green],

      [green, red],
      [black, red],
      [blue, red],

      [red, blue],
      [green, blue],
      [black, blue],

      [blue, black],
      [red, black],
      [green, black]
    ];

    uint256 tokenIx = tokenId % 12;

    return string.concat(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 576">'
        '<style>*{stroke:', colorPairs[tokenIx][0],';fill:', colorPairs[tokenIx][1],'}</style>'
        '<rect width="562" height="562" x="7" y="7" stroke-width="14"></rect>'
        '<path d="M509.501 480H289.495H65L287.25 94.5L509.501 480Z"  stroke-width="14"/>'
        '<path d="M250 392.5C260.5 401.5 272.013 403.724 287.501 404.499C337.5 407 345.501 339.499 287.501 337.999C229.501 336.499 241 269 287.501 274.498C287.501 274.498 304 274.498 321 288.5"  stroke-width="14" stroke-linecap="square"/>'
        '<line x1="287" y1="245.5" x2="287" y2="430.5"  stroke-width="14"/>'
      '</svg>'
    );

  }
}