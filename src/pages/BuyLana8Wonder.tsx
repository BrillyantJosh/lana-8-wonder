import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet,
  CreditCard,
  Building2,
  Globe,
  ArrowLeft,
  QrCode,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  UserPlus,
  Check,
  FileDown,
} from 'lucide-react';
import { useQRScanner } from '@/hooks/useQRScanner';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api as supabase, getDomainKey } from '@/integrations/api/client';
import { validateLanaAddress } from '@/lib/walletValidation';
import { validateWifAndGetAddress } from '@/lib/wifValidation';
import { fetchKind0Profile, type LanaProfile } from '@/lib/nostrClient';
import { useNostrLanaParams } from '@/hooks/useNostrLanaParams';
import {
  buildPaymentInstructions,
  type PaymentInstructions,
  type PaymentMethodChoice,
} from '@/lib/paymentInstructions';
import { generatePaymentSlipPDF, type PaymentSlipRow } from '@/lib/paymentSlipPdf';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type WalletStatus = 'idle' | 'validating' | 'registered' | 'not_registered' | 'already_used' | 'invalid_format' | 'has_lana8wonder';

const BuyLana8Wonder = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { params } = useNostrLanaParams();

  // Check if buy LANA is enabled and pre-load currency from domain config
  useEffect(() => {
    const checkBuyEnabled = async () => {
      try {
        const domainKey = getDomainKey();
        const res = await fetch('/api/domain-config', {
          headers: domainKey ? { 'X-Domain-Key': domainKey } : {}
        });
        const json = await res.json();
        if (json.data?.enable_buy_lana === 0) {
          toast.error(t('buyLana.buyDisabled') || 'Buying LANA is not available for this domain.');
          navigate('/', { replace: true });
        }
        // Pre-load currency and contact details early (not just on step 4)
        if (json.data?.currency_default) {
          setCurrency(json.data.currency_default);
        }
        if (json.data?.contact_details) {
          setContactDetails(json.data.contact_details);
        }
        // Load international payment config
        if (json.data) {
          setIntlPaymentConfig({
            enable_international_payments: json.data.enable_international_payments || 0,
            intl_recipient_name: json.data.intl_recipient_name || '',
            intl_bank_name: json.data.intl_bank_name || '',
            intl_bank_address: json.data.intl_bank_address || '',
            intl_iban: json.data.intl_iban || '',
            intl_swift: json.data.intl_swift || '',
          });
        }
      } catch { /* ignore */ }
    };
    checkBuyEnabled();
  }, [navigate, t]);

  // Wizard step
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Step 3: Wallet
  const [walletId, setWalletId] = useState('');
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('idle');
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const { videoRef, canvasRef, startScanning: startQR, cleanup: cleanupQR } = useQRScanner();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 4: Payment
  const [currency, setCurrency] = useState<string>('');
  const [contactDetails, setContactDetails] = useState<string>('');
  const [buyerProfile, setBuyerProfile] = useState<LanaProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<'card' | 'transfer' | 'international' | null>(null);
  const [payee, setPayee] = useState('');
  const [reference, setReference] = useState<string>('');
  const [intlPaymentConfig, setIntlPaymentConfig] = useState<{
    enable_international_payments: number;
    intl_recipient_name: string;
    intl_bank_name: string;
    intl_bank_address: string;
    intl_iban: string;
    intl_swift: string;
  } | null>(null);

  // Wallet balance for dynamic payment calculation
  const [existingBalance, setExistingBalance] = useState<number>(0);
  const [existingValueInCurrency, setExistingValueInCurrency] = useState<number>(0);

  const TOTAL_REQUIRED = 100;
  const dynamicPaymentAmount = Math.max(0, Math.ceil(TOTAL_REQUIRED - existingValueInCurrency));
  const walletHasEnough = existingValueInCurrency >= TOTAL_REQUIRED;

  // Step 5: Contact
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 6: the order as it was actually persisted.
  // Buyers were losing the bank details by moving past step 4, so the final
  // page repeats them — but it must repeat what we STORED, not what the wizard
  // happens to still hold in memory. This is read back from the insert, so the
  // reference the buyer writes on the transfer is provably the one we will
  // match the incoming money against.
  const [confirmedOrder, setConfirmedOrder] = useState<{
    reference: string | null;
    payment_amount: number | null;
    currency: string | null;
    payment_method: string | null;
    payee: string | null;
    lana_wallet_id: string | null;
  } | null>(null);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const autoDownloadedRef = useRef(false);

  // Fetch wallet balance when wallet is registered and params are available
  useEffect(() => {
    if (walletStatus !== 'registered' || !walletId || !params?.electrum || !params?.exchangeRates) return;

    const fetchBalance = async () => {
      try {
        console.log('Fetching wallet balance for dynamic payment...', walletId);
        const electrumServers = params.electrum.map(e => ({
          host: e.host,
          port: parseInt(String(e.port))
        }));

        const balRes = await fetch('/api/check-wallet-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_addresses: [walletId],
            electrum_servers: electrumServers
          })
        });
        const balJson = await balRes.json();
        console.log('Balance response:', balJson);

        if (balJson.success && balJson.wallets?.length > 0) {
          const bal = balJson.wallets[0].balance || 0;
          setExistingBalance(bal);
          const effectiveCurrency = currency || 'EUR';
          const rate = params.exchangeRates[effectiveCurrency as keyof typeof params.exchangeRates] || params.exchangeRates.EUR || 0;
          const valueInCurrency = Math.round(bal * rate * 100) / 100;
          setExistingValueInCurrency(valueInCurrency);
          console.log(`Wallet balance: ${bal} LANA = ${valueInCurrency} ${effectiveCurrency} (rate: ${rate})`);
        }
      } catch (err) {
        console.error('Balance check failed:', err);
        setExistingBalance(0);
        setExistingValueInCurrency(0);
      }
    };

    fetchBalance();
  }, [walletStatus, walletId, params?.electrum, params?.exchangeRates, currency]);

  // Recalculate existing value when currency or rates change
  useEffect(() => {
    if (existingBalance > 0 && currency && params?.exchangeRates) {
      const rate = params.exchangeRates[currency as keyof typeof params.exchangeRates] || 0;
      setExistingValueInCurrency(Math.round(existingBalance * rate * 100) / 100);
    }
  }, [currency, existingBalance, params?.exchangeRates]);

  // Generate 7-digit reference on step 4 mount
  useEffect(() => {
    if (currentStep === 4 && !reference) {
      setReference(Math.floor(1000000 + Math.random() * 9000000).toString());
    }
  }, [currentStep, reference]);

  // Fetch domain config when entering step 4
  useEffect(() => {
    if (currentStep !== 4) return;

    const fetchDomainConfig = async () => {
      try {
        const res = await fetch('/api/domain-config', {
          headers: {
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          }
        });
        const json = await res.json();
        if (json.data) {
          setContactDetails(json.data.contact_details || '');
          if (json.data.currency_default && !currency) {
            setCurrency(json.data.currency_default);
          }
          // Refresh international payment config
          setIntlPaymentConfig({
            enable_international_payments: json.data.enable_international_payments || 0,
            intl_recipient_name: json.data.intl_recipient_name || '',
            intl_bank_name: json.data.intl_bank_name || '',
            intl_bank_address: json.data.intl_bank_address || '',
            intl_iban: json.data.intl_iban || '',
            intl_swift: json.data.intl_swift || '',
          });
        }
      } catch (error) {
        console.error('Error fetching domain config:', error);
      }
    };

    fetchDomainConfig();
  }, [currentStep]);

  // Fetch buyer profile from Nostr when entering step 4
  useEffect(() => {
    if (currentStep !== 4) return;
    if (!params?.relays || params.relays.length === 0) return;

    const fetchBuyerProfile = async () => {
      try {
        setIsLoadingProfile(true);

        const res = await fetch('/api/domain-config', {
          headers: {
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          }
        });
        const json = await res.json();

        if (!json.data?.nostr_hex_id_buying_lanas) {
          console.error('No buyer hex ID in domain config');
          toast.error('Failed to load payment information');
          return;
        }

        const buyerHexId = json.data.nostr_hex_id_buying_lanas;
        const profile = await fetchKind0Profile(buyerHexId, params.relays);

        if (!profile) {
          toast.error('Payment profile not found');
          return;
        }

        // Use domain config payment_link as fallback if Nostr profile doesn't have one
        if (!profile.payment_link && json.data.payment_link) {
          profile.payment_link = json.data.payment_link;
        }

        setBuyerProfile(profile);
        console.log('Buyer profile loaded:', profile);
      } catch (error) {
        console.error('Error fetching buyer profile:', error);
        toast.error('Failed to load payment information');
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchBuyerProfile();
  }, [currentStep, params?.relays]);

  // Cleanup QR scanner on unmount
  useEffect(() => {
    return () => { cleanupQR(); };
  }, [cleanupQR]);

  // Debounced wallet validation for step 3
  const validateWallet = useCallback(async (address: string) => {
    if (!address || address.trim() === '') {
      setWalletStatus('idle');
      setWalletError(null);
      return;
    }

    setWalletStatus('validating');
    setWalletError(null);

    // 1. Format validation
    const formatResult = await validateLanaAddress(address);
    if (!formatResult.valid) {
      setWalletStatus('invalid_format');
      setWalletError(formatResult.error || 'Invalid wallet address');
      return;
    }

    // 2. Check uniqueness in buy_lana table
    const { data: existingWallet, error: dbError } = await supabase
      .from('buy_lana')
      .select('id')
      .eq('lana_wallet_id', address)
      .maybeSingle();

    if (dbError) {
      console.error('Error checking wallet:', dbError);
      setWalletStatus('idle');
      setWalletError('Error validating wallet. Please try again.');
      return;
    }

    if (existingWallet) {
      setWalletStatus('already_used');
      setWalletError(t('buyLana.step3AlreadyUsed'));
      return;
    }

    // 3. Check registration on backend
    try {
      const res = await fetch('/api/check-wallet-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
        },
        body: JSON.stringify({ wallet_id: address })
      });
      const json = await res.json();

      if (json.registered) {
        // Check if this wallet's owner already has a Lana8Wonder plan (KIND 88888)
        // Uses server-side endpoint for reliable relay connectivity
        const hexId = json.wallet?.nostr_hex_id;
        if (hexId) {
          try {
            const l8wRes = await fetch('/api/check-lana8wonder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nostr_hex_id: hexId })
            });
            const l8wJson = await l8wRes.json();
            if (l8wJson.has_plan) {
              setWalletStatus('has_lana8wonder');
              setWalletError(t('buyLana.step3HasLana8Wonder'));
              return;
            }
          } catch (err) {
            console.error('Error checking KIND 88888:', err);
            // Non-fatal — allow to proceed if check fails
          }
        }

        setWalletStatus('registered');
        setWalletError(null);
      } else {
        setWalletStatus('not_registered');
        setWalletError(t('buyLana.step3NotRegistered'));
      }
    } catch (error) {
      console.error('Error checking registration:', error);
      setWalletStatus('idle');
      setWalletError('Error checking registration. Please try again.');
    }
  }, [t]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (walletId.trim()) {
      debounceRef.current = setTimeout(() => {
        validateWallet(walletId);
      }, 800);
    } else {
      setWalletStatus('idle');
      setWalletError(null);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [walletId, validateWallet]);

  // Smart input handler: accepts both LANA address and LANA WIF (private key).
  // If input is a WIF, derives the wallet address automatically.
  const processWalletInput = async (raw: string): Promise<string> => {
    const cleaned = raw.replace(/[\s​-‍﻿]/g, '');

    // First, try as LANA address (cheaper validation)
    const addressResult = await validateLanaAddress(cleaned);
    if (addressResult.valid) {
      return cleaned;
    }

    // If not a valid address, try as WIF and derive address
    try {
      const wifResult = await validateWifAndGetAddress(cleaned);
      if (wifResult.valid && wifResult.walletId) {
        toast.success(t('buyLana.step3WifDetected') || 'WIF detected — wallet address derived', { duration: 4000 });
        return wifResult.walletId;
      }
    } catch {
      // Not a WIF either
    }

    // Return as-is (will fail validation and show error to user)
    return cleaned;
  };

  // QR Scanner
  const startScanning = async () => {
    setIsScanning(true);
    try {
      await startQR(async (data) => {
        setIsScanning(false);
        const processed = await processWalletInput(data);
        setWalletId(processed);
        toast.success('QR code scanned successfully!');
      });
    } catch (err: any) {
      console.error('Error starting QR scanner:', err);
      setIsScanning(false);
      toast.error(err.message || 'Camera error');
    }
  };

  const stopScanning = () => {
    cleanupQR();
    setIsScanning(false);
  };

  // Submit order (step 5 -> step 6)
  const handleSubmitOrder = async () => {
    if (!phone.trim() || !email.trim()) {
      toast.error('Please fill in all contact fields');
      return;
    }

    // Ensure currency is set — fallback to domain default if somehow empty
    let effectiveCurrency = currency;
    if (!effectiveCurrency) {
      try {
        const domainKey = getDomainKey();
        const res = await fetch('/api/domain-config', {
          headers: domainKey ? { 'X-Domain-Key': domainKey } : {}
        });
        const json = await res.json();
        effectiveCurrency = json.data?.currency_default || 'EUR';
        setCurrency(effectiveCurrency);
      } catch {
        effectiveCurrency = 'EUR';
      }
    }

    setIsSubmitting(true);

    // Exactly what gets written to the row. Unchanged from before — the only
    // difference is that we now read the row back so the confirmation page can
    // quote the stored facts rather than re-deriving them.
    const orderRow = {
      lana_wallet_id: walletId,
      lana_amount: 0,
      payee: payee,
      reference: reference,
      payment_method: selectedPayment,
      phone_number: phone,
      email: email,
      currency: effectiveCurrency,
      payment_amount: dynamicPaymentAmount,
      existing_balance: existingBalance,
      existing_value_in_currency: existingValueInCurrency,
      split: params?.split || '',
      status: 'pending'
    };

    try {
      const { data: savedRow, error } = await supabase
        .from('buy_lana')
        .insert(orderRow)
        .select('reference, payment_amount, currency, payment_method, payee, lana_wallet_id')
        .single();

      if (error) throw error;

      // Prefer the values SQLite handed back. If the API ever stops echoing the
      // row, fall back to the payload we just submitted in this same call —
      // still the same values, never a leftover from an earlier step.
      const stored = (savedRow && typeof savedRow === 'object')
        ? savedRow as Record<string, unknown>
        : null;
      if (!stored) {
        console.warn('[buy_lana] insert returned no row; using the submitted payload for the confirmation page');
      }
      setConfirmedOrder({
        reference: (stored?.reference as string) ?? orderRow.reference ?? null,
        payment_amount: (stored?.payment_amount as number) ?? orderRow.payment_amount ?? null,
        currency: (stored?.currency as string) ?? orderRow.currency ?? null,
        payment_method: (stored?.payment_method as string) ?? orderRow.payment_method ?? null,
        payee: (stored?.payee as string) ?? orderRow.payee ?? null,
        lana_wallet_id: (stored?.lana_wallet_id as string) ?? orderRow.lana_wallet_id ?? null,
      });

      // If credit card, open payment link
      if (selectedPayment === 'card' && buyerProfile?.payment_link) {
        window.open(buyerProfile.payment_link, '_blank');
      }

      toast.success('Order submitted successfully!');
      setCurrentStep(6);
    } catch (error) {
      console.error('Error saving order:', error);
      toast.error('Failed to submit order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Payment instructions --------------------------------------------
  // Built once, from the per-domain sources only, and reused by step 4, the
  // confirmation page and the PDF. One builder is what stops the three from
  // ever showing different account numbers.
  const translate = t as unknown as (key: string) => string;

  const selectedInstructions = useMemo(
    () => buildPaymentInstructions({
      method: selectedPayment,
      buyerProfile,
      intlConfig: intlPaymentConfig,
      currency: currency || 'EUR',
      t: translate,
    }),
    [selectedPayment, buyerProfile, intlPaymentConfig, currency, translate]
  );

  const confirmedMethod = (confirmedOrder?.payment_method as PaymentMethodChoice) ?? null;
  const confirmedInstructions = useMemo(
    () => buildPaymentInstructions({
      method: confirmedMethod,
      buyerProfile,
      intlConfig: intlPaymentConfig,
      currency: confirmedOrder?.currency || currency || 'EUR',
      t: translate,
    }),
    [confirmedMethod, buyerProfile, intlPaymentConfig, confirmedOrder?.currency, currency, translate]
  );

  const isBankOrder = confirmedMethod === 'transfer' || confirmedMethod === 'international';

  // ---- Payment slip PDF ---------------------------------------------------
  // Fed the same confirmedOrder and confirmedInstructions the page renders, and
  // labelled with the same t() the page uses, so it is in the buyer's language
  // and cannot disagree with the screen.
  const buildSlipInput = useCallback(() => {
    if (!confirmedOrder) return null;

    const summary: PaymentSlipRow[] = [];
    if (confirmedOrder.payee) {
      summary.push({ label: translate('buyLana.step4Payee'), value: confirmedOrder.payee });
    }
    if (confirmedOrder.lana_wallet_id) {
      summary.push({ label: translate('buyLana.pdfWallet'), value: confirmedOrder.lana_wallet_id });
    }
    summary.push({
      label: translate('buyLana.pdfIssued'),
      value: new Date().toLocaleDateString(i18n.language || 'en'),
    });

    const amountKnown = confirmedOrder.payment_amount !== null
      && confirmedOrder.payment_amount !== undefined
      && !!confirmedOrder.currency;

    const notes = [translate('buyLana.step6PaymentReminder')];
    if (contactDetails) {
      notes.push(`${translate('buyLana.step6Questions')} ${contactDetails}`);
    }

    return {
      heading: translate('buyLana.pdfHeading'),
      intro: translate('buyLana.step6PaymentDetailsIntro'),
      amount: amountKnown
        ? {
            label: translate('buyLana.step4BreakdownToPay'),
            value: `${confirmedOrder.payment_amount} ${confirmedOrder.currency}`,
          }
        : undefined,
      reference: confirmedOrder.reference
        ? { label: translate('buyLana.step4Reference'), value: confirmedOrder.reference }
        : undefined,
      summary,
      instructions: confirmedInstructions,
      footerNotes: notes,
      // ASCII only: the file has to land safely on any phone or desktop.
      fileName: `lana8wonder-payment-${confirmedOrder.reference || 'order'}.pdf`,
    };
  }, [confirmedOrder, confirmedInstructions, contactDetails, translate, i18n.language]);

  const handleDownloadSlip = useCallback(async () => {
    const input = buildSlipInput();
    if (!input) return;
    setIsPreparingPdf(true);
    try {
      await generatePaymentSlipPDF(input);
    } catch (err) {
      console.error('Payment slip PDF failed:', err);
      toast.error(translate('buyLana.step6PdfFailed'));
    } finally {
      setIsPreparingPdf(false);
    }
  }, [buildSlipInput, translate]);

  // Start the download on the buyer's behalf, once, after the page has painted.
  // Browsers (phones especially) may refuse a download nobody clicked, so this
  // is best effort and stays silent on failure — the button below is the path
  // that always works.
  useEffect(() => {
    if (currentStep !== 6) return;
    if (autoDownloadedRef.current) return;
    if (!confirmedOrder || !isBankOrder || !confirmedInstructions) return;

    autoDownloadedRef.current = true;
    const timer = setTimeout(() => {
      const input = buildSlipInput();
      if (!input) return;
      generatePaymentSlipPDF(input).catch((err) => {
        console.warn('Automatic payment slip download did not start:', err);
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [currentStep, confirmedOrder, isBankOrder, confirmedInstructions, buildSlipInput]);

  // ---- Shared renderers ---------------------------------------------------
  const renderPaymentInstructions = (instructions: PaymentInstructions) => (
    <div className="border-t border-border pt-4 space-y-3">
      <p className="text-sm font-semibold text-center">{instructions.title}</p>
      {instructions.blocks.map((block, blockIdx) => (
        <div key={blockIdx} className="bg-background rounded-lg p-3 space-y-2">
          {block.lines.map((line, lineIdx) => (
            <div key={lineIdx} className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground flex-shrink-0">{line.label}:</span>
              <span className="text-xs font-mono text-right break-all">{line.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  // A missing account must read as missing — never a blank row the buyer might
  // mistake for a real one.
  const renderDetailsUnavailable = () => (
    <div className="border-t border-border pt-4">
      <div className="flex items-start gap-2 rounded-lg border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-200">{t('buyLana.detailsUnavailable')}</p>
      </div>
    </div>
  );

  // Step navigation helpers
  const goBack = () => {
    if (currentStep === 1) {
      navigate('/');
    } else if (currentStep === 2) {
      setCurrentStep(1);
    } else if (currentStep === 3) {
      setCurrentStep(1);
    } else if (currentStep === 4) {
      setCurrentStep(3);
    } else if (currentStep === 5) {
      setCurrentStep(4);
    }
  };

  // Progress indicator
  const ProgressIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {([1, 2, 3, 4, 5, 6] as Step[]).map(s => (
        <div
          key={s}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            s === currentStep
              ? 'bg-primary text-primary-foreground'
              : s < currentStep
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {s < currentStep ? <Check className="w-4 h-4" /> : s}
        </div>
      ))}
    </div>
  );

  // Wallet status indicator
  const WalletStatusIndicator = () => {
    if (walletStatus === 'idle') return null;

    if (walletStatus === 'validating') {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">{t('buyLana.step3Checking')}</span>
        </div>
      );
    }

    if (walletStatus === 'registered') {
      return (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-xs">{t('buyLana.step3Registered')}</span>
        </div>
      );
    }

    if (walletStatus === 'not_registered') {
      return (
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-xs">{t('buyLana.step3NotRegistered')}</span>
        </div>
      );
    }

    if (walletStatus === 'already_used') {
      return (
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-xs">{t('buyLana.step3AlreadyUsed')}</span>
        </div>
      );
    }

    if (walletStatus === 'invalid_format') {
      return (
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-xs">{walletError}</span>
        </div>
      );
    }

    if (walletStatus === 'has_lana8wonder') {
      return (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border-2 border-red-300 dark:border-red-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">{t('buyLana.step3HasLana8Wonder')}</span>
          </div>
        </div>
      );
    }

    return null;
  };

  // ------- STEP RENDERS -------

  const renderStep1 = () => (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-2xl sm:text-3xl">{t('buyLana.step1Title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Yes, I have a registered wallet */}
        <Card
          className="cursor-pointer transition-all hover:border-primary hover:bg-primary/5 border-2"
          onClick={() => setCurrentStep(3)}
        >
          <CardContent className="flex items-center gap-4 p-4 sm:p-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm sm:text-base">{t('buyLana.step1HasWallet')}</h3>
            </div>
            <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-180 flex-shrink-0" />
          </CardContent>
        </Card>

        {/* No, I'm new → redirect to 100million2everyone.com to create wallet */}
        <Card
          className="cursor-pointer transition-all hover:border-primary hover:bg-primary/5 border-2"
          onClick={() => {
            const returnUrl = encodeURIComponent(`${window.location.origin}/buy-lana8wonder`);
            const siteName = encodeURIComponent('Lana8Wonder');
            window.open(
              `https://100million2everyone.com/?return_url=${returnUrl}&site_name=${siteName}`,
              '_blank'
            );
          }}
        >
          <CardContent className="flex items-center gap-4 p-4 sm:p-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm sm:text-base">{t('buyLana.step1NoWallet')}</h3>
            </div>
            <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-180 flex-shrink-0" />
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-500" />
        </div>
        <CardTitle className="text-2xl sm:text-3xl">{t('buyLana.step2Title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-6">
            <p className="text-sm sm:text-base text-amber-800 dark:text-amber-200 leading-relaxed">
              {t('buyLana.step2Notice')}
            </p>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          onClick={() => setCurrentStep(3)}
        >
          {t('buyLana.step2Agree')}
        </Button>
      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-2xl sm:text-3xl">{t('buyLana.step3Title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Wallet input */}
        <div className="space-y-2">
          <Label htmlFor="walletId" className="text-sm sm:text-base">
            {t('buyLana.step3WalletLabel')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="walletId"
              type="text"
              placeholder={t('buyLana.step3WalletPlaceholder')}
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              onPaste={async (e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData('text');
                const processed = await processWalletInput(pasted);
                setWalletId(processed);
              }}
              className={`font-mono text-xs sm:text-sm flex-1 ${
                walletStatus === 'registered'
                  ? 'border-green-500'
                  : walletStatus === 'not_registered' || walletStatus === 'already_used' || walletStatus === 'invalid_format' || walletStatus === 'has_lana8wonder'
                  ? 'border-destructive'
                  : ''
              }`}
              disabled={isScanning}
            />
            {!isScanning && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={startScanning}
                title="Scan QR Code"
                className="flex-shrink-0"
              >
                <QrCode className="h-4 w-4" />
              </Button>
            )}
          </div>
          <WalletStatusIndicator />
          {!walletId.trim() && (
            <p className="text-xs text-muted-foreground mt-1">
              💡 {t('buyLana.step3WifHint')}
            </p>
          )}
        </div>

        {/* QR Scanner */}
        {isScanning && (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden border-2 border-primary aspect-square bg-black">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-4 left-4 w-10 h-10 border-l-4 border-t-4 border-primary rounded-tl-lg" />
                <div className="absolute top-4 right-4 w-10 h-10 border-r-4 border-t-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-4 left-4 w-10 h-10 border-l-4 border-b-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-4 right-4 w-10 h-10 border-r-4 border-b-4 border-primary rounded-br-lg" />
              </div>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={stopScanning}
            >
              Stop Scanning
            </Button>
          </div>
        )}

        {/* Continue button */}
        {/* Balance info when wallet has existing LANA */}
        {walletStatus === 'registered' && existingBalance > 0 && !walletHasEnough && (
          <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4 pb-4">
              <div className="text-center space-y-1">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {t('buyLana.step3BalanceFound', {
                    balance: existingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                    value: existingValueInCurrency.toFixed(2),
                    currency: currency || 'EUR'
                  })}
                </p>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                  {t('buyLana.step3ReducedPayment', {
                    amount: dynamicPaymentAmount,
                    currency: currency || 'EUR'
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Wallet already has enough LANA */}
        {walletStatus === 'registered' && walletHasEnough && (
          <Card className="bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800">
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center gap-3 justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-green-700 dark:text-green-300 text-center">
                  {t('buyLana.step3WalletHasEnough')}
                </p>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 text-center">
                {t('buyLana.step3LoginPrompt')}
              </p>
            </CardContent>
          </Card>
        )}

        {walletStatus === 'registered' && walletHasEnough ? (
          <Button
            className="w-full"
            size="lg"
            onClick={() => navigate('/login')}
          >
            {t('buyLana.step6Login')}
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            disabled={walletStatus !== 'registered'}
            onClick={() => setCurrentStep(4)}
          >
            {t('buyLana.step3Continue')}
          </Button>
        )}
      </CardContent>
    </Card>
  );

  const renderStep4 = () => (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <CreditCard className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-2xl sm:text-3xl">{t('buyLana.step4Title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoadingProfile ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{t('common.loading')}</span>
          </div>
        ) : (
          <>
            {/* Payment amount display */}
            {currency && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
                  <div className="text-center">
                    <p className="text-base sm:text-lg">
                      {t('buyLana.step4PaymentAmount')}:{' '}
                      <span className="font-bold text-primary text-xl sm:text-2xl">
                        {dynamicPaymentAmount} {currency}
                      </span>
                    </p>
                  </div>
                  {/* Breakdown when user has existing balance */}
                  {existingBalance > 0 && existingValueInCurrency > 0 && (
                    <div className="mt-3 pt-3 border-t border-primary/20 space-y-1 text-xs sm:text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('buyLana.step4BreakdownTotal')}</span>
                        <span>{TOTAL_REQUIRED} {currency}</span>
                      </div>
                      <div className="flex justify-between text-green-600 dark:text-green-400">
                        <span>{t('buyLana.step4BreakdownExisting')}</span>
                        <span>-{existingValueInCurrency.toFixed(2)} {currency} ({existingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA)</span>
                      </div>
                      <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-primary/10">
                        <span>{t('buyLana.step4BreakdownToPay')}</span>
                        <span>{dynamicPaymentAmount} {currency}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Payment method toggle */}
            <div className="space-y-3">
              <Label className="text-sm sm:text-base">{t('buyLana.step4PaymentMethod')}</Label>

              {/* Credit Card */}
              <Card
                className={`cursor-pointer transition-all hover:border-primary ${
                  selectedPayment === 'card'
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                } ${!buyerProfile?.payment_link ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (buyerProfile?.payment_link) {
                    setSelectedPayment('card');
                  } else {
                    toast.error('Credit card payment not available');
                  }
                }}
              >
                <CardContent className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    selectedPayment === 'card'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base">{t('buyLana.step4CardPayment')}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      Fast and secure online payment
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedPayment === 'card' ? 'border-primary' : 'border-muted-foreground'
                  }`}>
                    {selectedPayment === 'card' && <div className="w-3 h-3 rounded-full bg-primary" />}
                  </div>
                </CardContent>
              </Card>

              {/* Credit card payment link info */}
              {selectedPayment === 'card' && buyerProfile?.payment_link && (
                <Card className="bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 border-2">
                  <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300">{t('buyLana.step4CardPayment')}</p>
                        <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">
                          {t('buyLana.step4CardPaymentNotice')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bank Transfer */}
              <Card
                className={`cursor-pointer transition-all hover:border-primary ${
                  selectedPayment === 'transfer'
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                }`}
                onClick={() => setSelectedPayment('transfer')}
              >
                <CardContent className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    selectedPayment === 'transfer'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base">{t('buyLana.step4BankTransfer')}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      Direct transfer to our account
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedPayment === 'transfer' ? 'border-primary' : 'border-muted-foreground'
                  }`}>
                    {selectedPayment === 'transfer' && <div className="w-3 h-3 rounded-full bg-primary" />}
                  </div>
                </CardContent>
              </Card>

              {/* Bank transfer details */}
              {selectedPayment === 'transfer' && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-6 space-y-4">
                    {/* Reference number */}
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">{t('buyLana.step4Reference')}</p>
                      <p className="text-2xl font-bold font-mono tracking-wider">{reference}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Please include this reference in your bank transfer
                      </p>
                    </div>

                    {selectedInstructions
                      ? renderPaymentInstructions(selectedInstructions)
                      : renderDetailsUnavailable()}
                  </CardContent>
                </Card>
              )}

              {/* International Payment - only shown when enabled by admin */}
              {intlPaymentConfig?.enable_international_payments === 1 && (
                <>
                  <Card
                    className={`cursor-pointer transition-all hover:border-primary ${
                      selectedPayment === 'international'
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    }`}
                    onClick={() => setSelectedPayment('international')}
                  >
                    <CardContent className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                        selectedPayment === 'international'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <Globe className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm sm:text-base">{t('buyLana.step4InternationalPayment')}</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          {t('buyLana.step4InternationalDesc')}
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedPayment === 'international' ? 'border-primary' : 'border-muted-foreground'
                      }`}>
                        {selectedPayment === 'international' && <div className="w-3 h-3 rounded-full bg-primary" />}
                      </div>
                    </CardContent>
                  </Card>

                  {/* International payment details */}
                  {selectedPayment === 'international' && (
                    <Card className="bg-muted/50">
                      <CardContent className="pt-6 space-y-4">
                        {/* Reference number */}
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground mb-2">{t('buyLana.step4Reference')}</p>
                          <p className="text-2xl font-bold font-mono tracking-wider">{reference}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {t('buyLana.step4IntlReferenceNote')}
                          </p>
                        </div>

                        {selectedInstructions
                          ? renderPaymentInstructions(selectedInstructions)
                          : renderDetailsUnavailable()}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>

            {/* Payee name */}
            <div className="space-y-2">
              <Label htmlFor="payee" className="text-sm sm:text-base">{t('buyLana.step4Payee')}</Label>
              <Input
                id="payee"
                type="text"
                placeholder={t('buyLana.step4PayeePlaceholder')}
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                className="text-sm sm:text-base"
              />
            </div>

            {/* Continue button */}
            <Button
              className="w-full"
              size="lg"
              disabled={!selectedPayment || !payee.trim()}
              onClick={() => setCurrentStep(5)}
            >
              {t('buyLana.step4Continue')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );

  const renderStep5 = () => (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl sm:text-3xl">{t('buyLana.step5Title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Phone number */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm sm:text-base">{t('buyLana.step5Phone')}</Label>
          <Input
            id="phone"
            type="tel"
            placeholder={t('buyLana.step5PhonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="text-sm sm:text-base"
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm sm:text-base">{t('buyLana.step5Email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t('buyLana.step5EmailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-sm sm:text-base"
          />
        </div>

        {/* Order summary */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 pb-4">
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground">{t('buyLana.step4PaymentAmount')}</p>
              <p className="text-xl font-bold text-primary">{dynamicPaymentAmount} {currency || 'EUR'}</p>
              {existingBalance > 0 && (
                <p className="text-xs text-muted-foreground">
                  ({t('buyLana.step4BreakdownTotal')}: {TOTAL_REQUIRED} {currency || 'EUR'} — {t('buyLana.step4BreakdownExisting')}: {existingValueInCurrency.toFixed(2)} {currency || 'EUR'})
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Info text */}
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {t('buyLana.step5Notice')}
            </p>
          </CardContent>
        </Card>

        {/* Submit order button */}
        <Button
          className="w-full"
          size="lg"
          disabled={!phone.trim() || !email.trim() || isSubmitting}
          onClick={handleSubmitOrder}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-sm sm:text-base">Processing...</span>
            </>
          ) : (
            <span className="text-sm sm:text-base">{t('buyLana.step5Submit')}</span>
          )}
        </Button>
      </CardContent>
    </Card>
  );

  const renderStep6 = () => (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-500" />
        </div>
        <CardTitle className="text-2xl sm:text-3xl">{t('buyLana.step6Title')}</CardTitle>
        <CardDescription className="text-sm sm:text-base">
          {t('buyLana.step6Message')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Payment reminder - prominent red warning */}
        <Card className="bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 border-2">
          <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm sm:text-base font-semibold text-red-700 dark:text-red-300">
                {t('buyLana.step6PaymentReminder')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Order amount summary — quoted from the row we stored, not recomputed */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 pb-4">
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground">{t('buyLana.step4BreakdownToPay')}</p>
              {confirmedOrder && confirmedOrder.payment_amount !== null && confirmedOrder.currency ? (
                <p className="text-2xl font-bold text-primary">
                  {confirmedOrder.payment_amount} {confirmedOrder.currency}
                </p>
              ) : (
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {t('buyLana.detailsUnavailable')}
                </p>
              )}
              {existingBalance > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('buyLana.step3BalanceFound', {
                    balance: existingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                    value: existingValueInCurrency.toFixed(2),
                    currency: confirmedOrder?.currency || currency || 'EUR'
                  })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* The bank details again.
            This is the whole point of the final page: buyers kept reaching it
            with nowhere left to read the account number or the reference, so
            both are repeated here — and the PDF below is theirs to keep. */}
        {isBankOrder && (
          <Card className="border-2 border-primary/40">
            <CardHeader className="pb-3 text-center">
              <CardTitle className="text-base sm:text-lg">{t('buyLana.step6PaymentDetailsTitle')}</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {t('buyLana.step6PaymentDetailsIntro')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Reference — the value stored on the order, character for character */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">{t('buyLana.step4Reference')}</p>
                {confirmedOrder?.reference ? (
                  <p className="text-2xl font-bold font-mono tracking-wider break-all">
                    {confirmedOrder.reference}
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {t('buyLana.step6ReferenceMissing')}
                  </p>
                )}
              </div>

              {confirmedInstructions
                ? renderPaymentInstructions(confirmedInstructions)
                : renderDetailsUnavailable()}

              <Button
                variant="secondary"
                className="w-full"
                size="lg"
                onClick={handleDownloadSlip}
                disabled={isPreparingPdf || !confirmedOrder}
              >
                {isPreparingPdf ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="text-sm sm:text-base">{t('common.loading')}</span>
                  </>
                ) : (
                  <>
                    <FileDown className="mr-2 h-4 w-4" />
                    <span className="text-sm sm:text-base">{t('buyLana.step6DownloadPdf')}</span>
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <p className="text-sm sm:text-base text-center text-muted-foreground">
              {t('buyLana.step6NextSplit')}
            </p>
          </CardContent>
        </Card>

        {/* Contact details */}
        {contactDetails && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
              <div className="text-center space-y-3">
                <h4 className="font-semibold text-base sm:text-lg">{t('buyLana.step6Questions')}</h4>
                <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-border">
                  <p className="font-medium text-foreground text-sm sm:text-base break-words">
                    {contactDetails}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            size="lg"
            onClick={() => navigate('/')}
          >
            {t('buyLana.step6BackHome')}
          </Button>
          <Button
            className="flex-1"
            size="lg"
            onClick={() => navigate('/login')}
          >
            {t('buyLana.step6Login')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      default: return renderStep1();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          {currentStep < 6 && (
            <Button
              variant="ghost"
              onClick={goBack}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <ProgressIndicator />
        {renderCurrentStep()}
      </main>
    </div>
  );
};

export default BuyLana8Wonder;
