import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, QrCode, CheckCircle2, XCircle, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { Html5Qrcode } from "html5-qrcode";

interface WalletValidation {
  address: string;
  balance: number | null;
  isValid: boolean | null;
  isChecking: boolean;
  error?: string;
}

const AssignLana8Wonder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { params } = useNostrLanaParams();
  const [wallets, setWallets] = useState<WalletValidation[]>(
    Array(8).fill(null).map(() => ({
      address: "",
      balance: null,
      isValid: null,
      isChecking: false,
    }))
  );
  const [scannerActive, setScannerActive] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sourceWallet = location.state?.sourceWallet;
  const sourceBalance = location.state?.balance;

  useEffect(() => {
    if (!sourceWallet) {
      toast.error("No source wallet selected");
      navigate("/create-lana8wonder");
    }
  }, [sourceWallet, navigate]);

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

  const checkWalletBalance = async (address: string, index: number) => {
    if (!address.trim()) return;

    setWallets(prev => prev.map((w, i) => 
      i === index ? { ...w, isChecking: true, error: undefined } : w
    ));

    try {
      const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
        body: { 
          wallet_addresses: [address],
          electrum_servers: params?.electrum || []
        },
      });

      if (error) throw error;

      if (data?.success && data?.wallets && data.wallets.length > 0) {
        const walletData = data.wallets[0];
        const balance = walletData.balance || 0;
        const isValid = balance === 0;

        setWallets(prev => prev.map((w, i) => 
          i === index ? {
            ...w,
            balance,
            isValid,
            isChecking: false,
            error: isValid ? undefined : `Wallet has balance of ${balance.toFixed(8)} LANA. Only empty wallets are accepted.`
          } : w
        ));

        if (!isValid) {
          toast.error(`Wallet ${index + 1} is not empty`);
        } else {
          toast.success(`Wallet ${index + 1} is valid`);
        }
      } else {
        // Wallet not found - this is also valid (empty/new wallet)
        setWallets(prev => prev.map((w, i) => 
          i === index ? {
            ...w,
            balance: 0,
            isValid: true,
            isChecking: false,
            error: undefined
          } : w
        ));
        toast.success(`Wallet ${index + 1} is valid (new/empty)`);
      }
    } catch (error) {
      console.error("Error checking wallet:", error);
      setWallets(prev => prev.map((w, i) => 
        i === index ? {
          ...w,
          isChecking: false,
          isValid: false,
          error: "Failed to verify wallet"
        } : w
      ));
      toast.error("Failed to verify wallet");
    }
  };

  const handleAddressChange = (index: number, value: string) => {
    setWallets(prev => prev.map((w, i) => 
      i === index ? { address: value, balance: null, isValid: null, isChecking: false, error: undefined } : w
    ));

    // Clear previous timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    // Auto-verify after 500ms of no typing
    if (value.trim()) {
      validationTimeoutRef.current = setTimeout(() => {
        checkWalletBalance(value, index);
      }, 500);
    }
  };

  const handleScan = async (index: number) => {
    if (scannerActive !== null) {
      toast.error("Please close the current scanner first");
      return;
    }

    setScannerActive(index);
    
    // CRITICAL: 100ms delay to ensure DOM is ready
    setTimeout(async () => {
      try {
        // 1. Enumerate cameras
        const cameras = await Html5Qrcode.getCameras();
        
        if (!cameras || cameras.length === 0) {
          toast.error("No camera found on this device");
          setScannerActive(null);
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
        const scanner = new Html5Qrcode(`qr-reader-${index}`);
        scannerRef.current = scanner;

        // 4. Start scanner with camera.id
        await scanner.start(
          selectedCamera.id,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          },
          (decodedText) => {
            handleAddressChange(index, decodedText);
            stopScanner();
            toast.success("QR code scanned successfully");
          },
          (errorMessage) => {
            // Ignore scan errors during operation
          }
        );
        
        setIsScanning(true);
      } catch (err) {
        console.error("Error starting scanner:", err);
        toast.error("Failed to start camera scanner");
        setScannerActive(null);
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
    setScannerActive(null);
    setIsScanning(false);
  };

  const allWalletsValid = wallets.every(w => w.isValid === true && w.address.trim() !== "");

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/create-lana8wonder")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Assign Wallets to Lana 8 Wonder</h2>
          <p className="text-muted-foreground">
            Enter or scan 8 empty wallet addresses for your annuity plan
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Source Wallet</CardTitle>
            <CardDescription>
              This wallet will fund the Lana 8 Wonder plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Wallet Address</p>
                <p className="font-mono text-sm break-all">{sourceWallet}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="font-semibold">{sourceBalance?.toFixed(8) || "0.00000000"} LANA</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Annuity Wallet Accounts (8 Required)</CardTitle>
            <CardDescription>
              All wallets must be empty (balance = 0) or new/unregistered
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {wallets.map((wallet, index) => (
              <div key={index} className="space-y-2">
                <Label htmlFor={`wallet-${index}`}>
                  Wallet {index + 1}
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id={`wallet-${index}`}
                        value={wallet.address}
                        onChange={(e) => handleAddressChange(index, e.target.value)}
                        placeholder="Enter wallet address or scan QR code"
                        disabled={wallet.isChecking || scannerActive === index}
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => scannerActive === index ? stopScanner() : handleScan(index)}
                        disabled={wallet.isChecking}
                      >
                        {scannerActive === index ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <QrCode className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    
                    {scannerActive === index && (
                      <div id={`qr-reader-${index}`} className="w-full"></div>
                    )}
                    
                    {wallet.isValid !== null && !wallet.isChecking && (
                      <div className="flex items-center gap-2">
                        {wallet.isValid ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <Badge variant="default" className="bg-green-600">
                              Valid - Empty Wallet
                            </Badge>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-destructive" />
                            <Badge variant="destructive">Invalid</Badge>
                          </>
                        )}
                      </div>
                    )}
                    
                    {wallet.error && (
                      <p className="text-sm text-destructive">{wallet.error}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate("/create-lana8wonder")}>
            Cancel
          </Button>
          <Button
            disabled={!allWalletsValid}
            onClick={() => {
              toast.success("All wallets verified! Proceeding with plan creation...");
              // TODO: Implement plan creation logic
            }}
            className={allWalletsValid ? "bg-primary hover:bg-primary/90" : ""}
          >
            Create Plan
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssignLana8Wonder;
