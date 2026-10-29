import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowDownToLine, ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Copy, CreditCard, ExternalLink, FileText, GraduationCap, LayoutDashboard, Leaf, Link2, LoaderCircle, LogOut, Menu, Moon, MoreHorizontal, RefreshCw, Search, Settings2, Shield, ShieldCheck, SlidersHorizontal, Sparkles, Sun, UserRound, Wallet as WalletIcon, X } from 'lucide-react';
import { formatEther, id, isHexString, parseEther } from 'ethers';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { abi, addAnvilNetwork, assertWallet, chainReceipts, connectContract, defaultProfile, defaultRate, downloadFile, errorMessage, fees, fundTestEth, money, nairaToEth, payOnChain, readLocal, saveLocal, short, studentReference, walletProvider, type Fee, type Profile, type Receipt, type Wallet, type Deployment } from './portal';

type Page = 'Overview' | 'Pay school fees' | 'Payment history' | 'Verify receipt' | 'My profile' | 'Help & support' | 'Bursary workspace';
const navigation: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard }, { label: 'Pay school fees', icon: CreditCard }, { label: 'Payment history', icon: FileText }, { label: 'Verify receipt', icon: ShieldCheck }, { label: 'My profile', icon: UserRound }, { label: 'Bursary workspace', icon: Settings2 },
];
function Crest({ small = false }: { small?: boolean }) { return <div className={`crest ${small ? 'small' : ''}`}><Shield strokeWidth={1.4} /><div><Leaf size={small ? 12 : 18} /><BookOpen size={small ? 13 : 20} /></div></div>; }
function Badge({ children, kind = 'green' }: { children: ReactNode; kind?: string }) { return <span className={`badge ${kind}`}><span className="status-dot" />{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><FileText /><h3>{title}</h3><p>{text}</p></div>; }

export default function App() {
  const [page, setPage] = useState<Page>('Overview');
  const [profile, setProfile] = useState<Profile>(() => ({ ...defaultProfile, ...readLocal<Partial<Profile>>('unn-profile', {}) }));
  const [draftProfile, setDraftProfile] = useState(profile);
  const [profiles, setProfiles] = useState<Profile[]>(() => readLocal('lionpay-profiles', []));
  const [onChainReceipts, setOnChainReceipts] = useState<Receipt[]>([]);
  const [feeSchedule, setFeeSchedule] = useState(fees);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [contractBalance, setContractBalance] = useState<bigint | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readLocal('lionpay-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [unread, setUnread] = useState(true);
  const [contractAddress, setContractAddress] = useState('');
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [selectedFee, setSelectedFee] = useState<Fee | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [verifyInput, setVerifyInput] = useState('');
  const [verified, setVerified] = useState<Receipt | null>(null);
  const [verifyError, setVerifyError] = useState('');
  const [adminFee, setAdminFee] = useState(fees[0].id);
  const [adminAmount, setAdminAmount] = useState(fees[0].eth);
  const [adminActive, setAdminActive] = useState(true);
  const [adminNotice, setAdminNotice] = useState('');
  const [session, setSession] = useState('2025 / 2026');
  const [helpOpen, setHelpOpen] = useState<number | null>(0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [rate, setRate] = useState(() => String(readLocal('lionpay-rate', defaultRate)));
  const [conversionAmount, setConversionAmount] = useState('80000');
  const contextVersion = useRef(0);
  const syncId = useRef(0);
  const activeReceipts = session === '2025 / 2026' ? onChainReceipts.filter(r => profile.reg && r.studentRef === studentReference(profile.reg)) : [];
  const schedule = session === '2025 / 2026' ? feeSchedule : [];
  const paidIds = new Set(activeReceipts.map(r => r.feeId));
  const total = schedule.reduce((sum, f) => sum + f.naira, 0);
  const paid = schedule.filter(f => paidIds.has(f.id)).reduce((sum, f) => sum + f.naira, 0);
  const outstanding = total - paid;
  const currentEth = schedule.filter(f => !paidIds.has(f.id)).reduce((sum, f) => sum + Number(f.eth), 0);
  const completed = schedule.length > 0 && paidIds.size >= schedule.length;
  const firstName = profile.name.trim().split(' ')[0] || 'student';
  const balanceEth = walletBalance === null ? '' : Number(formatEther(walletBalance)).toLocaleString('en-US', { maximumFractionDigits: 4 });
  const contractBalanceEth = contractBalance === null ? '' : Number(formatEther(contractBalance)).toLocaleString('en-US', { maximumFractionDigits: 4 });
  const initials = profile.name.trim().split(/\s+/).filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'LP';
  const owner = !!wallet && wallet.address.toLowerCase() === wallet.owner.toLowerCase();
  const rateNumber = Number(rate);
  const rateValid = rate.trim() !== '' && Number.isSafeInteger(rateNumber) && rateNumber > 0;
  const amountNumber = Number(conversionAmount);
  const amountValid = conversionAmount.trim() !== '' && Number.isSafeInteger(amountNumber) && amountNumber >= 0;
  const converted = rateValid && amountValid ? nairaToEth(amountNumber, rateNumber) : null;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    fetch('/deployment.json', { cache: 'no-store' }).then(async r => {
      if (r.ok && r.headers.get('content-type')?.includes('json')) {
        const d: Deployment = await r.json();
        if (d.address && d.chainId === 31337) { setDeployment(d); setContractAddress(d.address); }
      }
    }).catch(() => {});
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; saveLocal('lionpay-theme', theme); }, [theme]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    const provider = walletProvider() as unknown as { on?: (e: string, f: () => void) => void; removeListener?: (e: string, f: () => void) => void } | undefined;
    const reset = () => {
      contextVersion.current++;
      setWallet(null); setWalletBalance(null); setContractBalance(null); setOnChainReceipts([]); setFeeSchedule(fees); setSelectedFee(null); setVerified(null); setReceipt(null); setWithdrawOpen(false); setRateOpen(false);
      setToast('Wallet changed. Reconnect to load the correct contract and student records.');
    };
    if (wallet) { provider?.on?.('accountsChanged', reset); provider?.on?.('chainChanged', reset); }
    return () => { provider?.removeListener?.('accountsChanged', reset); provider?.removeListener?.('chainChanged', reset); wallet?.provider.destroy(); };
  }, [wallet]);
  const go = (next: Page) => { if (busy) return; setPage(next); setError(''); setMobileMenu(false); setSearch(''); };
  async function syncChain(w: Wallet, reg = profile.reg) {
    const version = contextVersion.current;
    const requestId = ++syncId.current;
    const [records, quotes, contractEth] = await Promise.all([chainReceipts(w, reg), Promise.all(fees.map(async f => { const q = await w.contract.fees(id(f.id)); return { ...f, eth: formatEther(q.amountWei), active: q.active as boolean }; })), w.provider.getBalance(w.contractAddress)]);
    if (version !== contextVersion.current || requestId !== syncId.current) return;
    setOnChainReceipts(records); setFeeSchedule(quotes); setContractBalance(contractEth);
  }
  async function refreshBalance(w: Wallet) {
    const version = contextVersion.current;
    try {
      const value = await w.provider.getBalance(w.address);
      if (version === contextVersion.current) setWalletBalance(value);
    } catch { /* keep the last known balance */ }
  }
  async function refreshContractBalance(w: Wallet) {
    const version = contextVersion.current;
    try {
      const value = await w.provider.getBalance(w.contractAddress);
      if (version === contextVersion.current) setContractBalance(value);
    } catch { /* keep the last known balance */ }
  }
  async function connect() {
    setBusy(true); setError('');
    try {
      const w = await connectContract(contractAddress.trim());
      await syncChain(w); setWallet(w);
      let funded = false;
      try {
        let balance = await w.provider.getBalance(w.address);
        if (balance < parseEther('1')) { await fundTestEth(w.address); funded = true; balance = await w.provider.getBalance(w.address); }
        setWalletBalance(balance);
        setToast(funded ? `Anvil wallet connected. 10 local test ETH added to ${short(w.address)}.` : 'Anvil wallet connected. Fees and receipts are read from the smart contract.');
      } catch (topUpError) {
        setError(`Wallet connected, but test ETH could not be added automatically. ${errorMessage(topUpError)}`);
      }
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  function disconnect() {
    contextVersion.current++; setWallet(null); setWalletBalance(null); setContractBalance(null); setOnChainReceipts([]); setFeeSchedule(fees); setVerified(null); setReceipt(null); setWalletOpen(false); setError('');
    setToast('Wallet disconnected. Connect again to read payment records.');
  }
  async function networkSetup() {
    setBusy(true); setError('');
    try { await addAnvilNetwork(); setToast('Anvil network selected. Connect your wallet to the deployed contract.'); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  function reviewFee(fee: Fee) {
    if (busy) return;
    setError('');
    if (!profile.name || !profile.reg || !profile.level) { go('My profile'); setToast('Save your name, registration number and level before paying.'); return; }
    if (!wallet) { setWalletOpen(true); return; }
    void refreshBalance(wallet);
    setSelectedFee(fee);
  }
  async function pay() {
    if (!selectedFee || !wallet || busy) return;
    const version = contextVersion.current;
    setBusy(true); setError('');
    try {
      const result = await payOnChain(wallet, selectedFee, profile);
      if (version !== contextVersion.current) { setToast('Transaction mined. Reconnect to the original network to read its receipt.'); return; }
      void refreshBalance(wallet);
      setOnChainReceipts(prev => [result, ...prev.filter(r => r.feeId !== result.feeId)]);
      setSelectedFee(null); setReceipt(result); setToast('Payment confirmed on Anvil. Your receipt is ready.');
    } catch (e) {
      setError(errorMessage(e));
      try { await syncChain(wallet); } catch { /* keep the payment error visible */ }
      void refreshBalance(wallet);
      setSelectedFee(null);
    } finally { setBusy(false); }
  }
  function downloadReceipt(r: Receipt) {
    downloadFile(`${r.id}-receipt.txt`, `LIONPAY | STUDENT FEE RECEIPT\nANVIL LOCAL NETWORK — TEST ETH\n\nReceipt: ${r.id}\nName: ${r.studentName || 'Not stored on this device'}\nRegistration number: ${r.studentReg || 'Not stored on this device'}\nStudent reference: ${r.studentRef}\nFee: ${r.feeName}\nAcademic session: 2025 / 2026\nNGN fee: ${money(r.amount)}\nOn-chain payment: ${r.eth} test ETH\nDate: ${new Date(r.date).toLocaleString()}\nPayer: ${r.payer}\nContract: ${r.contractAddress}\nChain ID: ${r.chainId}\n${r.txHash ? 'Transaction: ' + r.txHash + '\n' : ''}\nIndependent academic project, not affiliated with UNN. Not valid for university clearance. Names and registration numbers are device-local profile details, not verified enrollment data.`);
    setToast('Receipt downloaded.');
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setVerified(null); setVerifyError(''); setBusy(true);
    const version = contextVersion.current;
    const query = verifyInput.trim();
    try {
      if (!isHexString(query, 32)) throw new Error('Enter a 32-byte receipt ID: 0x followed by 64 hexadecimal characters.');
      if (!wallet) throw new Error('Connect to the Anvil contract that processed the payment.');
      await assertWallet(wallet);
      const result = await wallet.contract.receipts(query);
      if (result.paidAt === 0n) throw new Error('No receipt was found on this contract. Check the ID and selected network.');
      const fee = fees.find(f => id(f.id) === result.feeId);
      const saved = readLocal<Partial<Receipt>>(`lionpay-receipt:${wallet.chainId}:${wallet.contractAddress.toLowerCase()}:${query.toLowerCase()}`, {});
      const knownProfile = profiles.find(p => studentReference(p.reg) === result.studentRef);
      if (version !== contextVersion.current) return;
      setVerified({ id: query, feeId: fee?.id || result.feeId, feeName: fee?.name || 'Contract fee', amount: fee?.naira || 0, eth: formatEther(result.amountWei), date: new Date(Number(result.paidAt) * 1000).toISOString(), payer: result.payer, studentRef: result.studentRef, studentName: saved.studentName || knownProfile?.name, studentReg: saved.studentReg || knownProfile?.reg, txHash: saved.txHash, contractAddress: wallet.contractAddress, chainId: wallet.chainId });
    } catch (e) { setVerifyError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setError('');
    const next = { ...draftProfile, name: draftProfile.name.trim(), reg: draftProfile.reg.trim().toUpperCase(), faculty: draftProfile.faculty.trim(), department: draftProfile.department.trim() };
    if (!next.name || !/^[A-Z0-9/-]{5,30}$/.test(next.reg) || !next.faculty || !next.department || !['100', '200', '300', '400', '500', '600'].includes(next.level)) { setError('Enter a name, valid registration number, faculty, department and level.'); return; }
    setBusy(true);
    try {
      if (wallet) await syncChain(wallet, next.reg);
      const updated = [...profiles.filter(p => p.reg.toUpperCase() !== next.reg), next].sort((a, b) => a.name.localeCompare(b.name));
      const savedList = saveLocal('lionpay-profiles', updated);
      const savedCurrent = saveLocal('unn-profile', next);
      setProfiles(updated); setProfile(next); setDraftProfile(next); setVerified(null); setReceipt(null);
      setToast(savedList && savedCurrent ? `${next.name} saved under ${next.reg} on this device.` : 'Profile updated for this visit. Browser storage is unavailable.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function loadProfile(next: Profile) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (wallet) await syncChain(wallet, next.reg); else setOnChainReceipts([]);
      setProfile(next); setDraftProfile(next); setVerified(null); setReceipt(null); saveLocal('unn-profile', next);
      setToast(next.name ? `Loaded ${next.name}.` : 'Enter and save the new student’s details.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function updateFee(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setAdminNotice('');
    try {
      if (!wallet || !owner) throw new Error('Connect the contract owner wallet to change fees.');
      await assertWallet(wallet);
      if (parseEther(adminAmount) <= 0n) throw new Error('Fee amount must be greater than zero.');
      const tx = await wallet.contract.setFee(id(adminFee), parseEther(adminAmount), adminActive);
      const mined = await tx.wait();
      if (mined.status !== 1) throw new Error('Fee update was not confirmed.');
      await syncChain(wallet); setAdminNotice('Fee schedule updated on Anvil.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function applyRate() {
    if (!wallet || !owner || !rateValid || busy) return;
    setBusy(true); setError(''); setAdminNotice('');
    let updated = 0;
    try {
      for (const fee of fees) {
        await assertWallet(wallet);
        const current = await wallet.contract.fees(id(fee.id));
        const amount = parseEther(nairaToEth(fee.naira, rateNumber));
        if (amount <= 0n) throw new Error('This rate makes a fee smaller than one wei. Use a lower rate.');
        if (current.amountWei === amount) continue;
        setAdminNotice(`Updating ${fee.name}. Approve this transaction in MetaMask.`);
        const tx = await wallet.contract.setFee(id(fee.id), amount, current.active);
        const mined = await tx.wait();
        if (mined.status !== 1) throw new Error('Fee update was not confirmed.');
        updated++;
      }
      saveLocal('lionpay-rate', rateNumber);
      setAdminNotice(`Rate applied: 1 ETH = ${money(rateNumber)}. ${updated} fee amounts updated.`); setRateOpen(false);
    } catch (e) { setError(`${updated} fee updates confirmed. ${errorMessage(e)} Previously confirmed updates remain in effect.`); setRateOpen(false); }
    finally {
      try { await syncChain(wallet); } catch (e) { setError(`Refresh the fee schedule to read current contract state. ${errorMessage(e)}`); }
      setBusy(false);
    }
  }
  async function withdraw() {
    setBusy(true); setError('');
    try {
      if (!wallet || !owner) throw new Error('Connect the contract owner wallet first.');
      await assertWallet(wallet);
      const tx = await wallet.contract.withdraw(); const mined = await tx.wait();
      if (mined.status !== 1) throw new Error('Withdrawal was not confirmed.');
      void refreshContractBalance(wallet);
      setWithdrawOpen(false); setToast('Contract funds transferred to the configured treasury.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function refreshFees() {
    if (!wallet) { setWalletOpen(true); return; }
    setBusy(true); setError('');
    try { await assertWallet(wallet); await syncChain(wallet); void refreshBalance(wallet); setToast('Fees, receipts and wallet balance refreshed from Anvil.'); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  function exportHistory() {
    const rows = activeReceipts.map(r => [r.id, r.studentName || profile.name, r.studentReg || profile.reg, r.feeName, r.eth, r.date, r.payer].map(value => '"' + (/^[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"').join(','));
    downloadFile('lionpay-payment-history.csv', 'Receipt,Student,Registration,Fee,Test ETH,Date,Payer\n' + rows.join('\n'), 'text/csv'); setToast('Payment history exported.');
  }
  const visibleHistory = activeReceipts.filter(r => !search || `${r.feeName} ${r.id} ${r.studentName || ''} ${r.studentReg || ''}`.toLowerCase().includes(search.toLowerCase()));
  function ReceiptTable({ compact = false }: { compact?: boolean }) {
    return visibleHistory.length ? <div className="table-scroll"><table className="history-table"><thead><tr><th>Transaction</th><th>Date</th><th>Amount</th><th>Status</th><th><span className="sr-only">Receipt</span></th></tr></thead><tbody>{visibleHistory.slice(0, compact ? 3 : undefined).map(r => <tr key={r.id}><td><div className="transaction-name"><span className="transaction-icon"><ArrowDownLeft size={17} /></span><div><strong>{r.feeName}</strong><span className="mono">{short(r.id)}</span></div></div></td><td>{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><strong>{money(r.amount)}</strong><span className="cell-note">{r.eth} test ETH</span></td><td><Badge>Confirmed</Badge></td><td><button className="icon-button" title="View receipt" onClick={() => setReceipt(r)}><ArrowDownToLine size={17} /></button></td></tr>)}</tbody></table></div> : <Empty title={wallet ? 'No payments found' : 'Connect your wallet to view payments'} text="Only confirmed blockchain payments appear here." />;
  }
  function FeeTable({ preview = false }: { preview?: boolean }) {
    return schedule.length ? <div className="table-scroll"><table className="fee-table"><thead><tr><th>Fee description</th><th>Amount</th><th>Status</th>{!preview && <th />}</tr></thead><tbody>{schedule.map(f => <tr key={f.id}><td><strong>{f.name}</strong>{!preview && <span className="cell-note">{f.detail}</span>}</td><td><strong>{money(f.naira)}</strong>{!preview && <span className="cell-note">{f.eth} test ETH{!wallet && ' (estimate)'}</span>}</td><td><Badge kind={paidIds.has(f.id) ? 'green' : 'amber'}>{paidIds.has(f.id) ? 'Paid' : !wallet ? 'Not checked' : f.active === false ? 'Inactive' : 'Unpaid'}</Badge></td>{!preview && <td>{paidIds.has(f.id) ? <button className="text-button" onClick={() => setReceipt(activeReceipts.find(r => r.feeId === f.id)!)}>Receipt <ChevronRight size={14} /></button> : <button className="button small-button" disabled={busy || f.active === false} onClick={() => reviewFee(f)}>{wallet ? 'Pay fee' : 'Connect'} <ArrowRight size={14} /></button>}</td>}</tr>)}</tbody></table></div> : <Empty title="No fee schedule for this session" text="Select the 2025 / 2026 session to view your current fees." />;
  }
  const converter = <section className="panel converter-panel"><div className="panel-heading"><div><h2>Naira → ETH converter</h2><p>Enter a reference rate in naira per ETH. This is not a live market feed or a currency exchange.</p></div><ArrowRight size={20} /></div><div className="converter-form"><label>Amount in naira (NGN)<input type="number" min="0" step="1" value={conversionAmount} onChange={e => setConversionAmount(e.target.value)} disabled={busy} /></label><label>NGN per 1 ETH<input type="number" min="1" step="1" value={rate} onChange={e => setRate(e.target.value)} disabled={busy} /></label><div className="conversion-result" aria-live="polite"><span>ETH equivalent</span><strong>{converted === null ? 'Enter valid amounts' : `${converted} ETH`}</strong><small>Local test ETH has no monetary value.</small></div><button className="button secondary-button" disabled={!rateValid || busy} onClick={() => { const saved = saveLocal('lionpay-rate', rateNumber); setToast(saved ? 'Reference rate saved on this device. Contract fees are unchanged.' : 'Rate updated for this visit. Storage is unavailable.'); }}>Save reference rate <Check size={15} /></button>{page === 'Bursary workspace' && <button className="button" disabled={!owner || !rateValid || busy} onClick={() => { setError(''); setRateOpen(true); }}>Apply rate to contract fees <ArrowRight size={15} /></button>}<p className="fine-print">At {rateValid ? money(rateNumber) : 'the entered rate'} per ETH, the tuition estimate is {rateValid ? nairaToEth(80000, rateNumber) : '—'} ETH. Payments always use the exact on-chain fee. Only the bursary owner can change those amounts.</p></div></section>;

  return <div className="app-shell">
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <a className="university-brand" href="#overview" onClick={e => { e.preventDefault(); go('Overview'); }}><Crest /><div><strong>UNIVERSITY<br />OF NIGERIA</strong><span>NSUKKA</span></div></a>
      <div className="portal-brand"><span className="lionpay-mark"><Link2 size={15} /></span><strong>LionPay</strong><span>STUDENT PORTAL</span></div>
      <span className="nav-section-label">WORKSPACE</span>
      <nav aria-label="Main navigation">{navigation.map(({ label, icon: Icon }) => <button key={label} disabled={busy} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => go(label)}><Icon size={19} /><span>{label}</span>{label === 'Pay school fees' && outstanding > 0 && <span className="nav-count">{schedule.length - paidIds.size}</span>}{page === label && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-card"><span className="security-icon"><ShieldCheck size={21} /></span><strong>A smarter way to pay.</strong><p>Transparent payments.<br />Records you can trust.</p><button onClick={() => { setHelpOpen(1); go('Help & support'); }}>Powered by blockchain <ExternalLink size={13} /></button></div><button className={`nav-item ${page === 'Help & support' ? 'active' : ''}`} disabled={busy} onClick={() => go('Help & support')}><CircleHelp size={19} /><span>Help & support</span></button><div className="sidebar-user"><button className="avatar" onClick={() => go('My profile')}>{initials}</button><button className="sidebar-user-name" onClick={() => go('My profile')}><strong>{profile.name || 'Student profile'}</strong><span>{profile.reg || 'Add your details'}</span></button><button className="icon-button" aria-label="Wallet settings" disabled={busy} onClick={() => { setError(''); setWalletOpen(true); }}><MoreHorizontal size={18} /></button></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-toggle" aria-label="Open navigation" aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)}><Menu size={22} /></button><span>Student portal</span><ChevronRight size={14} /><strong>{page}</strong></div><div className="topbar-actions"><span className="network-label"><span className="status-dot" />{wallet ? `Anvil · 31337${balanceEth ? ' · ' + balanceEth + ' ETH' : ''}` : 'Wallet not connected'}</span><button className="icon-button theme-toggle" aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} title={theme === 'light' ? 'Dark mode' : 'Light mode'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button><button className="notification-button icon-button" aria-label="Notifications" onClick={() => { setNotifications(true); setUnread(false); }}><Bell size={19} />{unread && <i />}</button><button className={`button wallet-button ${wallet ? 'connected' : ''}`} disabled={busy} onClick={() => { setError(''); setWalletOpen(true); }}><WalletIcon size={16} />{wallet ? short(wallet.address) : 'Connect wallet'}</button><button className="avatar topbar-avatar" onClick={() => go('My profile')}>{initials}</button></div></header>
      <main><div className="page-heading"><div><div className="eyebrow">YOUR ACADEMIC JOURNEY, SIMPLIFIED</div><h1>{page === 'Overview' ? `Welcome back, ${firstName}` : page}<span className="heading-period">.</span></h1><p>{page === 'Overview' ? 'Here’s a snapshot of your school fees and payment activity.' : page === 'Pay school fees' ? 'Settle your fees with MetaMask and your local Anvil network.' : page === 'Payment history' ? 'Every confirmed payment, in one place.' : page === 'Verify receipt' ? 'Check a receipt against its original blockchain record.' : page === 'My profile' ? 'Your academic identity and saved student profiles.' : page === 'Bursary workspace' ? 'Manage fee schedules, exchange-rate equivalents and the treasury.' : 'Guidance for your wallet and local blockchain.'}</p></div><div className="heading-date"><CalendarDays size={16} />{today}</div></div>
      {page === 'Overview' && <>
        <section className="welcome-banner"><div className="banner-content"><span className="banner-kicker"><span /> {session} ACADEMIC SESSION</span><h2>Focus on your future.<br />We’ll simplify the fees.</h2><p>Secure, seamless school fee payments.<br className="mobile-break" /> Every transaction, accounted for.</p><div className="banner-actions"><button className="button gold-button" onClick={() => go('Pay school fees')}>Pay school fees <ArrowRight size={17} /></button><button className="banner-link" onClick={() => go('Payment history')}>View payment history <ChevronRight size={16} /></button></div></div><div className="banner-graphic" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><div className="graphic-node node-one"><ShieldCheck /></div><div className="graphic-node node-two"><Check /></div><div className="graphic-node node-three"><Link2 /></div><div className="hero-seal"><Crest /><span>KNOWLEDGE · EXCELLENCE</span></div><span className="graphic-star star-one">+</span><span className="graphic-star star-two">+</span></div><div className="banner-footnote"><ShieldCheck size={13} /> Built on trust. Secured by code.</div></section>
        <div className="section-toolbar"><h2>Your fees at a glance</h2><label className="select-control"><CalendarDays size={14} /><select aria-label="Academic session" value={session} disabled={busy} onChange={e => setSession(e.target.value)}><option>2025 / 2026</option><option>2024 / 2025</option></select><ChevronDown size={14} /></label></div>
        <section className="stats-grid"><div className="stat-card"><div className="stat-top"><span>Total school fees</span><span className="stat-icon neutral"><FileText size={19} /></span></div><strong className="stat-value">{money(total)}</strong><div className="stat-bottom"><span>For the {session} session</span><span className="mini-tag">{schedule.length} fee items</span></div></div><div className="stat-card"><div className="stat-top"><span>Total paid</span><span className="stat-icon green"><CheckCheck size={20} /></span></div><strong className="stat-value green-text">{wallet ? money(paid) : '—'}</strong><div className="stat-bottom"><span className="green-text">{wallet ? `${activeReceipts.length} confirmed payments` : 'Connect wallet to check'}</span><span>{wallet && total ? Math.round(paid / total * 100) + '% paid' : ''}</span></div><div className="stat-progress"><span style={{ width: `${wallet && total ? paid / total * 100 : 0}%` }} /></div></div><div className="stat-card outstanding"><div className="stat-top"><span>Outstanding balance</span><span className="stat-icon amber"><WalletIcon size={19} /></span></div><strong className="stat-value">{wallet ? money(outstanding) : '—'}</strong><div className="stat-bottom"><span>{wallet ? completed ? 'All fees paid for this session' : `${currentEth.toFixed(4)} test ETH` : 'Connect to load your balance'}</span><button onClick={() => go('Pay school fees')}>View fees <ArrowRight size={14} /></button></div></div></section>
        <div className="overview-columns"><section className="panel fee-overview"><div className="panel-heading"><div><h2>Fee breakdown</h2><p>A clear picture of what you’re paying for.</p></div><button className="icon-button" aria-label="Open full fee breakdown" onClick={() => go('Pay school fees')}><MoreHorizontal size={20} /></button></div><FeeTable preview /><div className="panel-footer"><span><ShieldCheck size={14} />{wallet ? 'Amounts read from your contract' : 'Connect to check payment status'}</span><button className="text-button" onClick={() => go('Pay school fees')}>View all fees <ArrowRight size={14} /></button></div></section><section className="panel academic-card"><div className="panel-heading"><h2>Academic profile</h2><GraduationCap size={21} /></div><div className="academic-person"><span className="avatar large-avatar">{initials}</span><h3>{profile.name || 'Add your name'}</h3><span>{profile.reg || 'Add your registration number'}</span><Badge>Undergraduate</Badge></div><dl className="academic-details"><div><dt>Faculty</dt><dd>{profile.faculty}</dd></div><div><dt>Department</dt><dd>{profile.department}</dd></div><div><dt>Level</dt><dd>{profile.level ? `${profile.level} Level` : 'Not set'}</dd></div><div><dt>Fee clearance</dt><dd><span className={completed ? 'clearance complete' : 'clearance'}>{!wallet ? 'Not checked' : completed ? 'Completed' : 'In progress'}</span></dd></div></dl><button className="profile-link" onClick={() => go('My profile')}>Edit student profile <ArrowRight size={15} /></button></section></div>
        <section className="panel recent-payments"><div className="panel-heading"><div><h2>Recent payments</h2><p>Your latest confirmed transactions.</p></div><button className="text-button" onClick={() => go('Payment history')}>View all transactions <ArrowRight size={15} /></button></div><ReceiptTable compact /></section>
        <div className="trust-strip"><div><span className="trust-icon"><ShieldCheck size={20} /></span><div><strong>Your payments. Verifiable by design.</strong><p>Receipts come from your Solidity contract on Anvil. Local test ETH has no monetary value.</p></div></div><button className="text-button" onClick={() => go('Verify receipt')}>Verify a receipt <ArrowRight size={16} /></button></div>
      </>}
      {page === 'Pay school fees' && <><div className="mode-notice"><ShieldCheck size={21} /><div><strong>{wallet ? 'Connected to Anvil Local' : 'Connect MetaMask to Anvil'}</strong><p>Payments use local test ETH, not real money. Receipts are issued only after successful blockchain confirmation.</p></div>{!wallet && <button className="text-button" onClick={() => { setError(''); setWalletOpen(true); }}>Set up wallet <ArrowRight size={16} /></button>}</div>{converter}<section className="payment-summary"><div><span>{wallet ? 'OUTSTANDING BALANCE' : 'SESSION FEE TOTAL'}</span><h2>{money(wallet ? outstanding : total)}</h2><p>{currentEth.toFixed(4)} test ETH {wallet ? '· Network gas is additional' : '· Connect to check exact fees and balance'}</p></div><div className="payment-session"><CalendarDays size={21} /><div><strong>{session}</strong><span>Academic session</span></div></div></section><section className="panel"><div className="panel-heading"><div><h2>Your fee schedule</h2><p>Select a fee to review the exact on-chain amount.</p></div><button className="text-button" disabled={busy} onClick={refreshFees}>Refresh <SlidersHorizontal size={15} /></button></div><FeeTable /><div className="fee-total"><span>Total for the session</span><strong>{money(total)}</strong></div></section>{error && <p className="error-message" role="alert">{error}</p>}<p className="fine-print">The converter estimates ETH using your reference rate. It does not convert or transfer naira. Contract fees govern the actual test ETH payment.</p><div className="process-grid">{[{ n: '01', title: 'Choose your fee', text: 'Save your student profile and review the fee.' }, { n: '02', title: 'Approve in MetaMask', text: 'Use funded test ETH on Anvil, chain 31337.' }, { n: '03', title: 'Keep your receipt', text: 'Download the confirmed receipt and verify its ID.' }].map(s => <div key={s.n}><span>{s.n}</span><h3>{s.title}</h3><p>{s.text}</p></div>)}</div></>}
      {page === 'Payment history' && <><section className="panel"><div className="panel-heading"><div><h2>All transactions <span className="count-bubble">{activeReceipts.length}</span></h2><p>{session} · {profile.name || 'Student profile'} · Anvil blockchain records</p></div><button className="button secondary-button" onClick={exportHistory} disabled={!activeReceipts.length}><ArrowDownToLine size={16} />Export CSV</button></div><div className="table-controls"><label className="search-input"><Search size={18} /><input aria-label="Search payments" placeholder="Search payments or receipt IDs…" value={search} onChange={e => setSearch(e.target.value)} /></label><button className="text-button" disabled={busy} onClick={refreshFees}>Refresh <SlidersHorizontal size={15} /></button></div><ReceiptTable /></section><p className="fine-print">Records are loaded from the connected contract for your saved registration number. Changing student profiles never changes existing receipts.</p></>}
      {page === 'Verify receipt' && <div className="centered-page"><section className="panel verification-card"><div className="feature-icon"><ShieldCheck size={30} /></div><h2>A receipt you can check.</h2><p>Paste a receipt ID to read the original payment from Anvil.</p><form onSubmit={verify}><label htmlFor="receipt-id">Receipt ID</label><input id="receipt-id" required value={verifyInput} onChange={e => { setVerifyInput(e.target.value); setVerified(null); setVerifyError(''); }} placeholder="0x followed by 64 hexadecimal characters" /><button className="button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}Verify receipt</button></form>{verifyError && <p className="error-message" role="alert">{verifyError}</p>}{verified && <div className="verification-result"><CheckCheck size={24} /><div><strong>Verified on the connected blockchain</strong><p>{verified.feeName} · {verified.eth} test ETH</p><span>Recorded {new Date(verified.date).toLocaleString()}</span><button className="text-button" onClick={() => setReceipt(verified)}>View full receipt <ArrowRight size={15} /></button></div></div>}<div className="verification-hint"><Link2 size={16} /><span>{wallet ? 'Verifying against ' + short(wallet.contractAddress) : 'Connect your wallet to verify a blockchain receipt.'}</span></div></section><p className="fine-print">Use the same network and contract that processed the payment.</p></div>}
      {page === 'My profile' && <><section className="panel saved-profiles"><div className="panel-heading"><div><h2>Saved students</h2><p>Names are saved with their registration numbers in this browser. They are not shared between devices.</p></div><button className="button secondary-button" disabled={busy} onClick={() => loadProfile({ ...defaultProfile })}>New student <UserRound size={16} /></button></div><label className="dialog-label">Load a saved student<select aria-label="Saved student" value={profiles.some(p => p.reg === profile.reg) ? profile.reg : ''} disabled={busy} onChange={e => { const p = profiles.find(p => p.reg === e.target.value); if (p) void loadProfile(p); }}><option value="">Select a student</option>{profiles.map(p => <option key={p.reg} value={p.reg}>{p.name} — {p.reg}</option>)}</select></label></section><div className="profile-layout"><section className="panel profile-identity"><span className="avatar profile-avatar">{initials}</span><h2>{profile.name || 'Student profile'}</h2><p>{profile.reg || 'Registration number not set'}</p><Badge>{profile.level ? `${profile.level} Level student` : 'Choose your level'}</Badge><div className="profile-divider" /><Crest small /><strong>University of Nigeria, Nsukka</strong><span>Faculty of {profile.faculty}</span><span>Department of {profile.department}</span></section><section className="panel"><div className="panel-heading"><div><h2>Personal information</h2><p>Edit and save your details. No university database is connected.</p></div><UserRound size={20} /></div><form className="profile-form" onSubmit={saveProfile}><label>Full name<input required maxLength={70} placeholder="Enter your full name" value={draftProfile.name} disabled={busy} onChange={e => setDraftProfile({ ...draftProfile, name: e.target.value })} /></label><label>Registration number<input required maxLength={30} pattern="[A-Za-z0-9\/\-]{5,30}" placeholder="e.g. 2021/245678" value={draftProfile.reg} disabled={busy} onChange={e => setDraftProfile({ ...draftProfile, reg: e.target.value })} /><small>Saving a different number selects that student’s payment records. The previous student stays in the saved list.</small></label><div className="profile-fields"><label>Faculty<input required maxLength={80} value={draftProfile.faculty} disabled={busy} onChange={e => setDraftProfile({ ...draftProfile, faculty: e.target.value })} /></label><label>Department<input required maxLength={100} value={draftProfile.department} disabled={busy} onChange={e => setDraftProfile({ ...draftProfile, department: e.target.value })} /></label><label>Level<select required value={draftProfile.level} disabled={busy} onChange={e => setDraftProfile({ ...draftProfile, level: e.target.value })}><option value="">Select your level</option>{['100', '200', '300', '400', '500', '600'].map(level => <option key={level} value={level}>{level} Level</option>)}</select></label></div><label>Email address <span className="optional">(optional)</span><input type="email" maxLength={120} value={draftProfile.email} disabled={busy} onChange={e => setDraftProfile({ ...draftProfile, email: e.target.value })} /></label><label>Phone number <span className="optional">(optional)</span><input type="tel" maxLength={20} placeholder="e.g. +234 801 234 5678" value={draftProfile.phone} disabled={busy} onChange={e => setDraftProfile({ ...draftProfile, phone: e.target.value })} /></label><div className="privacy-note"><Shield size={18} /><p>Your name, level and contact information remain on this device. Only a hashed registration reference is sent on-chain. Saved details are self-entered, not university-verified.</p></div>{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary-button" disabled={busy} onClick={() => setDraftProfile(profile)}>Cancel changes</button><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}<Check size={16} /></button></div></form></section></div></>}
      {page === 'Bursary workspace' && <><div className="mode-notice"><Settings2 size={23} /><div><strong>{owner ? 'Contract owner access confirmed' : wallet ? 'Connected wallet is not the bursary owner' : 'Connect the bursary owner wallet'}</strong><p>{owner ? 'Update the fee schedule and withdraw collected test ETH to the fixed treasury.' : wallet ? `Connected as ${short(wallet.address)}. The contract owner is ${short(wallet.owner)}. In MetaMask, switch to the owner account, then reconnect to unlock fee editing and withdrawals.` : 'Connect the Anvil contract owner account to update fees and withdraw to the fixed treasury. Student wallets cannot perform these actions.'}</p></div><Badge kind={owner ? 'green' : 'amber'}>{owner ? 'Owner' : wallet ? 'Not owner' : 'Read-only'}</Badge>{wallet && !owner && <button className="text-button" onClick={() => { setError(''); setWalletOpen(true); }}>Wallet settings <ArrowRight size={16} /></button>}</div>{converter}<div className="admin-grid"><section className="panel"><div className="panel-heading"><div><h2>Fee schedule management</h2><p>Update the exact test ETH amount for one fee.</p></div></div><form className="profile-form" onSubmit={updateFee}><label>Fee item<select value={adminFee} disabled={busy} onChange={e => { setAdminFee(e.target.value); const f = feeSchedule.find(f => f.id === e.target.value)!; setAdminAmount(f.eth); setAdminActive(f.active !== false); }}>{fees.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>Amount in test ETH<input type="number" step="any" min="0.000000000000000001" required value={adminAmount} disabled={busy} onChange={e => setAdminAmount(e.target.value)} /></label><button type="button" className="text-button" disabled={!rateValid || busy} onClick={() => setAdminAmount(nairaToEth(fees.find(f => f.id === adminFee)!.naira, rateNumber))}>Use converted naira amount <ArrowRight size={14} /></button><label className="checkbox-label"><input type="checkbox" checked={adminActive} disabled={busy} onChange={e => setAdminActive(e.target.checked)} />Accept payments for this fee</label><p className="fine-print">Existing receipts remain unchanged. Fees must be updated by the owner before a new conversion becomes payable.</p>{adminNotice && <p className="success-message" role="status">{adminNotice}</p>}{error && !withdrawOpen && <p className="error-message" role="alert">{error}</p>}<button className="button" disabled={busy || !owner} title={owner ? undefined : 'Connect the contract owner wallet to update fees.'}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Update fee schedule</button></form></section><section className="panel contract-panel"><div className="panel-heading"><h2>Smart contract</h2><Link2 size={20} /></div><div className="contract-content"><span className="field-label">CONTRACT ADDRESS</span><code>{wallet?.contractAddress || deployment?.address || 'Not connected'}</code><span className="field-label">NETWORK</span><strong>Anvil Local · Chain 31337 · Test ETH</strong><span className="field-label">CONTRACT OWNER</span><code>{wallet?.owner || 'Connect a wallet to inspect'}</code><span className="field-label">TREASURY</span><code>{wallet?.treasury || 'Connect a wallet to inspect'}</code><span className="field-label">CONTRACT BALANCE</span><strong>{contractBalance === null ? 'Reading from Anvil…' : `${contractBalanceEth} test ETH`}</strong><div className="privacy-note"><ShieldCheck size={18} /><p>Exact payments, duplicate protection, on-chain receipts and owner-only fee management.</p></div><button className="button secondary-button" disabled={!wallet || !owner || busy} title={owner ? undefined : 'Connect the contract owner wallet to withdraw.'} onClick={() => { setError(''); setWithdrawOpen(true); }}><WalletIcon size={16} />Withdraw to treasury</button><button className="text-button" onClick={() => downloadFile('SchoolFees.abi.json', JSON.stringify(abi, null, 2), 'application/json')}>Download contract ABI <ArrowDownToLine size={15} /></button></div></section></div></>}
      {page === 'Help & support' && <><div className="help-intro"><div className="feature-icon"><CircleHelp size={29} /></div><div><h2>A smooth start to your semester.</h2><p>Everything you need for Anvil, MetaMask and your student profile.</p></div></div><section className="panel faq-list">{[
        ['How do I pay?', 'Save your name, registration number and level in My profile. Start Anvil and deploy the contract on your PC. Connect MetaMask, select an unpaid fee and approve the test ETH transaction. A receipt is issued only after it is mined.'],
        ['How does the naira conversion work?', 'Enter an amount and a manually chosen NGN-per-ETH rate in the converter. ETH = naira ÷ rate, rounded to the nearest wei. This calculator does not exchange currencies or fetch live prices. Saving a rate does not change payable fees; the contract owner can apply it from Bursary workspace.'],
        ['How do I set up Anvil and MetaMask?', 'In the project folder, run npm run chain and leave that terminal open. On first setup (or after deleting .local-chain) also run npm run contract:deploy. Anvil saves the chain, so later sessions only need npm run chain. Run npm run dev for the local portal or use the hosted site, select Connect wallet and Add / switch to Anvil. The network uses http://127.0.0.1:8545, chain ID 31337 and symbol ETH. Approve the request in MetaMask.'],
        ['How do I get test ETH and bursary access?', 'Anvil prints funded development accounts in its terminal. Import account 0 into a separate MetaMask development account for bursary owner access, or account 1 for student payments. These publicly known keys are for local testing ONLY; never use them on public networks or send them real money. Alternatively keep your own MetaMask account for student payments; the portal adds local test ETH automatically when you connect. This does not grant bursary privileges.'],
        ['Will Anvil work on Android or the hosted Netlify site?', 'All pages work on Android. MetaMask mobile injects the wallet only in its own in-app browser. However 127.0.0.1 on a phone is the phone itself, not your PC. Anvil is deliberately bound to PC loopback and is not exposed to the internet or Wi-Fi. Use the PC’s local portal for the supervised blockchain presentation. The hosted portal cannot start Anvil or create a public blockchain.'],
        ['Where are my student details saved?', 'Names, registration numbers, faculty, department and level are saved in this browser. Use Saved students to switch identities; each registration number loads its own on-chain receipts. Clearing browser storage removes the local profiles, but confirmed blockchain receipts remain while the same Anvil state and contract are retained. Names are not added to the blockchain.'],
        ['Are these official University of Nigeria fees?', 'No. LionPay is an independent academic project inspired by the UNN portal, not an official university service. Receipts use local test ETH and cannot be used for university clearance. Production use would need verified enrollment, financial policies, privacy controls and a professional security review.'],
        ['What happens if a transaction fails or my wallet changes?', 'Cancelled or reverted payments do not create receipts. Check pending wallet transactions before retrying. Changing network or account disconnects the portal to prevent mixing records. Reconnect and refresh to recover confirmed payments. Keep Anvil’s persistent state to retain your local blockchain between sessions.'],
      ].map(([q, a], i) => <div className={`faq-item ${helpOpen === i ? 'expanded' : ''}`} key={q}><button aria-expanded={helpOpen === i} onClick={() => setHelpOpen(helpOpen === i ? null : i)}><span>{q}</span>{helpOpen === i ? <X size={16} /> : <ChevronDown size={17} />}</button>{helpOpen === i && <p>{a}</p>}</div>)}</section><div className="help-bottom"><GraduationCap size={28} /><div><h3>Built for learning. Designed for trust.</h3><p>Transparent fee collection with Solidity and actual local-chain transactions.</p></div><button className="button secondary-button" onClick={() => { setError(''); setWalletOpen(true); }}>Set up MetaMask <ArrowRight size={16} /></button></div></>}
      <footer><span>© {new Date().getFullYear()} LionPay <span className="footer-dot">·</span> A University of Nigeria–inspired project</span><span><ShieldCheck size={13} /> Anvil local network · Test ETH · Independent academic project</span></footer>
      </main>
    </div>
    <Dialog open={walletOpen} onOpenChange={open => { if (!busy) { setWalletOpen(open); setError(''); if (open && wallet) void refreshBalance(wallet); } }}><DialogContent className="portal-dialog"><DialogHeader><div className="feature-icon"><WalletIcon size={26} /></div><DialogTitle>{wallet ? 'Your connected wallet' : 'Connect MetaMask to Anvil'}</DialogTitle><DialogDescription>Anvil Local, chain 31337. Test ETH has no monetary value. Public networks are disabled.</DialogDescription></DialogHeader>{wallet ? <><div className="wallet-info"><Badge>Connected</Badge><code>{wallet.address}</code><span>Chain {wallet.chainId} · {short(wallet.contractAddress)}</span></div><div className="wallet-balance"><div><span>Wallet balance</span><strong>{walletBalance === null ? 'Reading from Anvil…' : `${balanceEth} test ETH`}</strong></div><button className="icon-button" title="Refresh balance" aria-label="Refresh wallet balance" disabled={busy} onClick={() => void refreshBalance(wallet)}><RefreshCw size={16} /></button></div><button className="button secondary-button" disabled={busy} onClick={disconnect}><LogOut size={17} />Disconnect wallet</button>{error && <p className="error-message" role="alert">{error}</p>}<p className="fine-print">MetaMask sometimes shows an outdated 0 ETH for local networks. The balance above is read directly from Anvil. If this wallet has less than 1 test ETH when it connects, the portal adds 10 local test ETH from a dedicated Anvil test account automatically. Test ETH has no monetary value.</p></> : <><div className="network-setup"><ol><li>On your PC: run <code>npm run chain</code> and leave it open.</li><li>First time only (or after a chain reset): run <code>npm run contract:deploy</code> in another terminal. Anvil saves the deployment, so later sessions only need <code>npm run chain</code>.</li><li>In MetaMask, import an Anvil development account, or keep your own local account. The portal adds 10 test ETH automatically if the connected wallet needs it.</li><li>Return to this portal and select Connect wallet below.</li></ol><p className="fine-print">Account 0 is the bursary owner. Account 1 can pay as a student. Import Anvil’s public development keys into separate local-only accounts; never use them with real funds. We never request your private key in this portal.</p></div><button className="button secondary-button" disabled={busy} onClick={networkSetup}>Add / switch to Anvil <Link2 size={16} /></button><label className="dialog-label">Deployed SchoolFees contract address<input value={contractAddress} disabled={busy} onChange={e => setContractAddress(e.target.value)} placeholder="0x… printed by contract:deploy" spellCheck={false} /></label>{deployment && <p className="fine-print">Anvil deployment detected (chain {deployment.chainId}). Use this only if it matches your running Anvil instance.</p>}{error && <p className="error-message" role="alert">{error}</p>}<button className="button" disabled={busy} onClick={connect}>{busy ? <LoaderCircle className="spin" size={17} /> : <WalletIcon size={17} />}{busy ? 'Connecting…' : 'Connect wallet'}</button><p className="fine-print">For reliable local payments, use the PC’s local portal. On Android, open the portal in MetaMask’s browser; the PC loopback RPC cannot be reached from your phone.</p></>}</DialogContent></Dialog>
    <Dialog open={!!selectedFee} onOpenChange={open => { if (!open && !busy) { setSelectedFee(null); setError(''); } }}><DialogContent className="portal-dialog" showCloseButton={!busy}><DialogHeader><div className="feature-icon"><CreditCard size={26} /></div><DialogTitle>Review your payment</DialogTitle><DialogDescription>Approve the exact Anvil test ETH amount in MetaMask.</DialogDescription></DialogHeader>{selectedFee && <><div className="payment-review"><span>{selectedFee.name}</span><strong>{money(selectedFee.naira)}</strong><span>{selectedFee.eth} test ETH + network gas</span></div><dl className="review-details"><div><dt>Student</dt><dd>{profile.name}</dd></div><div><dt>Registration number</dt><dd>{profile.reg}</dd></div><div><dt>Level</dt><dd>{profile.level} Level</dd></div><div><dt>Session</dt><dd>2025 / 2026</dd></div><div><dt>Payment method</dt><dd>MetaMask · {wallet ? short(wallet.address) : 'Disconnected'}</dd></div><div><dt>Wallet balance</dt><dd>{wallet ? (walletBalance === null ? 'Reading…' : `${balanceEth} test ETH`) : 'Disconnected'}</dd></div></dl><div className="privacy-note"><ShieldCheck size={17} /><p>Review the student reference and amount. The converter is an estimate; this amount comes from the contract. Receipts appear only after blockchain confirmation.</p></div>{error && <p className="error-message" role="alert">{error}</p>}<button className="button" disabled={busy || !wallet} onClick={pay}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{busy ? 'Waiting for confirmation…' : `Pay ${selectedFee.eth} test ETH`}</button><button className="text-button centered-button" disabled={busy} onClick={() => { setSelectedFee(null); setError(''); }}><ArrowLeft size={14} />Back to fees</button></>}</DialogContent></Dialog>
    <Dialog open={!!receipt} onOpenChange={open => !open && setReceipt(null)}><DialogContent className="portal-dialog receipt-dialog"><DialogHeader><div className="receipt-success"><Check size={29} /></div><DialogTitle>Payment confirmed</DialogTitle><DialogDescription>Recorded on the Anvil local blockchain.</DialogDescription></DialogHeader>{receipt && <><div className="receipt-paper"><div className="receipt-brand"><Crest small /><strong>LionPay<span>STUDENT FEE RECEIPT</span></strong><Badge>Confirmed</Badge></div><h2>{money(receipt.amount)}</h2><p>{receipt.eth} test ETH · {receipt.feeName}</p><dl className="review-details"><div><dt>Name</dt><dd>{receipt.studentName || 'Not stored on this device'}</dd></div><div><dt>Registration number</dt><dd>{receipt.studentReg || 'Not stored on this device'}</dd></div><div><dt>Receipt ID</dt><dd className="receipt-id">{receipt.id}</dd></div><div><dt>Date</dt><dd>{new Date(receipt.date).toLocaleString()}</dd></div><div><dt>Session</dt><dd>2025 / 2026</dd></div><div><dt>Student reference</dt><dd className="receipt-id">{receipt.studentRef}</dd></div><div><dt>Payer</dt><dd className="receipt-id">{receipt.payer}</dd></div><div><dt>Contract</dt><dd className="receipt-id">{receipt.contractAddress}</dd></div>{receipt.txHash && <div><dt>Transaction</dt><dd className="receipt-id">{receipt.txHash}</dd></div>}</dl><span className="receipt-watermark">ANVIL LOCAL · TEST ETH · NOT VALID FOR UNIVERSITY CLEARANCE</span></div><div className="receipt-actions"><button className="button secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(receipt.id); setToast('Receipt ID copied.'); } catch { setToast('Select the receipt ID to copy it manually.'); } }}><Copy size={15} />Copy ID</button><button className="button" onClick={() => downloadReceipt(receipt)}><ArrowDownToLine size={16} />Download receipt</button></div><button className="text-button centered-button" onClick={() => window.print()}>Print receipt <ExternalLink size={14} /></button></>}</DialogContent></Dialog>
    <Dialog open={notifications} onOpenChange={setNotifications}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>Notifications</DialogTitle><DialogDescription>Your portal updates and reminders.</DialogDescription></DialogHeader><div className="notice-item"><span className="stat-icon amber"><CalendarDays size={20} /></span><div><strong>Your session fee schedule is ready</strong><p>Review the five fee items for the 2025 / 2026 session.</p><button className="text-button" onClick={() => { setNotifications(false); go('Pay school fees'); }}>View fees <ArrowRight size={14} /></button></div></div><div className="notice-item"><span className="stat-icon green"><Sparkles size={20} /></span><div><strong>Complete your profile</strong><p>Save your name, registration number, faculty, department and level before your first payment.</p></div></div></DialogContent></Dialog>
    <Dialog open={withdrawOpen} onOpenChange={open => !busy && setWithdrawOpen(open)}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>Withdraw to the treasury?</DialogTitle><DialogDescription>Transfer the contract’s entire local test ETH balance to its fixed treasury. Approve the transaction in MetaMask.</DialogDescription></DialogHeader>{wallet && <p className="fine-print">Available: {contractBalance === null ? 'Reading…' : `${contractBalanceEth} test ETH`} · Treasury: {short(wallet.treasury)}</p>}{error && <p className="error-message" role="alert">{error}</p>}<button className="button" disabled={busy} onClick={withdraw}>{busy ? 'Waiting for confirmation…' : 'Confirm treasury withdrawal'}</button><button className="button secondary-button" disabled={busy} onClick={() => setWithdrawOpen(false)}>Cancel</button></DialogContent></Dialog>
    <Dialog open={rateOpen} onOpenChange={open => !busy && setRateOpen(open)}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>Apply this rate to contract fees?</DialogTitle><DialogDescription>1 ETH = {rateValid ? money(rateNumber) : '—'}. You may need to approve up to five MetaMask transactions, one per changed fee. Confirmed updates remain if a later request is cancelled. Existing receipts and fee activation flags are unchanged.</DialogDescription></DialogHeader><ul>{fees.map(f => <li key={f.id}>{f.name}: {rateValid ? nairaToEth(f.naira, rateNumber) : '—'} test ETH</li>)}</ul>{adminNotice && <p className="success-message" role="status">{adminNotice}</p>}<button className="button" disabled={busy || !owner || !rateValid} onClick={applyRate}>{busy ? 'Waiting for approvals…' : 'Confirm rate application'}</button><button className="button secondary-button" disabled={busy} onClick={() => setRateOpen(false)}>Cancel</button></DialogContent></Dialog>
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button aria-label="Dismiss message" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}
