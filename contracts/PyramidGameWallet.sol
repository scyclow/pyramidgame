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


import "./PyramidGame.sol";
import "./PyramidGameLeaderboard.sol";



pragma solidity ^0.8.30;

/// @title Pyramid Game Wallet
/// @author steviep.eth
/// @notice Wallet contract that executes transactions approved by majority of leaders
/// @dev Uses a multisig pattern where leader NFT owners sign off-chain messages to authorize transactions.
///      Requires majority (>50%) of leaders to sign for execution.
contract PyramidGameWallet {
  /// @notice Reference to the PyramidGame contract
  PyramidGame public pyramidGame;

  /// @notice Reference to the PyramidGameLeaderboard contract for verifying leader ownership
  PyramidGameLeaderboard public leaderboard;

  /// @notice Mapping to prevent replay attacks - tracks which nonces have been used
  mapping(uint256 => bool) public nonceUsed;

  /// @notice Initialize the wallet contract
  /// @dev Transfers any received ETH to the parent address (deployer for root, parent pyramid for children)
  /// @param pgAddr Address of the PyramidGame contract
  /// @param leaderAddr Address of the PyramidGameLeaderboard contract
  /// @param parentAddr Address to send initialization ETH to (parent pyramid or deployer)
  constructor(address pgAddr, address leaderAddr, address payable parentAddr) payable {
    pyramidGame = PyramidGame(payable(pgAddr));
    leaderboard = PyramidGameLeaderboard(payable(leaderAddr));

    // Transfer ETH to parent
    if (msg.value > 0) {
      (bool success,) = parentAddr.call{value: msg.value}('');
      require(success, 'Transfer to parent failed');
    }
  }


  /// @notice Execute a transaction if signed by majority of leaders
  /// @param target The contract to call
  /// @param value The ETH value to send with the call
  /// @param data The call data
  /// @param txNonce The nonce for this transaction
  /// @param leaderTokenIds Array of leader token IDs voting
  /// @param signatures Array of signatures from leader token owners (in same order as leaderTokenIds)
  function executeLeaderTransaction(
    address target,
    uint256 value,
    bytes calldata data,
    uint256 txNonce,
    uint256[] calldata leaderTokenIds,
    bytes[] calldata signatures
  ) external {
    require(!nonceUsed[txNonce], 'Nonce already used');
    require(leaderTokenIds.length == signatures.length, 'Array length mismatch');
    require(leaderTokenIds.length > leaderboard.totalSupply() / 2, 'Insufficient votes');

    bytes32 messageHash = keccak256(abi.encode(target, value, data, txNonce));
    bytes32 ethSignedMessageHash = keccak256(abi.encodePacked('\x19Ethereum Signed Message:\n32', messageHash));

    // Verify each signature corresponds to the owner of the leader token
    for (uint256 i = 0; i < leaderTokenIds.length; i++) {
      address signer = recoverSigner(ethSignedMessageHash, signatures[i]);
      require(
        leaderboard.isApprovedOrOwner(signer, leaderTokenIds[i]),
        'Invalid signature'
      );
    }

    nonceUsed[txNonce] = true;

    (bool success, ) = target.call{value: value}(data);
    require(success, 'Transaction failed');
  }


  /// @dev Recover signer from signature
  function recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature) internal pure returns (address) {
    require(signature.length == 65, 'Invalid signature length');

    bytes32 r;
    bytes32 s;
    uint8 v;

    assembly {
      r := mload(add(signature, 32))
      s := mload(add(signature, 64))
      v := byte(0, mload(add(signature, 96)))
    }

    return ecrecover(ethSignedMessageHash, v, r, s);
  }


  // BOILERPLATE


  receive() external payable {}
  fallback() external payable {}

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

