const { expect } = require("chai");
const { ethers } = require("hardhat")
const { BigNumber } = require("ethers")
const { expectEvent } = require('@openzeppelin/test-helpers')
const executorAbi = require('./abis/Executor')
const aaveTokenV2Abi = require('./abis/AaveTokenV2')
const strategyAbi = require('./abis/Strategy')
const govAbi = require('./abis/AaveGovernanceV2')
const { advanceBlockTo } = require('./helper')
const { bytes32, generateRandomBytes32 } = require('../helpers')
const { ZERO_ADDRESS } = require('../constants')

const proposalStates = {
  PENDING: 0,
  CANCELED: 1,
  ACTIVE: 2,
  FAILED: 3,
  SUCCEEDED: 4,
  QUEUED: 5,
  EXPIRED: 6,
  EXECUTED: 7,
}

const deployedContracts = {
  AaveTokenV2: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
  GovernanceStrategy: "0xb7e383ef9B1E9189Fc0F71fb30af8aa14377429e",
  AaveGovernanceV2: "0xEC568fffba86c094cf06b22134B23074DFE2252c",
  Executor: "0xEE56e2B3D491590B5b31738cC34d5232F378a8D5",
}

describe('AavePool', () => {
  before(async () => {
    const AavePool = await ethers.getContractFactory("AavePool")
    const Erc20 = await ethers.getContractFactory("Erc20")
    const provider = ethers.getDefaultProvider()

    this.gov = new ethers.Contract(deployedContracts.AaveGovernanceV2, govAbi, provider)
    this.strategy = new ethers.Contract(deployedContracts.GovernanceStrategy, strategyAbi, provider)
    this.executor = new ethers.Contract(deployedContracts.Executor, executorAbi, provider)
    this.aave = new ethers.Contract(deployedContracts.AaveTokenV2, aaveTokenV2Abi, provider)
    this.users = await ethers.getSigners()

    this.governanceToken = await Erc20.deploy("GovernanceToken", "GovernanceToken")
    this.usdc = await Erc20.deploy("USDC", "USDC")
    this.aavePool = await AavePool.deploy(
      "AavePool", // name
      "AavePool", // symbol
      this.governanceToken.address, // governance token
      this.usdc.address, // bid asset
      this.gov.address // aave
    )

    await Promise.all([
      this.governanceToken.deployed(),
      this.usdc.deployed(),
      this.aavePool.deployed()
    ])
    
    const alice = this.users[0]
    const withAlice = this.usdc.connect(alice)

    await Promise.all([
      withAlice.mint(999),
      withAlice.approve(this.aavePool.address, 100)
    ])

    const govContract = this.gov.connect(alice)
    const proposalId = await govContract.getProposalsCount() - 1
    const proposal = await govContract.getProposalById(BigNumber.from(proposalId))
    const votingDuration = await this.executor.VOTING_DURATION()

    this.proposal = proposal
    this.startBlock = proposal.startBlock
    this.endBlock = proposal.startBlock.add(votingDuration)
    this.proposalId = proposalId
  })

  describe('Bid', async () => {
    it('succeeds', async () => {
      const alice = this.users[0]
      const withAlice = this.aavePool.connect(alice)
      const proposalId = bytes32(this.proposalId)

      await expect(withAlice.bid(proposalId, 50))
        .to.emit(withAlice, 'HighestBidIncreased')
        .withArgs(proposalId, ZERO_ADDRESS, alice.address, 50)
    })

    it('fails when the proposal state is Cancelled', async () => {

    })

    it('fails when the proposal state is Failed', async () => {
      
    })
  
    it('fails when the proposal state is Expired', async () => {
      
    })

    it('fails when it is after 1 hour before the proposal expiration', async () => {
      // const gracePeriod = await this.proposal.executor.GRACE_PERIOD()
      // const expiration = this.proposal.executionTime + gracePeriod - 3600
      // console.log(expiration)
    })
  })

  describe('Vote', async () => {
    it('succeeds', async () => {
      const [user1, user2, user3, user4] = this.users
  
      const gov = new web3.eth.Contract(govAbi, deployedContracts.AaveGovernanceV2)
      const aavePool = this.aavePool.connect(user1)
      const aave = this.aave.connect(user1)
      const proposalId = bytes32(this.proposalId)
      const power2 = await this.strategy.getVotingPowerAt(user2.address, this.startBlock)

      let receipt = await aavePool.vote(proposalId, true)
      await expectEvent.inTransaction(
        receipt.hash,
        gov,
        'VoteEmitted',
        {
          id: this.proposalId.toString(),
          voter: this.aavePool.address,
          support: true,
          votingPower: power2
        }
      )

      const balance4 = await aave.balanceOf(user4.address)
      receipt = await aavePool.vote(proposalId, false)
      await expectEvent.inTransaction(
        receipt.hash,
        gov,
        'VoteEmitted',
        {
          id: this.proposalId.toString(),
          voter: this.aavePool.address,
          support: false,
          votingPower: balance4
        }
      )

      const balance3 = await aave.balanceOf(user3.address)
      receipt = await aavePool.vote(proposalId, true)
      await expectEvent.inTransaction(
        receipt.hash,
        gov,
        'VoteEmitted',
        {
          id: this.proposalId.toString(),
          voter: this.aavePool.address,
          support: true,
          votingPower: balance3
        }
      )

      await advanceBlockTo(Number(this.endBlock.add('13').toString()))
      expect(await this.executor.isQuorumValid(this.gov.address, this.proposalId))
        .to.be.equal(true)
      expect(await this.executor.isVoteDifferentialValid(this.gov.address, this.proposalId))
        .to.be.equal(true)
      expect(await this.gov.connect(user1).getProposalState(this.proposalId))
        .to.be.equal(proposalStates.SUCCEEDED)
    })

    it('fails with invalid proposal id', async () => {
      const aavePool = this.aavePool.connect(this.users[0])
      await expect(aavePool.vote(generateRandomBytes32(), true))
        .to.revertedWith('Invalid proposal id')
    })

    it('fails when it is before bid end time', async () => {
      
    })

    it('fails the voter is not a winning bidder', async () => {
      const aavePool = this.aavePool.connect(this.users[1])
      const proposalId = bytes32(this.proposalId)
      await expect(aavePool.vote(proposalId, false))
        .to.revertedWith('You are not a highest bidder that is allowed to vote for this proposal')
    })
  })
})
