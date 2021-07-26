//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

interface IBribeProtocol {

  function setAuctionDuration(uint _auctionDuration) external;

  function getAuctionExpiration(bytes32 proposalId) external returns(uint);

  function deposit(uint amount) external;

  function withdraw(uint amount) external;

  function claimReward() external;

  function rewardBalanceOf(address user) external view returns (uint);

  function bid(bytes32 proposalId, uint amount) external;
}
