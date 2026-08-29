import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Loader2, Search, Layers, Eye, Send, CheckCircle2, XCircle,
  Wallet, FileDown, KeyRound, Radio, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { api as supabase, getDomainKey } from '@/integrations/api/client';
import { AdminMenu } from '@/components/AdminMenu';
import { useNostrLanaParams } from '@/hooks/useNostrLanaParams';
import { generate8Wallets, type GeneratedWallet } from '@/lib/walletGenerator';
import { generateWalletsPDF } from '@/lib/pdfGenerator';
import { validateWifAndGetAddress } from '@/lib/wifValidation';
import {
  generateFullPlan,
  computeFundingWithElapsed,
  type PlanAccount,
  type AccountFunding
} from '@/lib/planGeneration';

type Step = 'input' | 'split' | 'wallets' | 'fund' | 'publish' | 'done';

// Wizard checkpoint persisted to localStorage so a crash/reload between
// FUNDING and PUBLISH does not strand the money without a plan.
// NOTE: private keys are NEVER stored — only addresses (keys live in the PDF).
interface SavedEnrollState {
  hexId: string;
  targetSplit: string;
  customRate: string;
  currency: string;
  walletAddresses: string[];
  txHash: string;
  step: Step;
}

const ENROLL_STORAGE_KEY = 'admin_split_enroll_state';

const AdminSplitEnroll = () => {
  const navigate = useNavigate();
  const { params } = useNostrLanaParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('input');

  // Step 1: user identification
  const [hexId, setHexId] = useState('');
  const [checking, setChecking] = useState(false);
  const [userRegistrarStatus, setUserRegistrarStatus] = useState<string>('');

  // Step 2: split selection
  const [currency, setCurrency] = useState('EUR');
  const [targetSplit, setTargetSplit] = useState<string>('');
  const [customRate, setCustomRate] = useState<string>('');

  // Step 3: wallets
  const [generatedWallets, setGeneratedWallets] = useState<GeneratedWallet[]>([]);
  const [generating, setGenerating] = useState(false);
  const [walletsRegistered, setWalletsRegistered] = useState(false);
  const [relayVerified, setRelayVerified] = useState<'idle' | 'verifying' | 'verified' | 'failed'>('idle');

  // Step 4: funding
  const [adminWif, setAdminWif] = useState('');
  const [adminWallet, setAdminWallet] = useState<string>('');
  const [adminBalance, setAdminBalance] = useState<number | null>(null);
  const [wifValidating, setWifValidating] = useState(false);
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState<string>('');

  // Step 5: publish
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ event_id?: string; publish_results?: Array<{ success: boolean }> } | null>(null);

  // Recovery / safety
  const [resumeAvailable, setResumeAvailable] = useState<SavedEnrollState | null>(null);
  const [forceResend, setForceResend] = useState(false);
  const [recipientsAlreadyFunded, setRecipientsAlreadyFunded] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);

  const saveCheckpoint = (partial: Partial<SavedEnrollState>) => {
    try {
      const next: SavedEnrollState = {
        hexId: hexId.trim(),
        targetSplit,
        customRate,
        currency,
        walletAddresses: generatedWallets.map(w => w.address),
        txHash,
        step,
        ...partial
      };
      localStorage.setItem(ENROLL_STORAGE_KEY, JSON.stringify(next));
    } catch (e) { console.error('Checkpoint save failed:', e); }
  };

  const clearCheckpoint = () => {
    try { localStorage.removeItem(ENROLL_STORAGE_KEY); } catch { /* ignore */ }
  };

  // Detect an interrupted enrollment on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ENROLL_STORAGE_KEY);
      if (!raw) return;
      const saved: SavedEnrollState = JSON.parse(raw);
      if (saved.hexId && saved.walletAddresses?.length === 8) {
        setResumeAvailable(saved);
      }
    } catch { /* ignore corrupt state */ }
  }, []);

  const handleResume = () => {
    if (!resumeAvailable) return;
    const s = resumeAvailable;
    setHexId(s.hexId);
    setCurrency(s.currency);
    setTargetSplit(s.targetSplit);
    setCustomRate(s.customRate);
    setGeneratedWallets(s.walletAddresses.map(a => ({ address: a, privateKey: '' })));
    setWalletsRegistered(true);
    setRelayVerified('verified');
    setPdfDownloaded(true);
    setTxHash(s.txHash);
    setUserRegistrarStatus('resumed');
    setStep(s.txHash ? 'publish' : s.step === 'input' || s.step === 'split' ? 'wallets' : s.step);
    setResumeAvailable(null);
    toast.info('Resumed interrupted enrollment from saved checkpoint.');
  };

  const handleDiscardResume = () => {
    if (!window.confirm('Discard the saved enrollment state? If funding was already sent, you will lose the recorded tx/wallet list (the PDF still holds the keys).')) return;
    clearCheckpoint();
    setResumeAvailable(null);
  };

  const currentSplit = params?.split ? parseInt(params.split) : 0;
  const currentRate = params?.exchangeRates?.[currency as keyof typeof params.exchangeRates] || 0;

  // Derived plan values
  const splitNum = parseInt(targetSplit) || 0;
  const rate = parseFloat(customRate) || 0;
  const adjustedStartPrice = rate * 1.08;
  const amountPerWallet = rate > 0 ? 11 / rate : 0;

  const plan: PlanAccount[] = useMemo(() => {
    if (rate <= 0 || amountPerWallet <= 0) return [];
    return generateFullPlan(amountPerWallet, adjustedStartPrice);
  }, [rate, amountPerWallet, adjustedStartPrice]);

  const funding: AccountFunding[] = useMemo(() => {
    if (plan.length === 0 || currentRate <= 0) return [];
    return computeFundingWithElapsed(plan, amountPerWallet, currentRate);
  }, [plan, amountPerWallet, currentRate]);

  const totalFunding = funding.reduce((s, f) => s + f.fundingAmount, 0);
  const totalFull = amountPerWallet * 8;
  const totalElapsedLevels = funding.reduce((s, f) => s + f.elapsedLevels, 0);
  // Fee buffer for the multi-output transaction (paid on top by admin's wallet)
  const FEE_BUFFER = 0.6;

  // Admin check (global admin only)
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const sessionData = sessionStorage.getItem('lana_session');
        if (!sessionData) { navigate('/login'); return; }
        const session = JSON.parse(sessionData);
        const userHexId = session.nostrHexId;
        if (!userHexId) { navigate('/login'); return; }

        const res = await fetch('/api/check-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          },
          body: JSON.stringify({ nostr_hex_id: userHexId })
        });
        const json = await res.json();
        if (!json.data?.isGlobalAdmin) { navigate('/dashboard'); return; }
        setIsAdmin(true);
      } catch { navigate('/dashboard'); }
    };
    checkAdmin();
  }, [navigate]);

  // Load domain currency
  useEffect(() => {
    const loadCurrency = async () => {
      const domainKey = getDomainKey();
      if (!domainKey) return;
      try {
        const res = await fetch('/api/domain-config', { headers: { 'X-Domain-Key': domainKey } });
        const json = await res.json();
        if (json.data?.currency_default) setCurrency(json.data.currency_default);
      } catch { /* keep EUR */ }
    };
    loadCurrency();
  }, []);

  // Prefill rate from split-price formula when split changes.
  // Only while actively choosing the split — never during a resume restore.
  useEffect(() => {
    if (step !== 'split') return;
    const n = parseInt(targetSplit);
    if (n >= 1 && n <= 37) {
      const splitRate = 0.001 * Math.pow(2, n - 1);
      setCustomRate(String(splitRate));
    }
  }, [targetSplit, step]);

  // Step 1: check user — must be registered, must NOT have a plan
  const handleCheckUser = async () => {
    const hex = hexId.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
      toast.error('Please enter a valid 64-character hex ID');
      return;
    }
    setChecking(true);
    try {
      // 1. Must NOT already have a KIND 88888 plan.
      // FAIL CLOSED: only an explicit, successful has_plan === false may pass —
      // a timeout/error here must never authorize enrollment (publishing would
      // REPLACE an existing plan and orphan the user's funded wallets).
      const l8wRes = await fetch('/api/check-lana8wonder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nostr_hex_id: hex })
      });
      const l8wJson = await l8wRes.json();
      if (l8wJson.has_plan === true) {
        toast.error('This user already has a Lana8Wonder plan (KIND 88888). Cannot enroll again.');
        return;
      }
      if (!l8wRes.ok || l8wJson.error || l8wJson.has_plan !== false) {
        toast.error(`Cannot verify plan status (${l8wJson.error?.message || 'relay check failed'}). Aborting — try again when relays respond.`);
        return;
      }

      // 2. Must be registered with the Registrar (KIND 30889)
      const regRes = await fetch('/api/admin/fetch-kind30889', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nostr_hex_id: hex })
      });
      const regJson = await regRes.json();
      if (!regJson.found) {
        toast.error('User is not registered with the Registrar (no KIND 30889). Register the user first.');
        return;
      }

      setUserRegistrarStatus(regJson.status || 'registered');
      setStep('split');
      toast.success('User verified: registered, no existing plan.');
    } catch (err) {
      console.error('User check failed:', err);
      toast.error('Failed to verify user');
    } finally {
      setChecking(false);
    }
  };

  // Step 2 → 3
  const handleConfirmSplit = () => {
    if (splitNum < 1 || splitNum > 37) { toast.error('Enter a valid split number (1–37)'); return; }
    if (currentSplit > 0 && splitNum > currentSplit) {
      toast.error(`Target split cannot be above the current split (${currentSplit})`);
      return;
    }
    if (rate <= 0) { toast.error('Invalid exchange rate'); return; }
    if (currentRate <= 0) { toast.error('Current exchange rate not loaded yet (KIND 38888)'); return; }
    setStep('wallets');
  };

  // Verify-only: check KIND 30889 on relays contains all 8 wallet addresses.
  // Returns true when all found; updates relayVerified state.
  const verifyOnRelays = async (wallets: GeneratedWallet[], waitMs = 0): Promise<boolean> => {
    setRelayVerified('verifying');
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    try {
      const vRes = await fetch('/api/admin/fetch-kind30889', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nostr_hex_id: hexId.trim() })
      });
      const vJson = await vRes.json();
      const registered: string[] = (vJson.l8w_wallets || []).map((w: { wallet_address: string }) => w.wallet_address);
      const allFound = wallets.length === 8 && wallets.every(w => registered.includes(w.address));
      setRelayVerified(allFound ? 'verified' : 'failed');
      if (allFound) {
        toast.success('All 8 wallets verified on relays (KIND 30889).');
        saveCheckpoint({
          walletAddresses: wallets.map(w => w.address),
          step: 'wallets'
        });
      } else {
        toast.warning('Wallets not yet visible on relays — retry verification in a moment.');
      }
      return allFound;
    } catch {
      setRelayVerified('failed');
      return false;
    }
  };

  // Step 3: generate + PDF + register
  const handleGenerateAndRegister = async () => {
    setGenerating(true);
    try {
      // 1. Generate 8 wallets (reuse existing set on retry — never regenerate
      //    once a set exists, or the PDF/registration would go out of sync)
      const wallets = generatedWallets.length === 8 ? generatedWallets : await generate8Wallets();
      setGeneratedWallets(wallets);

      // 2. PDF for the ADMIN — exactly once per wallet set
      if (!pdfDownloaded && wallets.every(w => w.privateKey)) {
        await generateWalletsPDF({
          wallets,
          userName: `Split ${splitNum} enrollment for ${hexId.slice(0, 12)}...`
        });
        setPdfDownloaded(true);
        toast.success('PDF downloaded — store it safely and hand it to the user.');
      }

      // 3. Register under the USER's hex ID
      const res = await fetch('/api/register-virgin-wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nostr_id_hex: hexId.trim(),
          wallets: wallets.map((w, i) => ({
            wallet_id: w.address,
            wallet_type: 'Lana8Wonder',
            notes: `Lana 8 Wonder Account ${i + 1}`
          }))
        })
      });
      const result = await res.json();
      const broadcastsOk = (result.data?.nostr_broadcasts?.successful || 0) >= 8
        && (result.data?.nostr_broadcasts?.failed || 0) === 0;
      const alreadyRegistered = !result.success
        && String(result.message || '').toLowerCase().includes('already');
      const registrationOk = (res.ok && result.success && broadcastsOk) || alreadyRegistered;

      if (!registrationOk) {
        console.error('Registration response not clean:', result);
        // Fallback: the registrar may reject a duplicate with a message we
        // don't recognize — if the relays already hold all 8 wallets, the
        // registration is de-facto complete. Never dead-end on wording.
        const onRelays = await verifyOnRelays(wallets, 2000);
        if (!onRelays) {
          toast.error(`Registration incomplete (${result.data?.nostr_broadcasts?.successful || 0}/8 broadcasts). Retry.`);
          return;
        }
        setWalletsRegistered(true);
        return;
      }

      setWalletsRegistered(true);
      toast.success('8 wallets registered under the user\'s hex ID.');

      // 4. Verify on relays (allow propagation time)
      await verifyOnRelays(wallets, 8000);
    } catch (err) {
      console.error('Generate/register failed:', err);
      toast.error('Failed to generate or register wallets');
    } finally {
      setGenerating(false);
    }
  };

  // Step 4: WIF validation + balance
  useEffect(() => {
    if (!adminWif.trim()) { setAdminWallet(''); setAdminBalance(null); return; }
    const timer = setTimeout(async () => {
      setWifValidating(true);
      try {
        const result = await validateWifAndGetAddress(adminWif.trim());
        if (result.valid && result.walletId) {
          setAdminWallet(result.walletId);
          // Fetch balance
          const electrumServers = (params?.electrum || []).map(e => ({ host: e.host, port: parseInt(String(e.port)) }));
          const balRes = await fetch('/api/check-wallet-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_addresses: [result.walletId],
              electrum_servers: electrumServers.length > 0 ? electrumServers : [
                { host: 'electrum1.lanacoin.com', port: 5097 },
                { host: 'electrum2.lanacoin.com', port: 5097 }
              ]
            })
          });
          const balJson = await balRes.json();
          if (balJson.success && balJson.wallets?.length > 0) {
            setAdminBalance(balJson.wallets[0].balance || 0);
          }
        } else {
          setAdminWallet('');
          setAdminBalance(null);
        }
      } catch {
        setAdminWallet('');
        setAdminBalance(null);
      } finally {
        setWifValidating(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [adminWif, params?.electrum]);

  // Step 4: execute funding transaction from admin's wallet
  const handleFund = async () => {
    if (!adminWallet || !adminWif.trim()) { toast.error('Enter a valid admin WIF key'); return; }
    const recipients = funding
      .map((f, i) => ({ address: generatedWallets[i]?.address, amount: Math.round(f.fundingAmount * 10000) / 10000 }))
      .filter(r => r.address && r.amount > 0.01);
    if (recipients.length === 0) { toast.error('Nothing to fund — all levels elapsed?'); return; }
    if (adminBalance !== null && adminBalance < totalFunding + FEE_BUFFER) {
      toast.error(`Insufficient admin balance: need ~${(totalFunding + FEE_BUFFER).toFixed(2)} LANA, have ${adminBalance.toFixed(2)}`);
      return;
    }

    setSending(true);
    try {
      // IDEMPOTENCY GUARD: a previous send may have landed even though the
      // HTTP response was lost. Never re-broadcast onto funded wallets
      // without an explicit override.
      if (!forceResend) {
        try {
          const electrumServers = (params?.electrum || []).map(e => ({ host: e.host, port: parseInt(String(e.port)) }));
          const preRes = await fetch('/api/check-wallet-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_addresses: recipients.map(r => r.address),
              electrum_servers: electrumServers.length > 0 ? electrumServers : [
                { host: 'electrum1.lanacoin.com', port: 5097 },
                { host: 'electrum2.lanacoin.com', port: 5097 }
              ]
            })
          });
          const preJson = await preRes.json();
          const existing = (preJson.wallets || []).reduce((s: number, w: { balance?: number }) => s + (w.balance || 0), 0);
          if (existing > 0.1) {
            setRecipientsAlreadyFunded(true);
            toast.error(
              `Recipient wallets already hold ${existing.toFixed(2)} LANA — a previous send may have landed. ` +
              `Check the explorer before retrying; tick the override only if you are sure.`
            );
            return;
          }
        } catch (preErr) {
          console.error('Pre-send balance check failed:', preErr);
          toast.error('Could not verify recipient balances — refusing to send. Try again.');
          return;
        }
      }
      const { data, error } = await supabase.functions.invoke('send-lana-multi-output', {
        body: {
          sender_address: adminWallet,
          recipients,
          private_key: adminWif.trim(),
          electrum_servers: [
            { host: 'electrum1.lanacoin.com', port: 5097 },
            { host: 'electrum2.lanacoin.com', port: 5097 }
          ]
        }
      });
      if (error) throw new Error(error.message || 'Transaction failed');
      const txData = data as { success?: boolean; txid?: string; error?: string };
      if (!txData?.success || !txData?.txid) throw new Error(txData?.error || 'Transaction failed');

      setTxHash(txData.txid);
      // Persist IMMEDIATELY — if the tab dies before publish, the checkpoint
      // still holds everything needed to finish (addresses, rate, split, tx).
      saveCheckpoint({ txHash: txData.txid, step: 'publish' });
      setStep('publish');
      toast.success(`Funded ${recipients.length} wallets — tx ${txData.txid.slice(0, 12)}...`);
    } catch (err) {
      console.error('Funding failed:', err);
      toast.error(err instanceof Error ? err.message : 'Funding transaction failed');
    } finally {
      setSending(false);
    }
  };

  // Step 5: save to local DB + publish KIND 88888
  const handlePublish = async () => {
    setPublishing(true);
    try {
      const hex = hexId.trim();

      // 1. Upsert profile + wallets in local DB (best effort, non-fatal)
      try {
        let profileId: string | null = null;
        const { data: existingProfile } = await supabase
          .from('profiles').select('id').eq('nostr_hex_id', hex).maybeSingle();
        if (existingProfile) {
          profileId = (existingProfile as { id: string }).id;
        } else {
          const { data: newProfile } = await supabase
            .from('profiles').insert({ nostr_hex_id: hex }).select('id').single();
          profileId = (newProfile as { id: string } | null)?.id || null;
        }
        if (profileId) {
          await supabase.from('profiles').update({
            wallet_registered: 1,
            tx: txHash,
            enrollment_exchange_rate: rate,
            enrollment_currency: currency,
            enrollment_split: splitNum,
            is_previous_split_upgrade: 0
          }).eq('id', profileId);

          await supabase.from('wallets').upsert(
            generatedWallets.map((w, i) => ({
              profile_id: profileId,
              wallet_address: w.address,
              wallet_type: 'annuity',
              position: i + 1
            })),
            { onConflict: 'profile_id,wallet_address' }
          );
        }
      } catch (dbErr) {
        console.error('Local DB save failed (non-fatal):', dbErr);
      }

      // 2. Publish KIND 88888 — full plan, identical to regular enrollments at that split
      const res = await fetch('/api/publish-lana8wonder-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
        },
        body: JSON.stringify({
          subject_hex: hex,
          wallets: generatedWallets.map(w => w.address),
          amount_per_wallet: amountPerWallet,
          currency,
          exchange_rate: rate,
          start_price: adjustedStartPrice
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || json.error || 'Publish failed');

      setPublishResult(json);
      clearCheckpoint();
      setStep('done');
      toast.success('Annuity plan published to Nostr!');
    } catch (err) {
      console.error('Publish failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to publish plan');
    } finally {
      setPublishing(false);
    }
  };

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const stepReached = (s: Step) => {
    const order: Step[] = ['input', 'split', 'wallets', 'fund', 'publish', 'done'];
    return order.indexOf(step) >= order.indexOf(s);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold">Split Enrollment</h1>
            </div>
          </div>
          <AdminMenu />
        </div>

        <p className="text-sm text-muted-foreground">
          Enroll a user into a past split on their behalf. You pay the funding from your own wallet;
          levels already elapsed at the current rate are <strong>not</strong> funded.
        </p>

        {/* Interrupted-enrollment recovery banner */}
        {resumeAvailable && (
          <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4" />
                Interrupted enrollment found
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                User {resumeAvailable.hexId.slice(0, 16)}... · Split {resumeAvailable.targetSplit} ·
                {resumeAvailable.txHash
                  ? ` FUNDED (tx ${resumeAvailable.txHash.slice(0, 12)}...) but plan NOT published — resume to publish!`
                  : ' wallets registered, not yet funded.'}
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleResume}>Resume</Button>
                <Button size="sm" variant="outline" onClick={handleDiscardResume}>Discard</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 1: User */}
        <Card>
          <CardHeader>
            <CardTitle>1. User (Nostr Hex ID)</CardTitle>
            <CardDescription>User must be registered (KIND 30889) and must NOT have an existing plan (KIND 88888)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={hexId}
                onChange={(e) => setHexId(e.target.value.trim())}
                placeholder="64-character hex public key..."
                className="font-mono text-sm"
                disabled={step !== 'input'}
              />
              <Button onClick={handleCheckUser} disabled={checking || hexId.trim().length !== 64 || step !== 'input'}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">{checking ? 'Checking...' : 'Verify User'}</span>
              </Button>
            </div>
            {stepReached('split') && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Registered ({userRegistrarStatus}) · no existing Lana8Wonder plan
              </div>
            )}
            {/* Start Over only before anything irreversible happened —
                once wallets are registered (and especially once money moved)
                the only safe exits are finishing or the resume flow. */}
            {step !== 'input' && step !== 'done' && !walletsRegistered && (
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Start Over
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Split + funding preview */}
        {stepReached('split') && (
          <Card>
            <CardHeader>
              <CardTitle>2. Target Split &amp; Funding ({currency})</CardTitle>
              <CardDescription>
                Current split: {currentSplit} · current rate: {currentRate} {currency}/LANA.
                Elapsed levels (trigger ≤ current rate) are not funded.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label htmlFor="split">Split #</Label>
                  <Input
                    id="split" type="number" min={1} max={currentSplit || 37}
                    value={targetSplit}
                    onChange={(e) => setTargetSplit(e.target.value)}
                    className="w-24 font-mono"
                    disabled={step !== 'split'}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rate">Rate ({currency}/LANA)</Label>
                  <Input
                    id="rate" type="number" step="0.0001"
                    value={customRate}
                    onChange={(e) => setCustomRate(e.target.value)}
                    className="w-40 font-mono"
                    disabled={step !== 'split'}
                  />
                </div>
                {step === 'split' && (
                  <Button onClick={handleConfirmSplit} disabled={splitNum < 1 || rate <= 0}>
                    <Eye className="h-4 w-4 mr-2" /> Confirm Split
                  </Button>
                )}
              </div>

              {funding.length === 8 && (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left py-1 pr-2">Acct</th>
                          <th className="text-left py-1 pr-2">Type</th>
                          <th className="text-right py-1 pr-2">Full (LANA)</th>
                          <th className="text-right py-1 pr-2">Elapsed lvls</th>
                          <th className="text-right py-1">Funding (LANA)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funding.map((f) => (
                          <tr key={f.account_id} className="border-b border-border/30">
                            <td className="py-1 pr-2">{f.account_id}</td>
                            <td className="py-1 pr-2">{f.type}</td>
                            <td className="text-right py-1 pr-2 font-mono">{f.fullAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="text-right py-1 pr-2">{f.elapsedLevels > 0 ? <span className="text-amber-600 font-semibold">{f.elapsedLevels}</span> : '—'}</td>
                            <td className="text-right py-1 font-mono font-semibold">{f.fundingAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold">
                          <td colSpan={2} className="py-1 pr-2">Total</td>
                          <td className="text-right py-1 pr-2 font-mono">{totalFull.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="text-right py-1 pr-2 text-amber-600">{totalElapsedLevels}</td>
                          <td className="text-right py-1 font-mono text-primary">{totalFunding.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Per-wallet full amount: {amountPerWallet.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA
                    (11 / {rate}) · start price {adjustedStartPrice.toFixed(6)} (+8% buffer) · no PHI donation ·
                    admin pays <strong>{totalFunding.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA</strong> + tx fee
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Wallets */}
        {stepReached('wallets') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                3. Generate &amp; Register Wallets
              </CardTitle>
              <CardDescription>
                8 wallets are generated, the PDF is downloaded for YOU (the admin), and the wallets are
                registered under the user's hex ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!walletsRegistered ? (
                <Button onClick={handleGenerateAndRegister} disabled={generating}>
                  {generating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Working...</>
                  ) : (
                    <><FileDown className="h-4 w-4 mr-2" /> Generate 8 Wallets + PDF + Register</>
                  )}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" /> 8 wallets generated, PDF downloaded, registered under user
                  </div>
                  {relayVerified === 'verifying' && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Radio className="h-4 w-4 animate-pulse" /> Verifying KIND 30889 on relays...
                    </div>
                  )}
                  {relayVerified === 'verified' && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> Verified on relays (KIND 30889)
                    </div>
                  )}
                  {relayVerified === 'failed' && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 flex-wrap">
                      <AlertTriangle className="h-4 w-4" /> Not yet visible on relays
                      <Button
                        variant="outline" size="sm"
                        onClick={() => verifyOnRelays(generatedWallets, 2000)}
                        disabled={generating}
                      >
                        Re-check relays
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        onClick={handleGenerateAndRegister}
                        disabled={generating}
                      >
                        Re-register
                      </Button>
                    </div>
                  )}
                  <div className="grid gap-1 pt-2">
                    {generatedWallets.map((w, i) => (
                      <div key={i} className="text-xs font-mono text-muted-foreground">
                        #{i + 1} {w.address}
                        <span className="ml-2 text-primary">
                          → {funding[i]?.fundingAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA
                        </span>
                      </div>
                    ))}
                  </div>
                  {step === 'wallets' && relayVerified === 'verified' && (
                    <Button onClick={() => setStep('fund')} className="mt-2">
                      Continue to Funding <Send className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Fund from admin wallet */}
        {stepReached('fund') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                4. Fund from YOUR Wallet
              </CardTitle>
              <CardDescription>
                Enter your (admin) WIF private key. {totalFunding.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA
                will be sent from your wallet to the 8 annuity wallets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="wif">Admin WIF Private Key</Label>
                <Input
                  id="wif" type="password"
                  value={adminWif}
                  onChange={(e) => setAdminWif(e.target.value)}
                  placeholder="Enter your WIF private key..."
                  className="font-mono text-sm"
                  disabled={step !== 'fund' || sending}
                />
              </div>
              {wifValidating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Validating key &amp; fetching balance...
                </div>
              )}
              {adminWallet && !wifValidating && (
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-mono text-xs">{adminWallet}</span>
                  </div>
                  {adminBalance !== null && (
                    <div className={adminBalance >= totalFunding + FEE_BUFFER ? 'text-green-600' : 'text-destructive'}>
                      Balance: {adminBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA
                      (need ~{(totalFunding + FEE_BUFFER).toFixed(2)})
                      {adminBalance < totalFunding + FEE_BUFFER && (
                        <span className="ml-1 inline-flex items-center"><XCircle className="h-3 w-3 mr-1" /> insufficient</span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {recipientsAlreadyFunded && step === 'fund' && (
                <label className="flex items-start gap-2 text-xs text-destructive p-2 bg-destructive/10 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceResend}
                    onChange={(e) => setForceResend(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I checked the explorer — the previous send did NOT land. Force re-send
                    (danger: double payment if the earlier tx confirms later).
                  </span>
                </label>
              )}
              {step === 'fund' && (
                <Button
                  onClick={handleFund}
                  disabled={sending || !adminWallet || wifValidating || (adminBalance !== null && adminBalance < totalFunding + FEE_BUFFER)}
                  className="w-full"
                >
                  {sending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending transaction...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Send {totalFunding.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA to 8 Wallets</>
                  )}
                </Button>
              )}
              {txHash && (
                <div className="text-sm">
                  <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Funded — </span>
                  <a
                    href={`https://chainz.cryptoid.info/lana/tx.dws?${txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-mono text-xs"
                  >
                    {txHash.slice(0, 20)}...
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 5: Publish */}
        {stepReached('publish') && (
          <Card>
            <CardHeader>
              <CardTitle>5. Publish Annuity Plan (KIND 88888)</CardTitle>
              <CardDescription>
                Full Split {splitNum} plan — identical to regular enrollments at that split. Elapsed levels
                stay in the plan; their funds were simply not transferred.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {step === 'publish' && (
                <Button onClick={handlePublish} disabled={publishing} className="w-full">
                  {publishing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Publishing...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Publish Plan to Nostr</>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Done */}
        {step === 'done' && publishResult && (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="pt-6">
              <div className="text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                <h3 className="text-xl font-bold text-green-700">Split {splitNum} Enrollment Complete!</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>User: <span className="font-mono text-xs">{hexId.slice(0, 16)}...</span></p>
                  <p>Funding tx: <span className="font-mono text-xs">{txHash.slice(0, 20)}...</span></p>
                  <p>Event ID: <span className="font-mono text-xs">{publishResult.event_id}</span></p>
                  <p>Published to {publishResult.publish_results?.filter((r) => r.success).length || 0} relay(s)</p>
                  <p className="text-amber-600 font-semibold pt-2">
                    ⚠ Hand the wallet PDF to the user — it is their only backup!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminSplitEnroll;
