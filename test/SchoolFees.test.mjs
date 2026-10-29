import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';
import ganache from 'ganache';
import solc from 'solc';
import {
  AbiCoder,
  BrowserProvider,
  Contract,
  ContractFactory,
  ZeroAddress,
  ZeroHash,
  id,
  keccak256,
  parseEther,
} from 'ethers';
import { compile } from '../blockchain/compile.mjs';

const FEE_ID = id('tuition-2025-26');
const SECOND_FEE_ID = id('library-2025-26');
const STUDENT_REF = id('opaque-random-reference-a');
const OTHER_STUDENT_REF = id('opaque-random-reference-b');
const AMOUNT = parseEther('0.04');

async function mined(transactionPromise) {
  return (await transactionPromise).wait();
}

async function expectCustomError(transactionPromise, contract, expectedName) {
  await assert.rejects(transactionPromise, (error) => {
    const data = error.data ?? error.info?.error?.data?.result;
    assert.ok(typeof data === 'string', `Missing revert data: ${error.message}`);
    assert.equal(contract.interface.parseError(data)?.name, expectedName);
    return true;
  });
}

// A contract that owns the fee collector and is its treasury exercises callbacks
// with owner privileges, so only the reentrancy guard can block nested withdrawals.
async function compileTreasuryProbe() {
  const source = await readFile(new URL('../contracts/SchoolFees.sol', import.meta.url), 'utf8');
  const probe = `
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.24;
    import "SchoolFees.sol";

    contract TreasuryProbe {
        SchoolFees public school;
        uint256 public mode;
        bytes4 public blockedBy;
        bytes32 private constant FEE_ID = keccak256("tuition-2025-26");
        bytes32 private constant REFERENCE = keccak256("callback-reference");

        constructor() {
            school = new SchoolFees(address(this));
            school.setFee(FEE_ID, 0.04 ether, true);
        }

        function setMode(uint256 nextMode) external { mode = nextMode; }
        function withdraw() external { school.withdraw(); }

        receive() external payable {
            if (mode == 3) revert("Treasury refuses transfer");
            if (mode == 1 || mode == 2) {
                bytes memory payload = mode == 1
                    ? abi.encodeCall(SchoolFees.withdraw, ())
                    : abi.encodeCall(SchoolFees.payFee, (FEE_ID, REFERENCE));
                uint256 value = mode == 2 ? 0.04 ether : 0;
                (bool success, bytes memory result) = address(school).call{value: value}(payload);
                require(!success, "Reentrancy unexpectedly succeeded");
                blockedBy = bytes4(result);
            }
        }
    }
  `;
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: {
      'SchoolFees.sol': { content: source },
      'TreasuryProbe.sol': { content: probe },
    },
    settings: {
      evmVersion: 'shanghai',
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  })));
  const errors = (output.errors ?? []).filter(({ severity }) => severity === 'error');
  assert.deepEqual(errors, []);
  const contract = output.contracts['TreasuryProbe.sol'].TreasuryProbe;
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

describe('SchoolFees native ETH payments', { concurrency: false }, () => {
  let chain;
  let provider;
  let artifact;
  let probeArtifact;
  let owner;
  let treasury;
  let student;
  let otherWallet;
  let school;
  let address;

  before(async () => {
    artifact = await compile({ writeArtifact: false });
    probeArtifact = await compileTreasuryProbe();
    chain = ganache.provider({
      chain: { chainId: 1337, hardfork: 'shanghai' },
      wallet: { totalAccounts: 5, defaultBalance: 1000 },
      logging: { quiet: true },
    });
    provider = new BrowserProvider(chain, undefined, { cacheTimeout: -1 });
    provider.pollingInterval = 10;
    [owner, treasury, student, otherWallet] = await Promise.all(
      [0, 1, 2, 3].map((index) => provider.getSigner(index)),
    );
  });

  beforeEach(async () => {
    school = await new ContractFactory(artifact.abi, artifact.bytecode, owner)
      .deploy(await treasury.getAddress());
    await school.waitForDeployment();
    address = await school.getAddress();
    await mined(school.setFee(FEE_ID, AMOUNT, true));
  });

  after(async () => {
    provider?.destroy();
    await chain?.disconnect();
  });

  it('sets immutable owner and treasury and exposes the fee tuple', async () => {
    assert.equal(await school.owner(), await owner.getAddress());
    assert.equal(await school.treasury(), await treasury.getAddress());
    const fee = await school.fees(FEE_ID);
    assert.equal(fee.amountWei, AMOUNT);
    assert.equal(fee.active, true);
    assert.equal((await provider.getNetwork()).chainId, 1337n);
  });

  it('rejects a zero treasury address', async () => {
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
    const transaction = await factory.getDeployTransaction(ZeroAddress);
    await expectCustomError(owner.call(transaction), school, 'InvalidTreasury');
  });

  it('allows only the owner to add, update, and deactivate a fee', async () => {
    await expectCustomError(
      school.connect(student).setFee.staticCall(FEE_ID, 1n, false), school, 'Unauthorized',
    );
    await expectCustomError(
      school.connect(treasury).setFee.staticCall(SECOND_FEE_ID, 1n, true), school, 'Unauthorized',
    );
    await assert.rejects(mined(school.connect(student).setFee(FEE_ID, 1n, false, {
      gasLimit: 100_000,
    })));
    assert.deepEqual(Array.from(await school.fees(FEE_ID)), [AMOUNT, true]);
    await mined(school.setFee(FEE_ID, 2n, false));
    assert.deepEqual(Array.from(await school.fees(FEE_ID)), [2n, false]);
    await mined(school.setFee(FEE_ID, AMOUNT, true));
    assert.deepEqual(Array.from(await school.fees(FEE_ID)), [AMOUNT, true]);
  });

  it('mines exact ETH payments and records the full receipt and indexed event', async () => {
    const transactionReceipt = await mined(
      school.connect(student).payFee(FEE_ID, STUDENT_REF, { value: AMOUNT }),
    );
    assert.equal(transactionReceipt.status, 1);
    const receiptId = keccak256(AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32'], [STUDENT_REF, FEE_ID],
    ));
    assert.equal(await school.getReceiptId(STUDENT_REF, FEE_ID), receiptId);
    const stored = await school.receipts(receiptId);
    const block = await provider.getBlock(transactionReceipt.blockNumber);
    assert.deepEqual(Array.from(stored), [
      await student.getAddress(), AMOUNT, BigInt(block.timestamp), STUDENT_REF, FEE_ID,
    ]);
    assert.equal(await provider.getBalance(address), AMOUNT);
    const event = transactionReceipt.logs.map((log) => school.interface.parseLog(log))
      .find((log) => log?.name === 'FeePaid');
    assert.ok(event);
    assert.deepEqual(Array.from(event.args), [
      receiptId, FEE_ID, STUDENT_REF, await student.getAddress(), AMOUNT,
    ]);
    assert.deepEqual(Array.from(transactionReceipt.logs[0].topics).slice(1), [
      receiptId, FEE_ID, STUDENT_REF,
    ]);
  });

  it('rejects both underpayment and overpayment without storing a receipt', async () => {
    for (const value of [0n, AMOUNT - 1n, AMOUNT + 1n]) {
      await expectCustomError(
        school.connect(student).payFee.staticCall(FEE_ID, STUDENT_REF, { value }),
        school, 'IncorrectAmount',
      );
    }
    // Supplying gas bypasses estimation and proves a rejected payment is mined as a revert.
    await assert.rejects(mined(school.connect(student).payFee(FEE_ID, STUDENT_REF, {
      value: AMOUNT - 1n, gasLimit: 200_000,
    })));
    const receiptId = await school.getReceiptId(STUDENT_REF, FEE_ID);
    assert.equal((await school.receipts(receiptId)).payer, ZeroAddress);
    assert.equal(await provider.getBalance(address), 0n);
  });

  it('rejects inactive and unknown fee IDs', async () => {
    await expectCustomError(
      school.connect(student).payFee.staticCall(SECOND_FEE_ID, STUDENT_REF, { value: 0n }),
      school, 'InactiveFee',
    );
    await mined(school.setFee(FEE_ID, AMOUNT, false));
    await expectCustomError(
      school.connect(student).payFee.staticCall(FEE_ID, STUDENT_REF, { value: AMOUNT }),
      school, 'InactiveFee',
    );
  });

  it('rejects the zero student reference', async () => {
    await expectCustomError(
      school.connect(student).payFee.staticCall(FEE_ID, ZeroHash, { value: AMOUNT }),
      school, 'InvalidStudentRef',
    );
  });

  it('rejects duplicate student/fee pairs from both original and different wallets', async () => {
    await mined(school.connect(student).payFee(FEE_ID, STUDENT_REF, { value: AMOUNT }));
    for (const wallet of [student, otherWallet]) {
      await expectCustomError(
        school.connect(wallet).payFee.staticCall(FEE_ID, STUDENT_REF, { value: AMOUNT }),
        school, 'AlreadyPaid',
      );
    }
    await assert.rejects(mined(school.connect(otherWallet).payFee(FEE_ID, STUDENT_REF, {
      value: AMOUNT, gasLimit: 200_000,
    })));
    await mined(school.setFee(FEE_ID, 1n, true));
    await expectCustomError(
      school.connect(otherWallet).payFee.staticCall(FEE_ID, STUDENT_REF, { value: 1n }),
      school, 'AlreadyPaid',
    );
    const receipt = await school.receipts(await school.getReceiptId(STUDENT_REF, FEE_ID));
    assert.equal(receipt.payer, await student.getAddress());
    assert.equal(receipt.amountWei, AMOUNT);
    assert.equal(await provider.getBalance(address), AMOUNT);
  });

  it('accepts a different student for the same fee and a different fee for the same student', async () => {
    await mined(school.setFee(SECOND_FEE_ID, 1n, true));
    await mined(school.connect(student).payFee(FEE_ID, STUDENT_REF, { value: AMOUNT }));
    await mined(school.connect(student).payFee(FEE_ID, OTHER_STUDENT_REF, { value: AMOUNT }));
    await mined(school.connect(otherWallet).payFee(SECOND_FEE_ID, STUDENT_REF, { value: 1n }));
    assert.equal(await provider.getBalance(address), AMOUNT * 2n + 1n);
    for (const [reference, fee] of [
      [STUDENT_REF, FEE_ID], [OTHER_STUDENT_REF, FEE_ID], [STUDENT_REF, SECOND_FEE_ID],
    ]) {
      assert.notEqual((await school.receipts(await school.getReceiptId(reference, fee))).payer, ZeroAddress);
    }
  });

  it('rejects withdrawals by non-owners, including a separate treasury wallet', async () => {
    await mined(school.connect(student).payFee(FEE_ID, STUDENT_REF, { value: AMOUNT }));
    for (const wallet of [student, treasury]) {
      await expectCustomError(school.connect(wallet).withdraw.staticCall(), school, 'Unauthorized');
    }
    await assert.rejects(mined(school.connect(student).withdraw({ gasLimit: 100_000 })));
    assert.equal(await provider.getBalance(address), AMOUNT);
  });

  it('withdraws only to the fixed treasury and preserves receipts and duplicate protection', async () => {
    await mined(school.connect(student).payFee(FEE_ID, STUDENT_REF, { value: AMOUNT }));
    const treasuryAddress = await treasury.getAddress();
    const balanceBefore = await provider.getBalance(treasuryAddress);
    await mined(school.withdraw());
    assert.equal(await provider.getBalance(treasuryAddress), balanceBefore + AMOUNT);
    assert.equal(await provider.getBalance(address), 0n);
    assert.equal((await school.receipts(await school.getReceiptId(STUDENT_REF, FEE_ID))).amountWei, AMOUNT);
    await expectCustomError(
      school.connect(otherWallet).payFee.staticCall(FEE_ID, STUDENT_REF, { value: AMOUNT }),
      school, 'AlreadyPaid',
    );
    // Successful withdrawal releases the guard for subsequent payments.
    await mined(school.connect(student).payFee(FEE_ID, OTHER_STUDENT_REF, { value: AMOUNT }));
    await mined(school.withdraw());
    assert.equal(await provider.getBalance(treasuryAddress), balanceBefore + AMOUNT * 2n);
  });

  async function deployProbe() {
    const probe = await new ContractFactory(probeArtifact.abi, probeArtifact.bytecode, owner).deploy();
    await probe.waitForDeployment();
    const collector = new Contract(await probe.school(), artifact.abi, student);
    await mined(collector.payFee(FEE_ID, STUDENT_REF, { value: AMOUNT }));
    return { probe, collector };
  }

  for (const [mode, operation] of [[1, 'withdraw'], [2, 'payFee']]) {
    it(`blocks reentrant ${operation} from the owner treasury callback`, async () => {
      const { probe, collector } = await deployProbe();
      await mined(probe.setMode(mode));
      await mined(probe.withdraw());
      assert.equal(await probe.blockedBy(), collector.interface.getError('ReentrantCall').selector);
      assert.equal(await provider.getBalance(await collector.getAddress()), 0n);
      assert.equal(await provider.getBalance(await probe.getAddress()), AMOUNT);
      const callbackReceiptId = await collector.getReceiptId(id('callback-reference'), FEE_ID);
      assert.equal((await collector.receipts(callbackReceiptId)).payer, ZeroAddress);
    });
  }

  it('reverts a refused treasury transfer without losing funds or leaving the guard locked', async () => {
    const { probe, collector } = await deployProbe();
    await mined(probe.setMode(3));
    await expectCustomError(probe.withdraw.staticCall(), collector, 'WithdrawalFailed');
    await assert.rejects(mined(probe.withdraw({ gasLimit: 200_000 })));
    assert.equal(await provider.getBalance(await collector.getAddress()), AMOUNT);
    await mined(probe.setMode(0));
    await mined(probe.withdraw());
    assert.equal(await provider.getBalance(await collector.getAddress()), 0n);
    assert.equal(await provider.getBalance(await probe.getAddress()), AMOUNT);
  });
});
