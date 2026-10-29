import { BrowserProvider, Contract, formatEther, id, isAddress, parseEther, type Eip1193Provider } from 'ethers';

export type Fee = { id: string; name: string; detail: string; naira: number; eth: string; active?: boolean };
export type Receipt = { id: string; feeId: string; feeName: string; amount: number; eth: string; date: string; payer: string; studentRef: string; studentName?: string; studentReg?: string; txHash?: string; contractAddress: string; chainId: number };
export type Profile = { name: string; reg: string; email: string; phone: string; faculty: string; department: string; level: string };
export type Deployment = { address: string; chainId: number; networkName?: string; ngnPerEth?: number };
export type Wallet = { address: string; owner: string; treasury: string; contract: Contract; provider: BrowserProvider; chainId: number; contractAddress: string };
export const defaultRate = 2000000;
const anvilRpcUrl = 'http://127.0.0.1:8545';
const anvilFunder = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720';

async function anvilRpc<T>(method: string, params: unknown[]): Promise<T> {
  let response: Response;
  try {
    response = await fetch(anvilRpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
  } catch {
    throw new Error('Could not reach Anvil at http://127.0.0.1:8545. Start it with npm run chain, then reconnect.');
  }
  const json = await response.json() as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message || 'Anvil rejected the request.');
  return json.result as T;
}

/// Sends local test ETH from a dedicated unlocked Anvil account; works for any connected wallet.
export async function fundTestEth(address: string, amountEth = '10'): Promise<string> {
  if (!isAddress(address)) throw new Error('Connect a wallet before adding test ETH.');
  if (Number(await anvilRpc<string>('eth_chainId', [])) !== 31337) throw new Error('Test ETH can only be added on the Anvil local network (chain 31337).');
  const txHash = await anvilRpc<string>('eth_sendTransaction', [{ from: anvilFunder, to: address, value: '0x' + parseEther(amountEth).toString(16) }]);
  for (let attempt = 0; attempt < 20; attempt++) {
    const receipt = await anvilRpc<{ status?: string } | null>('eth_getTransactionReceipt', [txHash]);
    if (receipt?.status === '0x1') return txHash;
    if (receipt) throw new Error('The test ETH transfer failed.');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Anvil did not confirm the test ETH transfer in time. Reconnect to retry.');
}

export function nairaToEth(naira: number, rate: number): string {
  if (!Number.isSafeInteger(naira) || naira < 0 || !Number.isSafeInteger(rate) || rate <= 0) throw new Error('Enter a whole-naira amount and a positive whole-naira exchange rate.');
  return formatEther((BigInt(naira) * 10n ** 18n + BigInt(rate) / 2n) / BigInt(rate));
}
export const fees: Fee[] = [
  { id: 'tuition-2025-26', name: 'Tuition & school charges', detail: 'Core academic and administrative fees', naira: 80000, eth: '0.04' },
  { id: 'development-2025-26', name: 'Development levy', detail: 'Campus infrastructure and facilities', naira: 16000, eth: '0.008' },
  { id: 'ict-2025-26', name: 'ICT & internet services', detail: 'Student portal and digital resources', naira: 8000, eth: '0.004' },
  { id: 'library-2025-26', name: 'Library services', detail: 'Library access and learning materials', naira: 6000, eth: '0.003' },
  { id: 'medical-2025-26', name: 'Medical & health services', detail: 'University health centre services', naira: 10000, eth: '0.005' },
];
export const defaultProfile: Profile = { name: '', reg: '', email: '', phone: '', faculty: 'Engineering', department: 'Electronics and Computer Engineering', level: '' };
export const abi = [
  'function owner() view returns (address)',
  'function treasury() view returns (address)',
  'function fees(bytes32) view returns (uint256 amountWei,bool active)',
  'function receipts(bytes32) view returns (address payer,uint256 amountWei,uint256 paidAt,bytes32 studentRef,bytes32 feeId)',
  'function getReceiptId(bytes32 studentRef,bytes32 feeId) pure returns (bytes32)',
  'function payFee(bytes32 feeId,bytes32 studentRef) payable',
  'function setFee(bytes32 feeId,uint256 amountWei,bool active)',
  'function withdraw()',
  'event FeePaid(bytes32 indexed receiptId,bytes32 indexed feeId,bytes32 indexed studentRef,address payer,uint256 amountWei)',
  'error Unauthorized()',
  'error InvalidStudentRef()',
  'error InactiveFee()',
  'error IncorrectAmount(uint256 expected, uint256 received)',
  'error AlreadyPaid(bytes32 receiptId)',
  'error ReentrantCall()',
  'error WithdrawalFailed()',
];
export const money = (n: number) => '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const short = (s: string) => s.length > 16 ? s.slice(0, 7) + '…' + s.slice(-5) : s;
export const studentReference = (reg: string) => id('unn-fees:' + reg.trim().toUpperCase());
export function readLocal<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
export function saveLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function walletProvider(): Eip1193Provider | undefined {
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
}
export async function addAnvilNetwork() {
  const ethereum = walletProvider();
  if (!ethereum) throw new Error('Open this site in MetaMask’s browser on Android, or install the MetaMask extension on your PC.');
  try { await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7a69' }] }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x7a69', chainName: 'Anvil Local', nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['http://127.0.0.1:8545'] }] });
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7a69' }] });
  }
}
export async function connectContract(address: string): Promise<Wallet> {
  if (!isAddress(address)) throw new Error('Enter the SchoolFees contract address printed by npm run contract:deploy.');
  const ethereum = walletProvider();
  if (!ethereum) throw new Error('Open this site in MetaMask’s browser on Android, or install the MetaMask extension on your PC.');
  const provider = new BrowserProvider(ethereum, undefined, { cacheTimeout: -1 });
  try {
    await provider.send('eth_requestAccounts', []);
    const chainId = Number((await provider.getNetwork()).chainId);
    if (chainId !== 31337) throw new Error('Switch MetaMask to Anvil Local (chain 31337). Public networks and real-money payments are disabled.');
    if (await provider.getCode(address) === '0x') throw new Error('No contract exists here. Start Anvil and deploy SchoolFees, then use the new address.');
    const signer = await provider.getSigner();
    const contract = new Contract(address, abi, signer);
    const [owner, treasury] = await Promise.all([contract.owner(), contract.treasury()]);
    return { address: await signer.getAddress(), owner, treasury, contract, provider, chainId, contractAddress: address };
  } catch (error) { provider.destroy(); throw error; }
}
export async function assertWallet(wallet: Wallet) {
  const ethereum = walletProvider();
  if (!ethereum) throw new Error('Reconnect your wallet.');
  const [chain, accounts] = await Promise.all([ethereum.request({ method: 'eth_chainId' }), ethereum.request({ method: 'eth_accounts' })]);
  if (Number(chain) !== 31337 || (accounts as string[])[0]?.toLowerCase() !== wallet.address.toLowerCase()) throw new Error('Your wallet changed. Reconnect before continuing.');
}
export async function chainReceipts(wallet: Wallet, reg: string): Promise<Receipt[]> {
  if (!reg) return [];
  const ref = studentReference(reg);
  const result = await Promise.all(fees.map(async (fee) => {
    const key = await wallet.contract.getReceiptId(ref, id(fee.id));
    const receipt = await wallet.contract.receipts(key);
    if (receipt.paidAt === 0n) return null;
    const saved = readLocal<Partial<Receipt>>(`lionpay-receipt:${wallet.chainId}:${wallet.contractAddress.toLowerCase()}:${key}`, {});
    return { id: key, feeId: fee.id, feeName: fee.name, amount: fee.naira, eth: formatEther(receipt.amountWei), date: new Date(Number(receipt.paidAt) * 1000).toISOString(), payer: receipt.payer, studentRef: receipt.studentRef, studentName: saved.studentName, studentReg: saved.studentReg || reg, txHash: saved.txHash, contractAddress: wallet.contractAddress, chainId: wallet.chainId };
  }));
  return result.filter(r => r !== null).sort((a, b) => b.date.localeCompare(a.date));
}
export async function payOnChain(wallet: Wallet, fee: Fee, profile: Profile): Promise<Receipt> {
  await assertWallet(wallet);
  if (await wallet.provider.getCode(wallet.contractAddress) === '0x') throw new Error('No SchoolFees contract exists at this address on Anvil. The chain was reset or redeployed; reconnect with the current contract.');
  const ref = studentReference(profile.reg);
  const feeKey = id(fee.id);
  const quote = await wallet.contract.fees(feeKey);
  if (!quote.active) throw new Error('This fee is inactive. Contact the bursary administrator.');
  if (quote.amountWei !== parseEther(fee.eth)) throw new Error('The contract fee changed. Refresh the schedule before paying.');
  const key = await wallet.contract.getReceiptId(ref, feeKey);
  const existing = await wallet.contract.receipts(key);
  if (existing.paidAt !== 0n) throw new Error(`This fee is already paid for registration number ${profile.reg}. Each registration number can pay a fee once; switch to a different fee or student profile.`);
  const balance = await wallet.provider.getBalance(wallet.address);
  if (balance < quote.amountWei) throw new Error(`This wallet has ${formatEther(balance)} test ETH, but the fee costs ${formatEther(quote.amountWei)}. Reconnect to add test ETH automatically, or run: node blockchain/fund.mjs ${wallet.address}`);
  try { await wallet.contract.payFee.staticCall(feeKey, ref, { value: quote.amountWei }); }
  catch (error) { throw new Error(errorMessage(error)); }
  const tx = await wallet.contract.payFee(feeKey, ref, { value: quote.amountWei });
  const mined = await tx.wait();
  if (!mined || mined.status !== 1) throw new Error('Payment was not confirmed. Check your wallet before retrying.');
  const stored = await wallet.contract.receipts(key);
  const result: Receipt = { id: key, feeId: fee.id, feeName: fee.name, amount: fee.naira, eth: formatEther(stored.amountWei), date: new Date(Number(stored.paidAt) * 1000).toISOString(), payer: stored.payer, studentRef: stored.studentRef, studentName: profile.name, studentReg: profile.reg, txHash: tx.hash, contractAddress: wallet.contractAddress, chainId: wallet.chainId };
  saveLocal(`lionpay-receipt:${wallet.chainId}:${wallet.contractAddress.toLowerCase()}:${key}`, result);
  return result;
}
export function errorMessage(error: unknown): string {
  const e = error as { code?: string | number; shortMessage?: string; message?: string; revert?: { name?: string }; info?: { error?: { message?: string } } };
  const revert = e.revert?.name;
  const raw = [e.shortMessage, e.message, e.info?.error?.message].filter(Boolean).join(' ');
  if (revert === 'AlreadyPaid' || /AlreadyPaid/.test(raw)) return 'This fee is already paid for this registration number. Each registration number can pay a fee once; switch to a different fee or student profile.';
  if (revert === 'IncorrectAmount' || /IncorrectAmount/.test(raw)) return 'The contract fee amount changed while you were paying. The schedule has been refreshed; review the new amount and try again.';
  if (revert === 'InactiveFee' || /InactiveFee/.test(raw)) return 'This fee is inactive on the contract. Contact the bursary administrator.';
  if (revert === 'InvalidStudentRef' || /InvalidStudentRef/.test(raw)) return 'The registration number did not produce a valid student reference. Re-save your profile and try again.';
  if (revert === 'Unauthorized' || /Unauthorized/.test(raw)) return 'Only the contract owner wallet can perform this action.';
  if (e.code === 'ACTION_REJECTED' || e.code === 4001) return 'Wallet request cancelled. No new transaction was sent.';
  if (e.code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(raw)) return 'This wallet needs more test ETH for the fee and gas. Reconnect so the portal can add it automatically, or run: node blockchain/fund.mjs YOUR_ADDRESS';
  if (/nonce too low|replacement transaction underpriced|already known|nonce has already been used/i.test(raw)) return 'MetaMask is out of sync with the local Anvil chain. In MetaMask, open Settings → Advanced → Clear activity tab data for this account, then reconnect and retry.';
  if (/could not coalesce error|failed to fetch|ECONNREFUSED|network error|missing response/i.test(raw)) return 'The local Anvil chain is not reachable at http://127.0.0.1:8545. Open the LionPay Anvil chain on this PC (or run npm run chain in the project folder), wait for it to start, then reconnect your wallet.';
  if (/missing revert data/i.test(raw)) return 'MetaMask could not simulate this payment. The fee may already be paid for this registration number, the contract may have changed, or the wallet lacks test ETH. Refresh and reconnect; if the chain was reset, clear MetaMask activity data for this account.';
  return e.shortMessage || e.message || 'Something went wrong. Please try again.';
}
export function downloadFile(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
