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


/// @title Pyramid Game
/// @author steviep.eth
/// @notice NFT contract that manages the Leader Board for Pyramid Game.
contract PyramidGameLeaderboard is ERC721 {
  struct LeaderData {
    address owner;
    uint96 contribution;
    address recipient;
  }

  address public root;
  uint256 public contributionTotal;
  uint256 public totalSupply = 1;
  uint256 public immutable SLOTS;
  TokenURI public uri;

  mapping(uint256 => LeaderData) private leaderData;

  constructor(
    address deployer,
    uint256 slots,
    uint256 initialAmount,
    string memory leaderName,
    string memory leaderSymbol
  ) ERC721(leaderName, leaderSymbol) {
    root = msg.sender;
    SLOTS = slots;
    uri = new TokenURI();

    _mint(deployer, 0);
    leaderData[0].owner = deployer;
    incrementContributionBalance(0, initialAmount);
  }


  receive () external payable {
    (bool success, ) = payable(root).call{ value: msg.value }("");
    success;
  }

  function exists(uint256 tokenId) external view returns (bool) {
    return _exists(tokenId);
  }

  function isApprovedOrOwner(address spender, uint256 tokenId) external view returns (bool) {
    return _isApprovedOrOwner(spender, tokenId);
  }

  /// @notice Batch read all leader data and contribution total in a single call for gas efficiency
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
  function contributions(uint256 tokenId) external view returns (uint256) {
    return leaderData[tokenId].contribution;
  }

  /// @notice Get the recipient address for a leader token's distributions
  function recipientOf(uint256 tokenId) external view returns (address) {
    address r = leaderData[tokenId].recipient;
    return r != address(0) ? r : leaderData[tokenId].owner;
  }

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
  function isLeader(address addr) external view returns (bool) {
    return balanceOf(addr) > 0;
  }



  /// SET RECIPIENTS

  /// @notice Allows the owner of a LEADER token to forward all Pyramid Game ETH to another address.
  function setRecipient(uint256 tokenId, address recipient) external {
    require(ownerOf(tokenId) == msg.sender, 'Only token owner can perform this action');
    leaderData[tokenId].recipient = recipient;
  }

  /// @dev Sync recipient and owner on token transfer.
  function _beforeTokenTransfer(address, address to, uint256 tokenId) internal virtual override {
    leaderData[tokenId].recipient = to;
    leaderData[tokenId].owner = to;
  }


  /// ONLY THE PYRAMID GAME CONTRACT CAN TAKE THESE ACTIONS

  modifier onlyRoot {
    require(msg.sender == root, 'Only the root address can perform this action');
    _;
  }

  function incrementContributionBalance(uint256 tokenId, uint256 incrementAmount) public onlyRoot {
    uint256 newContribution = leaderData[tokenId].contribution + incrementAmount;
    require(newContribution <= type(uint96).max, 'Contribution exceeds uint96 limit');

    leaderData[tokenId].contribution = uint96(newContribution);
    contributionTotal += incrementAmount;

    emit MetadataUpdate(tokenId);
  }

  function mint(address recipient, uint256 incrementAmount) external onlyRoot {
    require(totalSupply < SLOTS);
    _mint(recipient, totalSupply);
    leaderData[totalSupply].owner = recipient;
    incrementContributionBalance(totalSupply, incrementAmount);
    unchecked {
      totalSupply += 1;
    }
  }

  function reorg(uint256 tokenId, address recipient, uint256 incrementAmount) external onlyRoot {
    incrementContributionBalance(tokenId, incrementAmount);
    _transfer(ownerOf(tokenId), recipient, tokenId);
  }


  /// METADATA

  function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
    return uri.tokenURI(tokenId);
  }

  function updateURI(address newURI) external {
    require(msg.sender == address(PyramidGame(payable(root)).wallet()), 'Only the root wallet can perform this action');
    uri = TokenURI(newURI);
    emit BatchMetadataUpdate(0, SLOTS);
  }


  event MetadataUpdate(uint256 _tokenId);
  event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721) returns (bool) {
    // ERC2981 & ERC4906
    return interfaceId == bytes4(0x2a55205a) || interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
  }

}

contract TokenURI {
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
      '", "description": "All ETH sent to Pyramid Game is split proportionally among the 12 Leaderboard slots based on their prior contributions.",'
      '"license": "CC0",'
      '"image": "', encodedSVG,
      '", "attributes": [{ "trait_type": "Leader Token Contributions", "value": "', Strings.toString(leaderboard.contributions(tokenId)), ' wei" }]'
      '}'
    ));
  }

  function rawSVG(uint256 tokenId) public pure returns (string memory) {
    string memory color0 = '#000';
    string memory color1 = '#46ff5a';
    string memory color2 = '#001cff';
    string memory color3 = '#ff1b1b';

    string[2][12] memory colorPairs = [
      [color0, color1],
      [color2, color1],
      [color3, color1],

      [color2, color0],
      [color3, color0],
      [color1, color0],

      [color3, color2],
      [color1, color2],
      [color0, color2],

      [color1, color3],
      [color0, color3],
      [color2, color3]
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