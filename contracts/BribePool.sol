//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "./interfaces/Bribe/IBribeProtocol.sol";

struct Bid {
  bytes32 proposalId;
  uint highestBid;
  uint endTime;
  address highestBidder;
}

abstract contract BribePool is IBribeProtocol, ERC20, Ownable {

  using SafeERC20 for IERC20;

  /* name is inherited from ERC20 */

  /// @dev total deposit amount
  uint public depositSum;

  /// @dev auction duration
  uint public auctionDuration;

  /// @dev stakers will deposit governanceToken
  IERC20 public governanceToken;

  /// @dev bidders will bid with bidAsset
  IERC20 public bidAsset;

  /// @dev total amount of asset bidders put
  uint public totalBidPrice;

  /// @dev asset balance when user claimed lastly
  mapping(address => uint) private lastAssetBalance;

  mapping(bytes32 => Bid) public bids;

  event HighestBidIncreased(
    bytes32 bidId,
    address prevHighestBidder,
    address highestBidder,
    uint highestBid
  );

  modifier onlyValidProposalId(bytes32 proposalId) {
    require(bids[proposalId].proposalId == proposalId, "Invalid proposal id");
    _;
  }

  modifier onlyAfterBidEnded(bytes32 proposalId) {
    require(bids[proposalId].endTime < block.timestamp, "Bid not ended");
    _;
  }

  modifier onlyWinningBidder(bytes32 proposalId) {
    require(msg.sender == bids[proposalId].highestBidder, "You are not a highest bidder that is allowed to vote for this proposal");
    _;
  }

  constructor(
    string memory _name,
    string memory _symbol,
    uint _auctionDuration,
    address _governanceToken,
    address _bidAsset
  ) Ownable()
    ERC20(_name, _symbol)
  {
    require(address(_governanceToken) != address(0), "Governance token not set");
    require(address(_bidAsset) != address(0), "Bid asset token not set");
    require(_auctionDuration > 0, "Invalid auction duration");

    auctionDuration = _auctionDuration;
    governanceToken = IERC20(_governanceToken);
    bidAsset = IERC20(_bidAsset);
  }

  function setAuctionDuration(uint _auctionDuration)
    external
    override
    onlyOwner
  {
    require(_auctionDuration > 0, "Invalid auction duration");
    auctionDuration = _auctionDuration;
  }

  function deposit(uint amount)
    external
    override
  {
    require(amount > 0, "Amount not set");

    governanceToken.safeTransferFrom(msg.sender, address(this), amount);
    depositSum += amount;
    _mint(msg.sender, amount);
  }

  function withdraw(uint amount)
    external
    override
  {
    require(amount > 0, "Amount not set");
    require(balanceOf(msg.sender) >= amount, "Withdraw amount exceeds balance");

    depositSum -= amount;

    governanceToken.safeTransfer(msg.sender, amount);
    _burn(msg.sender, amount);
  }

  function claimReward()
    external
    override
  {
    bidAsset.safeTransfer(msg.sender, _userPendingRewards(msg.sender));
    lastAssetBalance[msg.sender] = totalBidPrice;
  }

  function rewardBalanceOf(address user)
    external
    view
    override
    returns(uint)
  {
    return _userPendingRewards(user);
  }

  function bid(bytes32 proposalId, uint amount)
    public
    override
    virtual
  {
    Bid storage _bid = bids[proposalId];
    address prevHighestBidder = _bid.highestBidder;

    if (_bid.highestBidder != address(0)) {
      require(_bid.endTime > block.timestamp, "Bid already ended");
    }

    require(amount > _bid.highestBid, "Bid not high enough");

    if (_bid.highestBidder == address(0)) {
      _bid.proposalId = proposalId;
      _bid.endTime = getAuctionExpiration(proposalId);
    }

    if (_bid.highestBidder != address(0)) {
      // refund to previous highest bidder
      bidAsset.safeTransfer(_bid.highestBidder, _bid.highestBid);
      totalBidPrice -= _bid.highestBid;
    }

    bidAsset.safeTransferFrom(msg.sender, address(this), amount);

    totalBidPrice += amount;
    _bid.highestBid = amount;
    _bid.highestBidder = msg.sender;

    emit HighestBidIncreased(proposalId, prevHighestBidder, _bid.highestBidder, _bid.highestBid);
  }

  function _userPendingRewards(address user) view internal returns(uint) {
    uint assetBalance = totalBidPrice;
    uint userDeposit = balanceOf(user);
    uint assetBalanceIncreasement = assetBalance - lastAssetBalance[user];

    return assetBalanceIncreasement * userDeposit / depositSum;
  }

  function getAuctionExpiration(bytes32 proposalId)
    public
    view
    virtual
    override
    returns(uint)
  {
    return block.timestamp + auctionDuration;
  }
}
