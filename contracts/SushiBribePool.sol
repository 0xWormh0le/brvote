//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./BribePool.sol";

contract SushiBribePool is BribePool {
  constructor(
    string memory _name,
    string memory _symbol,
    uint _auctionDuration,
    address _governanceToken,
    address _bidAsset
  ) BribePool("SushiBribePool", _symbol, _auctionDuration, _governanceToken, _bidAsset)
  { }

  // function vote() external override {
    
  // }
}
