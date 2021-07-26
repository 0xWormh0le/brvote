//SPDX-License-Identifier: Unlicense

pragma solidity 0.8.4;

import {IAaveGovernanceV2} from "./interfaces/Aave/IAaveGovernanceV2.sol";
import "hardhat/console.sol";
import "./BribePool.sol";

contract AavePool is BribePool {
  address private aave;

  constructor(
    string memory _name,
    string memory _symbol,
    address _governanceToken,
    address _bidAsset,
    address _aave
  )
    BribePool(_name, _symbol, 3600, _governanceToken, _bidAsset)
  {
    aave = _aave;
  }

  function vote(bytes32 proposalId, bool support)
    onlyValidProposalId(proposalId)
    onlyAfterBidEnded(proposalId)
    onlyWinningBidder(proposalId)
    external
  {
    IAaveGovernanceV2(aave).submitVote(uint(proposalId), support);
  }

  function bid(bytes32 proposalId, uint amount) public override {
    uint _proposalId = uint(proposalId);
    IAaveGovernanceV2.ProposalState state = IAaveGovernanceV2(aave).getProposalState(_proposalId);
    require (
      state != IAaveGovernanceV2.ProposalState.Canceled &&
      state != IAaveGovernanceV2.ProposalState.Failed &&
      state != IAaveGovernanceV2.ProposalState.Expired,
      "Invalid proposal id"
    );
    super.bid(proposalId, amount);
  }

  function getAuctionExpiration(bytes32 proposalId)
    public
    view
    override
    returns(uint)
  {
    uint _proposalId = uint(proposalId);
    IAaveGovernanceV2.ProposalWithoutVotes memory proposal = IAaveGovernanceV2(aave).getProposalById(_proposalId);
    return proposal.executionTime + proposal.executor.GRACE_PERIOD() - 1 hours;
  }
}
