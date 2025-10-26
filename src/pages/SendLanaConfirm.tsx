import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Send, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { Html5Qrcode } from "html5-qrcode";

const SendLanaConfirm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [wifPrivateKey, setWifPrivateKey] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  // Get transfer params from URL
  const accountId = searchParams.get("accountId");
  const fromWallet = searchParams.get("fromWallet");
  const toWallet = searchParams.get("toWallet");
  const amount = searchParams.get("amount");

  useEffect(() => {
    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current && isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [isScanning]);

  const handleBack = () => {
    // Go back to send-lana page with params
    const sendParams = new URLSearchParams({
      accountId: accountId || "",
      wallet: fromWallet || "",
      amount: amount || ""
    });
    navigate(`/send-lana?${sendParams}`);
  };

  const startScanner = async () => {
    setShowScanner(true);
    setIsScanning(true);

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          // Successfully scanned
          setWifPrivateKey(decodedText);
          stopScanner();
          toast.success("Private key scanned successfully");
        },
        (errorMessage) => {
          // Scanning error (ignore, happens continuously)
          console.log("Scanning...", errorMessage);
        }
      );
    } catch (err) {
      console.error("Error starting scanner:", err);
      toast.error("Failed to start camera scanner");
      setShowScanner(false);
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    setShowScanner(false);
    setIsScanning(false);
  };

  const handleConfirmTransfer = () => {
    if (!wifPrivateKey.trim()) {
      toast.error("Please enter or scan your WIF private key");
      return;
    }

    // TODO: Implement actual transfer logic here
    toast.info("Transfer functionality will be implemented soon");
    
    // For now, just navigate back to dashboard
    setTimeout(() => {
      navigate("/dashboard");
    }, 1500);
  };

  if (!accountId || !fromWallet || !toWallet || !amount) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invalid Transfer Request</CardTitle>
            <CardDescription>Missing required transfer information</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/dashboard")}>Return to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Confirm LANA Transfer</CardTitle>
              <CardDescription>
                Review transfer details and enter your private key
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Transfer Summary */}
              <div className="border rounded-lg p-4 bg-muted space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">From Account:</p>
                  <p className="font-semibold">Account {accountId}</p>
                  <p className="text-xs font-mono break-all">{fromWallet}</p>
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-1">To Wallet:</p>
                  <p className="text-sm font-mono break-all">{toWallet}</p>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-1">Amount:</p>
                  <p className="text-3xl font-bold text-green-600">
                    {parseFloat(amount).toFixed(4)} LANA
                  </p>
                </div>
              </div>

              {/* Private Key Input */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="wif-key">LANA WIF Private Key</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    Enter your Wallet Import Format (WIF) private key to sign the transaction
                  </p>
                  <Input
                    id="wif-key"
                    type="password"
                    value={wifPrivateKey}
                    onChange={(e) => setWifPrivateKey(e.target.value)}
                    placeholder="Enter WIF private key"
                    className="font-mono"
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={showScanner ? stopScanner : startScanner}
                    className="w-full"
                  >
                    {showScanner ? (
                      <>
                        <X className="mr-2 h-4 w-4" />
                        Cancel Scan
                      </>
                    ) : (
                      <>
                        <QrCode className="mr-2 h-4 w-4" />
                        Scan QR Code
                      </>
                    )}
                  </Button>
                </div>

                {/* QR Scanner */}
                {showScanner && (
                  <Card className="border-2">
                    <CardContent className="p-4">
                      <div 
                        id="qr-reader" 
                        ref={videoRef}
                        className="w-full"
                      />
                      <p className="text-xs text-center text-muted-foreground mt-2">
                        Position the QR code within the frame
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button variant="outline" onClick={handleBack}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmTransfer}
                  disabled={!wifPrivateKey.trim()}
                  size="lg"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Confirm Transfer
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security Notice */}
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">⚠️ Security Notice:</strong> Your private key is never stored or transmitted. 
                It is only used locally to sign the transaction.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SendLanaConfirm;
