// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../BribePool.sol";

contract MockPool is BribePool {
  constructor(
    string memory _name,
    string memory _symbol,
    uint _auctionDuration,
    address _governanceToken,
    address _bidAsset
  ) BribePool(_name, _symbol, _auctionDuration, _governanceToken, _bidAsset)
  { }
}
