import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, CreditCard, Building2, ArrowLeft, QrCode, Loader2, AlertCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { validateLanaAddress } from '@/lib/walletValidation';
import { fetchKind0Profile, type LanaProfile } from '@/lib/nostrClient';
import { useNostrLanaParams } from '@/hooks/useNostrLanaParams';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const BuyLana8Wonder = () => {
  const navigate = useNavigate();
  const { params } = useNostrLanaParams();
  const [walletId, setWalletId] = useState('');
  const [payee, setPayee] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<'card' | 'transfer' | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<'EUR' | 'USD' | 'GBP'>('EUR');
  const [reference, setReference] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [buyerProfile, setBuyerProfile] = useState<LanaProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [contactDetails, setContactDetails] = useState<string>('');
  const [showPaymentConfirmDialog, setShowPaymentConfirmDialog] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);

  // Calculate LANA amount based on selected currency
  const calculatedLanaAmount = params?.exchangeRates?.[selectedCurrency] 
    ? Math.floor(100 / params.exchangeRates[selectedCurrency])
    : 0;

  // Validate wallet address
  const validateWallet = async (address: string): Promise<boolean> => {
    if (!address || address.trim() === '') {
      setWalletError(null);
      return false;
    }

    const result = await validateLanaAddress(address);
    
    if (!result.valid) {
      setWalletError(result.error || 'Invalid wallet address');
      return false;
    }

    // Check if wallet already exists in database
    const { data: existingWallet, error: dbError } = await supabase
      .from('buy_lana')
      .select('id')
      .eq('lana_wallet_id', address)
      .maybeSingle();

    if (dbError) {
      console.error('Error checking wallet:', dbError);
      setWalletError('Error validating wallet. Please try again.');
      return false;
    }

    if (existingWallet) {
      setWalletError('This wallet address has already been used for a purchase');
      return false;
    }
    
    setWalletError(null);
    return true;
  };

  // Validate wallet on change
  useEffect(() => {
    if (walletId.trim()) {
      const timeoutId = setTimeout(() => {
        validateWallet(walletId);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setWalletError(null);
    }
  }, [walletId]);

  // Check if form is valid
  const isFormValid = walletId.trim() !== '' && 
                      payee.trim() !== '' && 
                      selectedPayment !== null && 
                      walletError === null &&
                      params?.exchangeRates?.[selectedCurrency];

  // Fetch contact details from app_settings
  useEffect(() => {
    const fetchContactDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'contact_details')
          .single();

        if (!error && data) {
          setContactDetails(data.setting_value);
        }
      } catch (error) {
        console.error('Error fetching contact details:', error);
      }
    };

    fetchContactDetails();
  }, []);

  // Fetch buyer profile from Nostr
  useEffect(() => {
    const fetchBuyerProfile = async () => {
      try {
        setIsLoadingProfile(true);
        
        // Fetch nostr_hex_id from app_settings
        const { data: settings, error } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'nostr_hex_id_buying_lanas')
          .single();

        if (error || !settings) {
          console.error('Error fetching buyer hex ID:', error);
          toast.error('Failed to load payment information');
          return;
        }

        const buyerHexId = settings.setting_value;

        // Wait for relays to be available
        if (!params?.relays || params.relays.length === 0) {
          console.log('Waiting for relays...');
          return;
        }

        // Fetch KIND 0 profile
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

    if (params?.relays) {
      fetchBuyerProfile();
    }
  }, [params?.relays]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanning = async () => {
    setIsScanning(true);
    
    // CRITICAL: 100ms delay to ensure DOM is ready
    setTimeout(async () => {
      try {
        // 1. Enumerate cameras
        const cameras = await Html5Qrcode.getCameras();
        
        if (!cameras || cameras.length === 0) {
          toast.error("No camera found on this device");
          setIsScanning(false);
          return;
        }

        // 2. Select camera (priority: back camera)
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

        // 3. Initialize scanner with unique ID
        const scanner = new Html5Qrcode("qr-reader-buy");
        scannerRef.current = scanner;

        // 4. Start scanner with camera.id
        await scanner.start(
          selectedCamera.id,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            setWalletId(decodedText);
            stopScanning();
            toast.success("QR code scanned successfully!");
          },
          (errorMessage) => {
            // Ignore scan errors during operation
          }
        );
      } catch (error: any) {
        console.error("Error starting QR scanner:", error);
        setIsScanning(false);
        
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          toast.error("Camera permission denied. Please allow camera access in your browser settings.");
        } else if (error.name === "NotFoundError") {
          toast.error("No camera found on this device");
        } else if (error.name === "NotReadableError") {
          toast.error("Camera is already in use by another application");
        } else {
          toast.error(`Error starting camera: ${error.message || "Unknown error"}`);
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
        console.error("Error stopping scanner:", error);
      }
    }
    setIsScanning(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!walletId.trim()) {
      toast.error('Please enter your Lana Wallet ID');
      return;
    }

    if (!payee.trim()) {
      toast.error('Please enter the payer name');
      return;
    }

    if (!selectedPayment) {
      toast.error('Please select a payment method');
      return;
    }

    setIsSubmitting(true);

    try {
      // Check if exchange rate is available
      if (!params?.exchangeRates?.[selectedCurrency]) {
        toast.error('Exchange rate not available. Please wait for data to load.');
        setIsSubmitting(false);
        return;
      }

      // Calculate LANA amount from Nostr exchange rates
      const lanaAmount = 100 / params.exchangeRates[selectedCurrency];

      // Save to database
      const { error } = await supabase
        .from('buy_lana')
        .insert({
          lana_wallet_id: walletId,
          lana_amount: lanaAmount,
          payee: payee,
          reference: reference,
          payment_method: selectedPayment,
          phone_number: phoneNumber || null,
          currency: selectedCurrency,
          payment_amount: 100
        });

      if (error) throw error;

      toast.success('Payment recorded successfully!');
      navigate('/buy-lana-instructions');
      // If credit card payment, open payment link in new tab
      if (selectedPayment === 'card' && buyerProfile?.payment_link) {
        window.open(buyerProfile.payment_link, '_blank');
      }

    } catch (error) {
      console.error('Error saving payment:', error);
      toast.error('Failed to record payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Wallet className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-3xl">Buy Lana8Wonder</CardTitle>
            <CardDescription>
              Enter your Lana Wallet ID and choose your payment method
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Wallet ID Input */}
              <div className="space-y-2">
                <Label htmlFor="walletId" className="text-sm sm:text-base">Lana Wallet ID *</Label>
                <div className="flex gap-2">
                  <Input
                    id="walletId"
                    type="text"
                    placeholder="Enter your Lana Wallet ID..."
                    value={walletId}
                    onChange={(e) => setWalletId(e.target.value)}
                    className={`font-mono text-xs sm:text-sm flex-1 ${walletError ? 'border-destructive' : ''}`}
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
                {walletError ? (
                  <p className="text-xs text-destructive break-words">{walletError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This is where your Lana8Wonder will be assigned
                  </p>
                )}
              </div>

              {/* Payee Input */}
              <div className="space-y-2">
                <Label htmlFor="payee" className="text-sm sm:text-base">Payer Name *</Label>
                <Input
                  id="payee"
                  type="text"
                  placeholder="Enter payer name..."
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  disabled={isScanning}
                  className="text-sm sm:text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Who is making the payment?
                </p>
              </div>

              {/* Phone Number Input */}
              <div className="space-y-2">
                <Label htmlFor="phoneNumber" className="text-sm sm:text-base">Phone Number (Optional)</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="+1234567890"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isScanning}
                  className="text-sm sm:text-base"
                />
                <p className="text-xs text-muted-foreground">
                  If provided, we'll notify you when LANA is transferred to your account
                </p>
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

              {/* Currency Selection */}
              <div className="space-y-3">
                <Label className="text-sm sm:text-base">Select Currency *</Label>
                
                {/* Currency buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {params?.exchangeRates ? (
                    Object.keys(params.exchangeRates).map((currency) => (
                      <Button
                        key={currency}
                        type="button"
                        variant={selectedCurrency === currency ? 'default' : 'outline'}
                        onClick={() => setSelectedCurrency(currency as 'EUR' | 'USD' | 'GBP')}
                        className="w-full text-sm sm:text-base"
                        disabled={isScanning}
                      >
                        {currency}
                      </Button>
                    ))
                  ) : (
                    <div className="col-span-3 flex items-center justify-center gap-2 text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading exchange rates...</span>
                    </div>
                  )}
                </div>

                {/* Calculation display */}
                {params?.exchangeRates?.[selectedCurrency] && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
                      <div className="text-center space-y-1 sm:space-y-2">
                        <p className="text-base sm:text-lg">
                          <span className="font-bold">100 {selectedCurrency}</span>
                          {' = '}
                          <span className="font-bold text-primary text-xl sm:text-2xl">
                            {calculatedLanaAmount.toLocaleString()} LANA
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Exchange rate: {params.exchangeRates[selectedCurrency]} {selectedCurrency} per LANA
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Payment Method Selection */}
              <div className="space-y-3">
                <Label className="text-sm sm:text-base">Payment Method *</Label>
                
                {/* Credit Card Option */}
                <div className="space-y-3">
                  <Card
                    className={`cursor-pointer transition-all hover:border-primary ${
                      selectedPayment === 'card'
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    } ${!buyerProfile?.payment_link ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => {
                      if (buyerProfile?.payment_link) {
                        setSelectedPayment('card');
                        setReference(null);
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
                        <h3 className="font-semibold text-sm sm:text-base">Pay with Credit Card</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          Fast and secure online payment
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedPayment === 'card'
                          ? 'border-primary'
                          : 'border-muted-foreground'
                      }`}>
                        {selectedPayment === 'card' && (
                          <div className="w-3 h-3 rounded-full bg-primary" />
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Show payment link for credit card - INSIDE credit card section */}
                  {selectedPayment === 'card' && buyerProfile?.payment_link && (
                    <Card className="bg-muted/50 border-primary/20">
                      <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
                        <div className="text-center space-y-3">
                          <p className="text-sm font-semibold mb-2">Credit Card Payment Link</p>
                          <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                            Click the button below to proceed to the secure payment page
                          </p>
                          <Button 
                            type="button"
                            className="w-full text-sm sm:text-base"
                            onClick={() => setShowPaymentConfirmDialog(true)}
                          >
                            Open Payment Page
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            After completing payment, return here and click "I have paid"
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pre-payment confirmation dialog */}
                  <AlertDialog open={showPaymentConfirmDialog} onOpenChange={setShowPaymentConfirmDialog}>
                    <AlertDialogContent className="max-w-md">
                      <AlertDialogHeader>
                        <div className="flex justify-center mb-4">
                          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-500" />
                          </div>
                        </div>
                        <AlertDialogTitle className="text-center text-xl">
                          Important: Complete Your Purchase
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-4 text-center">
                            <div className="bg-muted rounded-lg p-4 space-y-3">
                              <div className="flex items-start gap-3 text-left">
                                <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">1</span>
                                <p className="text-sm">You will be redirected to the secure payment page</p>
                              </div>
                              <div className="flex items-start gap-3 text-left">
                                <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">2</span>
                                <p className="text-sm">Complete your payment of <strong>100 {selectedCurrency}</strong></p>
                              </div>
                              <div className="flex items-start gap-3 text-left">
                                <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">3</span>
                                <p className="text-sm"><strong>Return to this page</strong> and click <strong>"I have paid"</strong></p>
                              </div>
                            </div>
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                              <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">
                                ⚠️ Your purchase will NOT be registered if you skip the final step!
                              </p>
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                        <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          className="w-full sm:w-auto"
                          onClick={() => {
                            if (buyerProfile?.payment_link) {
                              window.open(buyerProfile.payment_link, '_blank');
                            }
                          }}
                        >
                          I understand, open payment page
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Bank Transfer Option */}
                <div className="space-y-3">
                  <Card
                    className={`cursor-pointer transition-all hover:border-primary ${
                      selectedPayment === 'transfer'
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    }`}
                    onClick={() => {
                      setSelectedPayment('transfer');
                      // Generate 7-digit reference
                      const newReference = Math.floor(1000000 + Math.random() * 9000000).toString();
                      setReference(newReference);
                    }}
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
                        <h3 className="font-semibold text-sm sm:text-base">Bank Transfer</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          Direct transfer to our account
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedPayment === 'transfer'
                          ? 'border-primary'
                          : 'border-muted-foreground'
                      }`}>
                        {selectedPayment === 'transfer' && (
                          <div className="w-3 h-3 rounded-full bg-primary" />
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Show bank transfer details - INSIDE bank transfer section */}
                  {selectedPayment === 'transfer' && reference && buyerProfile && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6 space-y-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">Payment Reference Number</p>
                        <p className="text-2xl font-bold font-mono tracking-wider">{reference}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Please include this reference in your bank transfer
                        </p>
                      </div>

                      {/* Bank transfer details from KIND 0 profile */}
                      {buyerProfile.payment_methods && buyerProfile.payment_methods.length > 0 && (
                        <div className="border-t border-border pt-4 space-y-3">
                          <p className="text-sm font-semibold text-center">Bank Transfer Details</p>
                          {buyerProfile.payment_methods
                            .filter((pm: any) => pm.scope === 'collect' || pm.scope === 'both')
                            .map((pm: any, idx: number) => (
                              <div key={idx} className="bg-background rounded-lg p-3 space-y-2">
                                {/* Account holder name */}
                                {(buyerProfile.display_name || buyerProfile.name) && (
                                  <div className="flex justify-between">
                                    <span className="text-xs text-muted-foreground">Account Holder:</span>
                                    <span className="text-xs font-mono">{buyerProfile.display_name || buyerProfile.name}</span>
                                  </div>
                                )}
                                {/* Address (location) */}
                                {buyerProfile.location && (
                                  <div className="flex justify-between">
                                    <span className="text-xs text-muted-foreground">Address:</span>
                                    <span className="text-xs font-mono text-right">{buyerProfile.location}</span>
                                  </div>
                                )}
                                {/* Country */}
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
                          <p className="text-sm font-semibold text-center">Bank Transfer Details</p>
                          <div className="bg-background rounded-lg p-3 space-y-2">
                            {/* Account Holder - from display_name or name */}
                            {(buyerProfile.display_name || buyerProfile.name) && (
                              <div className="flex justify-between">
                                <span className="text-xs text-muted-foreground">Account Holder:</span>
                                <span className="text-xs font-mono">{buyerProfile.display_name || buyerProfile.name}</span>
                              </div>
                            )}
                            {/* Address - from location */}
                            {buyerProfile.location && (
                              <div className="flex justify-between">
                                <span className="text-xs text-muted-foreground">Address:</span>
                                <span className="text-xs font-mono text-right">{buyerProfile.location}</span>
                              </div>
                            )}
                            {/* Country */}
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
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full text-sm sm:text-base" 
                size="lg" 
                disabled={!isFormValid || isSubmitting || isLoadingProfile}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="text-sm sm:text-base">Processing...</span>
                  </>
                ) : isLoadingProfile ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="text-sm sm:text-base">Loading...</span>
                  </>
                ) : (
                  <span className="text-sm sm:text-base">I have paid</span>
                )}
              </Button>
              
              {!isFormValid && (walletId || payee || selectedPayment) && (
                <p className="text-xs text-center text-muted-foreground">
                  Please complete all required fields (*)
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Contact Information Card */}
        {contactDetails && (
          <Card className="mt-4 sm:mt-6 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
              <div className="text-center space-y-3 sm:space-y-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <svg 
                    className="w-5 h-5 sm:w-6 sm:h-6 text-primary" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-base sm:text-lg mb-2">Have Questions?</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                    If you have any questions, please contact:
                  </p>
                  <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-border">
                    <p className="font-medium text-foreground text-sm sm:text-base break-words">
                      {contactDetails}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default BuyLana8Wonder;
