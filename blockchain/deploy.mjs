import { mkdir, writeFile } from 'node:fs/promises';
import { ContractFactory, JsonRpcProvider, formatEther, id } from 'ethers';
import { compile } from './compile.mjs';

const rpcUrl = 'http://127.0.0.1:8545';
const provider = new JsonRpcProvider(rpcUrl);

try {
  // Manual project reference rate, not a live exchange-rate feed.
  const rateInput = process.env.NGN_PER_ETH ?? '2000000';
  const ngnPerEth = Number(rateInput);
  if (!/^\d+$/.test(rateInput) || !Number.isSafeInteger(ngnPerEth) || ngnPerEth <= 0) {
    throw new Error('NGN_PER_ETH must be a positive safe integer in whole NGN per ETH. No deployment sent.');
  }
  const rate = BigInt(ngnPerEth);
  const network = await provider.getNetwork();
  if (network.chainId !== 31337n) {
    throw new Error(`Expected Anvil local chain ID 31337, received ${network.chainId}. No deployment sent.`);
  }
  const artifact = await compile();
  console.log(`Anvil local: manual reference rate NGN ${ngnPerEth.toLocaleString('en-NG')} per ETH (not live).`);

  const signer = await provider.getSigner(0);
  const treasuryAddress = await signer.getAddress();
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(treasuryAddress);
  await contract.waitForDeployment();
  console.log(`SchoolFees deployed at ${await contract.getAddress()}`);

  const fees = [
    ['tuition-2025-26', 80000],
    ['development-2025-26', 16000],
    ['ict-2025-26', 8000],
    ['library-2025-26', 6000],
    ['medical-2025-26', 10000],
  ];
  for (const [name, naira] of fees) {
    // Exact bigint conversion, rounded half-up to the nearest wei.
    const amountWei = (BigInt(naira) * 10n ** 18n + rate / 2n) / rate;
    const transaction = await contract.setFee(id(name), amountWei, true);
    await transaction.wait();
    console.log(`Seeded ${name}: NGN ${naira} = ${formatEther(amountWei)} ETH (${transaction.hash})`);
  }

  // Only publish configuration after the deployment and every seed transaction are mined.
  const deployment = {
    address: await contract.getAddress(),
    chainId: 31337,
    networkName: 'Anvil local',
    rpcUrl,
    ngnPerEth,
    abi: artifact.abi,
  };
  const serialized = `${JSON.stringify(deployment, null, 2)}\n`;
  await writeFile(new URL('./deployment.json', import.meta.url), serialized);
  await mkdir(new URL('../public/', import.meta.url), { recursive: true });
  await writeFile(new URL('../public/deployment.json', import.meta.url), serialized);
  console.log('Wrote blockchain/deployment.json and public/deployment.json.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  provider.destroy();
}
