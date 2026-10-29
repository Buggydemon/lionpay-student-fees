import { JsonRpcProvider, ZeroAddress, isAddress, parseEther } from 'ethers';

const address = process.argv[2];
const provider = new JsonRpcProvider('http://127.0.0.1:8545');

try {
  if (!address || !isAddress(address) || address === ZeroAddress) throw new Error('Usage: node blockchain/fund.mjs YOUR_METAMASK_PUBLIC_ADDRESS');
  const network = await provider.getNetwork();
  if (network.chainId !== 31337n) throw new Error('Funding is allowed only on Anvil local chain 31337. No transaction sent.');
  const signer = await provider.getSigner(0);
  const transaction = await signer.sendTransaction({ to: address, value: parseEther('10') });
  const receipt = await transaction.wait();
  if (receipt.status !== 1) throw new Error('Funding transaction was not confirmed.');
  console.log(`Sent 10 local test ETH to ${address}. Transaction: ${transaction.hash}`);
  console.log('These funds exist only on your local Anvil network and have no monetary value.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  provider.destroy();
}
