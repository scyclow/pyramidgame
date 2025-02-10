// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;


contract ReinvestTest {
  receive () external payable {
    payable(msg.sender).call{value: msg.value}('');
  }

}