import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, QrCode, CheckCircle, XCircle, Wallet, UserPlus } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { api as supabase } from '@/integrations/api/client';
import { convertWifToIds } from '@/lib/lanaKeys';
import { fetchKind0Profile } from '@/lib/nostrClient';

interface WaitingListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relays: string[];
}

type Step = 'ask-wallet' | 'new-user-form' | 'existing-user-key' | 'success';

export const WaitingListDialog = ({ open, onOpenChange, relays }: WaitingListDialogProps) => {
  const [step, setStep] = useState<Step>('ask-wallet');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // New user form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  
  // Existing user fields
  const [privateKey, setPrivateKey] = useState('');
  const [existingEmail, setExistingEmail] = useState('');
  const [existingPhone, setExistingPhone] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyValidation, setKeyValidation] = useState<{
    valid: boolean;
    nostrHexId?: string;
    walletId?: string;
    error?: string;
  } | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep('ask-wallet');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setAddress('');
      setPrivateKey('');
      setExistingEmail('');
      setExistingPhone('');
      setKeyValidation(null);
      setIsValidatingKey(false);
    }
  }, [open]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // Validate private key when it changes
  useEffect(() => {
    if (privateKey.trim().length < 10) {
      setKeyValidation(null);
      return;
    }

    const validateKey = async () => {
      setIsValidatingKey(true);
      setKeyValidation(null);

      try {
        // Derive nostr hex ID and wallet ID from private key
        const derivedIds = await convertWifToIds(privateKey.trim());
        
        if (!derivedIds || !derivedIds.nostrHexId) {
          setKeyValidation({ valid: false, error: 'Invalid private key format' });
          return;
        }

        // Check if KIND 0 profile exists on relays
        const profile = await fetchKind0Profile(derivedIds.nostrHexId, relays);
        
        if (!profile) {
          setKeyValidation({ 
            valid: false, 
            error: 'No registered profile found for this wallet. Please register your wallet first.' 
          });
          return;
        }

        setKeyValidation({
          valid: true,
          nostrHexId: derivedIds.nostrHexId,
          walletId: derivedIds.walletId
        });
        
      } catch (error) {
        console.error('Error validating key:', error);
        setKeyValidation({ valid: false, error: 'Failed to validate private key' });
      } finally {
        setIsValidatingKey(false);
      }
    };

    const timeoutId = setTimeout(validateKey, 800);
    return () => clearTimeout(timeoutId);
  }, [privateKey, relays]);

  const startScanning = async () => {
    setIsScanning(true);
    
    setTimeout(async () => {
      try {
        const cameras = await Html5Qrcode.getCameras();
        
        if (!cameras || cameras.length === 0) {
          toast.error("No camera found on this device");
          setIsScanning(false);
          return;
        }

        let selectedCamera = cameras[0];
        if (cameras.length > 1) {
          const backCamera = cameras.find(camera => 
            camera.label.toLowerCase().includes('back') || 
            camera.label.toLowerCase().includes('rear')
          );
          if (backCamera) selectedCamera = backCamera;
        }

        const scanner = new Html5Qrcode("qr-reader-waiting-list");
        scannerRef.current = scanner;

        await scanner.start(
          selectedCamera.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setPrivateKey(decodedText);
            stopScanning();
            toast.success("QR code scanned successfully!");
          },
          () => {}
        );
      } catch (error: any) {
        console.error("Error starting QR scanner:", error);
        setIsScanning(false);
        toast.error(`Camera error: ${error.message || "Unknown error"}`);
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

  const handleNewUserSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('waiting_list')
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone_number: phone.trim(),
          address: address.trim() || null,
          has_wallet: false
        });

      if (error) throw error;

      toast.success('You have been added to the waiting list!');
      setStep('success');
    } catch (error) {
      console.error('Error adding to waiting list:', error);
      toast.error('Failed to join waiting list. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExistingUserSubmit = async () => {
    if (!keyValidation?.valid || !existingEmail.trim() || !existingPhone.trim()) {
      toast.error('Please fill in all required fields and provide a valid private key');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('waiting_list')
        .insert({
          email: existingEmail.trim(),
          phone_number: existingPhone.trim(),
          nostr_hex_id: keyValidation.nostrHexId,
          wallet_id: keyValidation.walletId,
          has_wallet: true
        });

      if (error) throw error;

      toast.success('You have been added to the waiting list!');
      setStep('success');
    } catch (error) {
      console.error('Error adding to waiting list:', error);
      toast.error('Failed to join waiting list. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-2 sm:mx-0 max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {step === 'ask-wallet' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Join Waiting List</DialogTitle>
              <DialogDescription className="text-sm sm:text-base">
                No slots are currently available. Join our waiting list and we'll notify you when a slot becomes available.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Do you have a registered Lana wallet?
              </p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button 
                variant="outline" 
                onClick={() => setStep('new-user-form')} 
                className="w-full sm:w-auto gap-2"
              >
                <UserPlus className="h-4 w-4" />
                No, I'm new
              </Button>
              <Button 
                onClick={() => setStep('existing-user-key')} 
                className="w-full sm:w-auto gap-2"
              >
                <Wallet className="h-4 w-4" />
                Yes, I have a wallet
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'new-user-form' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">New User Registration</DialogTitle>
              <DialogDescription className="text-sm">
                Please provide your contact information so we can notify you when a slot is available.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address (Optional)</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Your address"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep('ask-wallet')} className="w-full sm:w-auto">
                Back
              </Button>
              <Button 
                onClick={handleNewUserSubmit} 
                disabled={isSubmitting || !firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Waiting List'
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'existing-user-key' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Verify Your Wallet</DialogTitle>
              <DialogDescription className="text-sm">
                Enter or scan your private key to verify your registered wallet.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="privateKey">Private Key (WIF) *</Label>
                <div className="flex gap-2">
                  <Input
                    id="privateKey"
                    type="password"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="Enter your private key..."
                    className="font-mono text-xs flex-1"
                    disabled={isScanning}
                  />
                  {!isScanning && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={startScanning}
                      title="Scan QR Code"
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                {/* Validation status */}
                {isValidatingKey && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying wallet...
                  </div>
                )}
                {keyValidation?.valid && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Wallet verified: {keyValidation.walletId?.substring(0, 12)}...
                  </div>
                )}
                {keyValidation?.valid === false && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    {keyValidation.error}
                  </div>
                )}
              </div>

              {/* QR Scanner */}
              {isScanning && (
                <div className="space-y-3">
                  <div
                    id="qr-reader-waiting-list"
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

              {/* Contact info - show only if key is valid */}
              {keyValidation?.valid && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-4 space-y-3">
                    <p className="text-sm font-medium">Contact Information</p>
                    <p className="text-xs text-muted-foreground">
                      We'll use this to notify you when a slot becomes available.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="existingEmail">Email Address *</Label>
                      <Input
                        id="existingEmail"
                        type="email"
                        value={existingEmail}
                        onChange={(e) => setExistingEmail(e.target.value)}
                        placeholder="your@email.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="existingPhone">Phone Number *</Label>
                      <Input
                        id="existingPhone"
                        type="tel"
                        value={existingPhone}
                        onChange={(e) => setExistingPhone(e.target.value)}
                        placeholder="+1234567890"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep('ask-wallet')} className="w-full sm:w-auto">
                Back
              </Button>
              <Button 
                onClick={handleExistingUserSubmit} 
                disabled={isSubmitting || !keyValidation?.valid || !existingEmail.trim() || !existingPhone.trim()}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Waiting List'
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                You're on the list!
              </DialogTitle>
            </DialogHeader>
            <div className="py-6 text-center">
              <p className="text-muted-foreground">
                We'll contact you via email and phone when a Lana8Wonder slot becomes available.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
