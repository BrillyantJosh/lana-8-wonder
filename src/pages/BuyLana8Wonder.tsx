import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, CreditCard, Building2, ArrowLeft, QrCode } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';

const BuyLana8Wonder = () => {
  const navigate = useNavigate();
  const [walletId, setWalletId] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<'card' | 'transfer' | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!walletId.trim()) {
      toast.error('Please enter your Lana Wallet ID');
      return;
    }

    if (!selectedPayment) {
      toast.error('Please select a payment method');
      return;
    }

    toast.success(`Payment method selected: ${selectedPayment === 'card' ? 'Credit Card' : 'Bank Transfer'}`);
    // TODO: Implement payment processing
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
                <Label htmlFor="walletId">Lana Wallet ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="walletId"
                    type="text"
                    placeholder="Enter your Lana Wallet ID..."
                    value={walletId}
                    onChange={(e) => setWalletId(e.target.value)}
                    className="font-mono flex-1"
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
                <p className="text-xs text-muted-foreground">
                  This is where your Lana8Wonder will be assigned
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

              {/* Payment Method Selection */}
              <div className="space-y-3">
                <Label>Payment Method</Label>
                
                {/* Credit Card Option */}
                <Card
                  className={`cursor-pointer transition-all hover:border-primary ${
                    selectedPayment === 'card'
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  }`}
                  onClick={() => setSelectedPayment('card')}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      selectedPayment === 'card'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">Pay with Credit Card</h3>
                      <p className="text-sm text-muted-foreground">
                        Fast and secure online payment
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
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

                {/* Bank Transfer Option */}
                <Card
                  className={`cursor-pointer transition-all hover:border-primary ${
                    selectedPayment === 'transfer'
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  }`}
                  onClick={() => setSelectedPayment('transfer')}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      selectedPayment === 'transfer'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">Bank Transfer</h3>
                      <p className="text-sm text-muted-foreground">
                        Direct transfer to our account
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
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
              </div>

              {/* Submit Button */}
              <Button type="submit" className="w-full" size="lg">
                Continue to Payment
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 bg-muted/50">
          <CardContent className="pt-6">
            <h4 className="font-semibold mb-2">💡 What is Lana8Wonder?</h4>
            <p className="text-sm text-muted-foreground">
              Lana8Wonder is your personal trading plan that costs exactly €100 (paid in LANA coins). 
              Once purchased, you'll receive strategic trading signals and be part of an exclusive trading community.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default BuyLana8Wonder;
