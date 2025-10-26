import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Send, QrCode, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Html5Qrcode } from "html5-qrcode";
import { verifyWifMatchesWallet } from "@/lib/wifValidation";
import { supabase } from "@/integrations/supabase/client";

const SendLanaConfirm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [wifPrivateKey, setWifPrivateKey] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    validated: boolean;
    matches: boolean;
    derivedWalletId?: string;
    error?: string;
  } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      // Cleanup validation timeout
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [isScanning]);

  // Auto-validate WIF when user stops typing (debounced)
  useEffect(() => {
    // Clear previous timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    // Reset validation if field is empty
    if (!wifPrivateKey.trim()) {
      setValidationResult(null);
      return;
    }

    // Set new timeout for validation (500ms after user stops typing)
    validationTimeoutRef.current = setTimeout(async () => {
      if (!fromWallet) return;

      setIsValidating(true);

      try {
        const result = await verifyWifMatchesWallet(wifPrivateKey.trim(), fromWallet);
        
        setValidationResult({
          validated: true,
          matches: result.matches,
          derivedWalletId: result.derivedWalletId,
          error: result.error
        });

        if (!result.matches) {
          toast.error("Private key does not match the source wallet");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Validation failed";
        setValidationResult({
          validated: true,
          matches: false,
          error: errorMsg
        });
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [wifPrivateKey, fromWallet]);

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
    
    // CRITICAL: 100ms delay to ensure DOM is ready
    setTimeout(async () => {
      try {
        // 1. Enumerate cameras
        const cameras = await Html5Qrcode.getCameras();
        
        if (!cameras || cameras.length === 0) {
          toast.error("No camera found on this device");
          setShowScanner(false);
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
        const scanner = new Html5Qrcode("qr-reader-private-key");
        scannerRef.current = scanner;

        // 4. Start scanner with camera.id
        await scanner.start(
          selectedCamera.id,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          },
          (decodedText) => {
            setWifPrivateKey(decodedText);
            stopScanner();
            toast.success("Private key scanned successfully");
          },
          (errorMessage) => {
            // Ignore scan errors during operation
          }
        );
        
        setIsScanning(true);
      } catch (err) {
        console.error("Error starting scanner:", err);
        toast.error("Failed to start camera scanner");
        setShowScanner(false);
        setIsScanning(false);
      }
    }, 100);
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

  const handleConfirmTransfer = async () => {
    if (!validationResult?.matches) {
      toast.error("Please validate your private key first");
      return;
    }

    setIsProcessing(true);

    try {
      // Get Electrum servers from session
      const lanaSession = sessionStorage.getItem("lana_session");
      const params = sessionStorage.getItem("nostr_lana_params");
      
      let electrumServers = [];
      if (params) {
        const parsedParams = JSON.parse(params);
        electrumServers = parsedParams.electrumServers || [];
      }

      // Prepare transaction data
      const transactionData = {
        senderAddress: fromWallet,
        recipientAddress: toWallet,
        amount: parseFloat(amount!),
        privateKey: wifPrivateKey.trim(),
        electrumServers
      };

      console.log("Sending transaction...", {
        from: fromWallet,
        to: toWallet,
        amount: amount
      });

      // Call edge function
      const { data, error } = await supabase.functions.invoke("send-lana-transaction", {
        body: transactionData
      });

      if (error) {
        throw new Error(error.message || "Transaction failed");
      }

      if (!data.success) {
        throw new Error(data.error || "Transaction failed");
      }

      console.log("Transaction successful:", data);
      toast.success("Transaction sent successfully!");

      // Navigate to result page
      const resultParams = new URLSearchParams({
        success: "true",
        txHash: data.txHash || "",
        amount: (data.amount / 100000000).toFixed(4)
      });
      navigate(`/send-lana-result?${resultParams}`);

    } catch (error) {
      console.error("Transaction error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Transaction failed: ${errorMessage}`);
      
      // Navigate to error result page
      const resultParams = new URLSearchParams({
        success: "false",
        error: errorMessage
      });
      navigate(`/send-lana-result?${resultParams}`);
    } finally {
      setIsProcessing(false);
    }
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
                  <div className="relative">
                    <Input
                      id="wif-key"
                      type="password"
                      value={wifPrivateKey}
                      onChange={(e) => setWifPrivateKey(e.target.value)}
                      placeholder="Enter WIF private key"
                      className="font-mono pr-10"
                    />
                    {isValidating && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

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

                {/* Validation Result */}
                {validationResult?.validated && (
                  <Alert className={validationResult.matches ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10"}>
                    <div className="flex items-start gap-2">
                      {validationResult.matches ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <AlertDescription>
                          {validationResult.matches ? (
                            <>
                              <p className="font-semibold text-green-600">Private key validated successfully!</p>
                              <p className="text-xs mt-1 text-muted-foreground">
                                Derived wallet: <span className="font-mono">{validationResult.derivedWalletId}</span>
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-semibold text-red-600">Invalid private key for this wallet</p>
                              <p className="text-xs mt-1">
                                {validationResult.error || "The private key does not match the source wallet address"}
                              </p>
                              {validationResult.derivedWalletId && (
                                <p className="text-xs mt-1 text-muted-foreground">
                                  This key belongs to: <span className="font-mono">{validationResult.derivedWalletId}</span>
                                </p>
                              )}
                              <p className="text-xs mt-2 font-medium">
                                Please enter the correct private key for wallet: <span className="font-mono">{fromWallet}</span>
                              </p>
                            </>
                          )}
                        </AlertDescription>
                      </div>
                    </div>
                  </Alert>
                )}

                {/* QR Scanner */}
                {showScanner && (
                  <Card className="border-2">
                    <CardContent className="p-4">
                      <div 
                        id="qr-reader-private-key" 
                        ref={videoRef}
                        className="w-full rounded-lg overflow-hidden"
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
                  disabled={!validationResult?.matches || isProcessing}
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Confirm Transfer
                    </>
                  )}
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
