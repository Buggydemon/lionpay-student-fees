import { ethers } from 'ethers';
import fs from 'node:fs';

const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const deployment = JSON.parse(fs.readFileSync(new URL('./deployment.json', import.meta.url), 'utf8'));
const contractAddress = deployment.address.toLowerCase();

const selectors = {};
for (const fn of ['setFee(bytes32,uint256,bool)', 'payFee(bytes32,bytes32)', 'withdraw()']) {
  selectors[new ethers.Interface(deployment.abi).getFunction(fn).selector] = fn;
}

const latest = await provider.getBlockNumber();
const stats = {};
const samples = [];
let deployCount = 0;

for (let n = 0; n <= latest; n++) {
  const block = await provider.getBlock(n, false);
  if (!block) continue;
  for (const hash of block.transactions) {
    if (!hash) continue;
    let receipt, tx;
    try {
      receipt = await provider.getTransactionReceipt(hash);
      if (!receipt || receipt.status !== 1) continue;
      tx = await provider.getTransaction(hash);
    } catch (e) {
      continue;
    }
    if (!tx) continue;
    let action;
    if (!tx.to) { action = 'deploy SchoolFees'; deployCount++; }
    else if (tx.to.toLowerCase() !== contractAddress) continue;
    else {
      const selector = (tx.data || '').slice(0, 10);
      action = selectors[selector] || `unknown ${selector}`;
    }
    const gas = Number(receipt.gasUsed);
    stats[action] ??= { count: 0, total: 0, min: Infinity, max: 0 };
    const s = stats[action];
    s.count++; s.total += gas; s.min = Math.min(s.min, gas); s.max = Math.max(s.max, gas);
    samples.push({ block: n, hash, action, gas });
  }
}

const summary = Object.entries(stats).map(([action, s]) => ({
  action, count: s.count, avgGas: Math.round(s.total / s.count), minGas: s.min, maxGas: s.max,
}));

fs.writeFileSync(new URL('./gas-report.json', import.meta.url), JSON.stringify({ latestBlock: latest, summary, samples }, null, 2));
console.log(`Scanned blocks 0-${latest}. Contract ${deployment.address}. Deploys: ${deployCount}`);
console.table(summary);
