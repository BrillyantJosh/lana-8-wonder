import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet,
  CreditCard,
  Building2,
  ArrowLeft,
  QrCode,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  UserPlus,
  Check,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api as supabase, getDomainKey } from '@/integrations/api/client';
import { validateLanaAddress } from '@/lib/walletValidation';
import { fetchKind0Profile, type LanaProfile } from '@/lib/nostrClient';
import { useNostrLanaParams } from '@/hooks/useNostrLanaParams';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type WalletStatus = 'idle' | 'validating' | 'registered' | 'not_registered' | 'already_used' | 'invalid_format';

const BuyLana8Wonder = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { params } = useNostrLanaParams();

  // Wizard step
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Step 3: Wallet
  const [walletId, setWalletId] = useState('');
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('idle');
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 4: Payment
  const [currency, setCurrency] = useState<string>('');
  const [contactDetails, setContactDetails] = useState<string>('');
  const [buyerProfile, setBuyerProfile] = useState<LanaProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<'card' | 'transfer' | null>(null);
  const [payee, setPayee] = useState('');
  const [reference, setReference] = useState<string>('');

  // Step 5: Contact
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

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

  // QR Scanner
  const startScanning = async () => {
    setIsScanning(true);

    setTimeout(async () => {
      try {
        const cameras = await Html5Qrcode.getCameras();

        if (!cameras || cameras.length === 0) {
          toast.error('No camera found on this device');
          setIsScanning(false);
          return;
        }

        let selectedCamera = cameras[0];
        if (cameras.length > 1) {
          const backCamera = cameras.find(camera =>
            camera.label.toLowerCase().includes('back') ||
            camera.label.toLowerCase().includes('rear')
          );
          if (backCamera) {
            selectedCamera = backCamera;
          }
        }

        const scanner = new Html5Qrcode('qr-reader-buy');
        scannerRef.current = scanner;

        await scanner.start(
          selectedCamera.id,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            setWalletId(decodedText);
            stopScanning();
            toast.success('QR code scanned successfully!');
          },
          () => {
            // Ignore scan errors during operation
          }
        );
      } catch (error: any) {
        console.error('Error starting QR scanner:', error);
        setIsScanning(false);

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          toast.error('Camera permission denied. Please allow camera access in your browser settings.');
        } else if (error.name === 'NotFoundError') {
          toast.error('No camera found on this device');
        } else if (error.name === 'NotReadableError') {
          toast.error('Camera is already in use by another application');
        } else {
          toast.error(`Error starting camera: ${error.message || 'Unknown error'}`);
        }
      }
    }, 100);
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
    }
    setIsScanning(false);
  };

  // Submit order (step 5 -> step 6)
  const handleSubmitOrder = async () => {
    if (!phone.trim() || !email.trim()) {
      toast.error('Please fill in all contact fields');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('buy_lana')
        .insert({
          lana_wallet_id: walletId,
          lana_amount: 0,
          payee: payee,
          reference: reference,
          payment_method: selectedPayment,
          phone_number: phone,
          email: email,
          currency: currency,
          payment_amount: 100,
          split: params?.split || '',
          status: 'pending'
        });

      if (error) throw error;

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
              className={`font-mono text-xs sm:text-sm flex-1 ${
                walletStatus === 'registered'
                  ? 'border-green-500'
                  : walletStatus === 'not_registered' || walletStatus === 'already_used' || walletStatus === 'invalid_format'
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
        </div>

        {/* QR Scanner */}
        {isScanning && (
          <div className="space-y-3">
            <div
              id="qr-reader-buy"
              ref={scannerDivRef}
              className="rounded-lg overflow-hidden border-2 border-primary"
            />
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
        <Button
          className="w-full"
          size="lg"
          disabled={walletStatus !== 'registered'}
          onClick={() => setCurrentStep(4)}
        >
          {t('buyLana.step3Continue')}
        </Button>
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
                        100 {currency}
                      </span>
                    </p>
                  </div>
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
                <Card className="bg-muted/50 border-primary/20">
                  <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
                    <div className="text-center space-y-2">
                      <p className="text-sm font-semibold">Credit Card Payment Link</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        The payment page will open after you submit your order.
                      </p>
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
              {selectedPayment === 'transfer' && buyerProfile && (
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

                    {/* Bank details from payment_methods */}
                    {buyerProfile.payment_methods && buyerProfile.payment_methods.length > 0 && (
                      <div className="border-t border-border pt-4 space-y-3">
                        <p className="text-sm font-semibold text-center">{t('buyLana.step4BankDetails')}</p>
                        {buyerProfile.payment_methods
                          .filter((pm: any) => pm.scope === 'collect' || pm.scope === 'both')
                          .map((pm: any, idx: number) => (
                            <div key={idx} className="bg-background rounded-lg p-3 space-y-2">
                              {(buyerProfile.display_name || buyerProfile.name) && (
                                <div className="flex justify-between">
                                  <span className="text-xs text-muted-foreground">Account Holder:</span>
                                  <span className="text-xs font-mono">{buyerProfile.display_name || buyerProfile.name}</span>
                                </div>
                              )}
                              {buyerProfile.location && (
                                <div className="flex justify-between">
                                  <span className="text-xs text-muted-foreground">Address:</span>
                                  <span className="text-xs font-mono text-right">{buyerProfile.location}</span>
                                </div>
                              )}
                              {buyerProfile.country && (
                                <div className="flex justify-between">
                                  <span className="text-xs text-muted-foreground">Country:</span>
                                  <span className="text-xs font-mono">{buyerProfile.country}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-xs text-muted-foreground">Method:</span>
                                <span className="text-xs font-mono">{pm.label || pm.scheme}</span>
                              </div>
                              {pm.fields?.iban && (
                                <div className="flex justify-between">
                                  <span className="text-xs text-muted-foreground">IBAN:</span>
                                  <span className="text-xs font-mono">{pm.fields.iban}</span>
                                </div>
                              )}
                              {pm.fields?.bic && (
                                <div className="flex justify-between">
                                  <span className="text-xs text-muted-foreground">BIC:</span>
                                  <span className="text-xs font-mono">{pm.fields.bic}</span>
                                </div>
                              )}
                              {pm.fields?.account_number && (
                                <div className="flex justify-between">
                                  <span className="text-xs text-muted-foreground">Account:</span>
                                  <span className="text-xs font-mono">{pm.fields.account_number}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-xs text-muted-foreground">Currency:</span>
                                <span className="text-xs font-mono">{pm.currency}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Legacy bank fields fallback */}
                    {(!buyerProfile.payment_methods || buyerProfile.payment_methods.length === 0) &&
                     (buyerProfile.bankName || buyerProfile.bankAccount) && (
                      <div className="border-t border-border pt-4 space-y-2">
                        <p className="text-sm font-semibold text-center">{t('buyLana.step4BankDetails')}</p>
                        <div className="bg-background rounded-lg p-3 space-y-2">
                          {(buyerProfile.display_name || buyerProfile.name) && (
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">Account Holder:</span>
                              <span className="text-xs font-mono">{buyerProfile.display_name || buyerProfile.name}</span>
                            </div>
                          )}
                          {buyerProfile.location && (
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">Address:</span>
                              <span className="text-xs font-mono text-right">{buyerProfile.location}</span>
                            </div>
                          )}
                          {buyerProfile.country && (
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">Country:</span>
                              <span className="text-xs font-mono">{buyerProfile.country}</span>
                            </div>
                          )}
                          {buyerProfile.bankName && (
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">Bank:</span>
                              <span className="text-xs">{buyerProfile.bankName}</span>
                            </div>
                          )}
                          {buyerProfile.bankAccount && (
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">Account:</span>
                              <span className="text-xs font-mono">{buyerProfile.bankAccount}</span>
                            </div>
                          )}
                          {buyerProfile.bankSWIFT && (
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">SWIFT:</span>
                              <span className="text-xs font-mono">{buyerProfile.bankSWIFT}</span>
                            </div>
                          )}
                          {buyerProfile.bankAddress && (
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">Bank Address:</span>
                              <span className="text-xs">{buyerProfile.bankAddress}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
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
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-500" />
        </div>
        <CardTitle className="text-2xl sm:text-3xl">{t('buyLana.step6Title')}</CardTitle>
        <CardDescription className="text-sm sm:text-base">
          {t('buyLana.step6Message')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Card className="bg-primary/5 border-primary/20">
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
