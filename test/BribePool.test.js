const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { ZERO_ADDRESS } = require('./constants')
const { generateRandomBytes32, time } = require("./helpers")

describe("BribePool", function() {
  before(async function () {
    const Erc20 = await ethers.getContractFactory("Erc20")
    const BribePool = await ethers.getContractFactory("MockPool")

    this.governanceToken = await Erc20.deploy("GovernanceToken", "GovernanceToken")
    this.usdc = await Erc20.deploy("USDC", "USDC")

    await this.governanceToken.deployed()
    await this.usdc.deployed()
    
    this.bribePool = await BribePool.deploy(
      "BribePool", // name
      "BribePool", // symbol
      3600, // auction duration
      this.governanceToken.address, // governance token
      this.usdc.address // bid asset
    )
    await this.bribePool.deployed()

    const users = await ethers.getSigners()
    
    this.stakers = users.slice(0, 3)
    this.bidders = users.slice(4)

    const [alice, bob, carl] = this.stakers

    // set initial governance token balance and approve
    const aliceGov = this.governanceToken.connect(alice)
    const bobGov = this.governanceToken.connect(bob)
    const carlGov = this.governanceToken.connect(carl)

    await Promise.all([
      aliceGov.mint(100),
      bobGov.mint(100),
      carlGov.mint(100),
    ])

    await Promise.all([
      aliceGov.approve(this.bribePool.address, 100),
      bobGov.approve(this.bribePool.address, 100),
      carlGov.approve(this.bribePool.address, 100)
    ])

    // set initial usdc balance and approve
    const [david, erin, frank] = this.bidders
    const davidUsdc = this.usdc.connect(david)
    const erinUsdc = this.usdc.connect(erin)
    const frankUsdc = this.usdc.connect(frank)

    await Promise.all([
      davidUsdc.mint(100),
      erinUsdc.mint(100),
      frankUsdc.mint(100),
    ])

    await Promise.all([
      davidUsdc.approve(this.bribePool.address, 100),
      erinUsdc.approve(this.bribePool.address, 100),
      frankUsdc.approve(this.bribePool.address, 100)
    ])
  })

  describe('Initial deposit', async function () {
    before(async function () {
      const [alice, bob, carl] = this.stakers
      const aliceBribe = this.bribePool.connect(alice)
      const bobBribe = this.bribePool.connect(bob)
      const carlBribe = this.bribePool.connect(carl)
  
      // deposit
      await Promise.all([
        aliceBribe.deposit(10),
        bobBribe.deposit(20),
        carlBribe.deposit(30)
      ])
    })

    it('Stakers get bribe tokens', async function () {
      const [alice, bob, carl] = this.stakers
      const aliceBribe = this.bribePool.connect(alice)
      const bobBribe = this.bribePool.connect(bob)
      const carlBribe = this.bribePool.connect(carl)

      expect(await aliceBribe.balanceOf(alice.address)).to.equal(10)
      expect(await bobBribe.balanceOf(bob.address)).to.equal(20)
      expect(await carlBribe.balanceOf(carl.address)).to.equal(30)
    })

    it('Check stakers\' remaining balance of governance token', async function () {
      const [alice, bob, carl] = this.stakers
      const aliceGov = this.governanceToken.connect(alice)
      const bobGov = this.governanceToken.connect(bob)
      const carlGov = this.governanceToken.connect(carl)

      expect(await aliceGov.balanceOf(alice.address)).to.equal(90)
      expect(await bobGov.balanceOf(bob.address)).to.equal(80)
      expect(await carlGov.balanceOf(carl.address)).to.equal(70)
    })
  })

  describe('First auction', async function () {
    let proposalId, david, erin

    before(async function () {
      proposalId = generateRandomBytes32()
      david = this.bidders[0]
      erin = this.bidders[1]
    })

    it('First bid will set highest bidder to be himself', async function () {
      const davidBribe = this.bribePool.connect(david)
      const usdc = this.usdc.connect(erin)

      const balance = await usdc.balanceOf(david.address)
      await expect(davidBribe.bid(proposalId, 40))
        .to.emit(davidBribe, 'HighestBidIncreased')
        .withArgs(proposalId, ZERO_ADDRESS, david.address, 40)

      const bid = await davidBribe.bids(proposalId)
      expect(bid.highestBidder).to.equal(david.address)
      expect(await usdc.balanceOf(david.address)).to.equal(balance.sub(40))
    })

    it('Bidder with lower price is rejected', async function () {
      const erinBribe = this.bribePool.connect(erin)
      await expect(erinBribe.bid(proposalId, 30))
        .to.revertedWith('Bid not high enough')
    })

    it('Higher bidder will upgrade bid and refund usdc to previous highest bidder', async function () {
      const davidBribe = this.bribePool.connect(david)
      const erinBribe = this.bribePool.connect(erin)
      const usdc = this.usdc.connect(david)

      const davidBalance = await usdc.balanceOf(david.address)
      const erinBalance = await usdc.balanceOf(erin.address)

      await expect(erinBribe.bid(proposalId, 80))
        .to.emit(erinBribe, 'HighestBidIncreased')
        .withArgs(proposalId, david.address, erin.address, 80)

      const bid = await davidBribe.bids(proposalId)
      expect(bid.highestBidder).to.equal(erin.address)

      expect(await usdc.balanceOf(david.address)).to.equal(davidBalance.add(40))
      expect(await usdc.balanceOf(erin.address)).to.equal(erinBalance.sub(80))
    })

    it('Check reward balance', async function () {
      const [alice, bob, carl] = this.stakers
      const bribePool = this.bribePool.connect(alice)

      expect(await bribePool.rewardBalanceOf(alice.address))
        .to.equal(BigNumber.from(Math.floor(80 * 10 / (10 + 20 + 30))))
      expect(await bribePool.rewardBalanceOf(bob.address))
        .to.equal(BigNumber.from(Math.floor(80 * 20 / (10 + 20 + 30))))
      expect(await bribePool.rewardBalanceOf(carl.address))
        .to.equal(BigNumber.from(Math.floor(80 * 30 / (10 + 20 + 30))))
    })

    it('First user claims reward and check usdc balance', async function () {
      const [alice] = this.stakers
      const usdc = this.usdc.connect(alice)
      const bribePool = this.bribePool.connect(alice)
      const aliceUsdc = await usdc.balanceOf(alice.address)
      
      await bribePool.claimReward()

      expect(await usdc.balanceOf(alice.address))
        .to.equal(aliceUsdc.add(Math.floor(80 * 10 / (10 + 20 + 30))))
    })

    it('Check reward balance after claim', async function () {
      const [alice, bob, carl] = this.stakers
      const bribePool = this.bribePool.connect(alice)

      expect(await bribePool.rewardBalanceOf(alice.address))
        .to.equal(BigNumber.from(0))
      expect(await bribePool.rewardBalanceOf(bob.address))
        .to.equal(BigNumber.from(Math.floor(80 * 20 / (10 + 20 + 30))))
      expect(await bribePool.rewardBalanceOf(carl.address))
        .to.equal(BigNumber.from(Math.floor(80 * 30 / (10 + 20 + 30))))
    })

    it('Cannot place bid when the proposal is expired', async function () {
      const david = this.bidders[0]

      await time.increase(3600)
      const davidBribe = this.bribePool.connect(david)
      await expect(davidBribe.bid(proposalId, 50))
        .to.revertedWith('Bid already ended')
    })
  })

  describe('Second auction and additional stake', async function () {
    const rewardBalance = {}

    before(async function () {
      const proposalId = generateRandomBytes32()
      const [alice, bob, carl] = this.stakers
      const david = this.bidders[0]
      const davidBribe = this.bribePool.connect(david)
      const aliceBribe = this.bribePool.connect(alice)
      const bobBribe = this.bribePool.connect(bob)
      const bribePool = davidBribe

      rewardBalance.alice = await bribePool.rewardBalanceOf(alice.address)
      rewardBalance.bob = await bribePool.rewardBalanceOf(bob.address)
      rewardBalance.carl = await bribePool.rewardBalanceOf(carl.address)

      await bobBribe.deposit(20)
      await aliceBribe.withdraw(5)

      await davidBribe.bid(proposalId, 60);
    })

    it('check bribe token balance', async function () {
      const [alice, bob, carl] = this.stakers
      const bribePool = this.bribePool.connect(alice)

      expect(await bribePool.balanceOf(alice.address)).to.equal(5)
      expect(await bribePool.balanceOf(bob.address)).to.equal(40)
      expect(await bribePool.balanceOf(carl.address)).to.equal(30)
    })

    it('Check user balance', async function () {
      const [alice, bob, carl] = this.stakers
      const bribePool = this.bribePool.connect(alice)

      expect(await bribePool.rewardBalanceOf(alice.address))
        .to.equal(rewardBalance.alice.add(Math.floor(60 * 5 / (5 + 40 + 30))))
      expect(await bribePool.rewardBalanceOf(bob.address))
        .to.equal(Math.floor(140 * 40 / (5 + 40 + 30)))
      expect(await bribePool.rewardBalanceOf(carl.address))
        .to.equal(Math.floor(140 * 30 / (5 + 40 + 30)))
    })
  })
});
