import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, QrCode, CheckCircle2, XCircle, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { Html5Qrcode } from "html5-qrcode";
import { getCurrencySymbol } from "@/lib/utils";
import { validateLanaAddress } from "@/lib/walletValidation";
import { generate8Wallets } from "@/lib/walletGenerator";
import { generateWalletsPDF } from "@/lib/pdfGenerator";
import { GenerateWalletsDialog } from "@/components/GenerateWalletsDialog";

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
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const sourceWallet = location.state?.sourceWallet;
  const sourceBalance = location.state?.balance;
  const minRequiredLana = location.state?.minRequiredLana || 0;
  const planCurrency = location.state?.planCurrency || "EUR";
  const exchangeRate = location.state?.exchangeRate || 300000000;

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
      // First, validate the LanaCoin address format
      const validation = await validateLanaAddress(address);
      
      if (!validation.valid) {
        setWallets(prev => prev.map((w, i) => 
          i === index ? {
            ...w,
            isChecking: false,
            isValid: false,
            error: validation.error || "Invalid LanaCoin address"
          } : w
        ));
        toast.error(`Wallet ${index + 1}: ${validation.error || "Invalid address"}`);
        return;
      }

      // If address is valid, check balance via Electrum
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
          async (decodedText) => {
            handleAddressChange(index, decodedText);
            stopScanner();
            toast.success("QR code scanned successfully");
            // Trigger validation immediately after scan
            await checkWalletBalance(decodedText, index);
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

  const handleGenerateWallets = async () => {
    setIsGenerating(true);
    try {
      // Generate 8 wallets
      const generatedWallets = await generate8Wallets();
      
      // Update wallet addresses in the form
      const newWallets = generatedWallets.map(w => ({
        address: w.address,
        balance: 0,
        isValid: true,
        isChecking: false,
      }));
      setWallets(newWallets);
      
      // Get user name from Nostr profile
      const sessionData = sessionStorage.getItem("lana_session");
      let userName = "Anonymous User";
      
      if (sessionData) {
        try {
          const session = JSON.parse(sessionData);
          const nostrProfile = session.nostrProfile;
          if (nostrProfile?.name) {
            userName = nostrProfile.name;
          } else if (nostrProfile?.display_name) {
            userName = nostrProfile.display_name;
          }
        } catch (error) {
          console.error("Error parsing session:", error);
        }
      }
      
      // Generate PDF
      await generateWalletsPDF({
        wallets: generatedWallets,
        userName
      });
      
      toast.success("Wallets generated successfully! PDF has been downloaded.");
    } catch (error) {
      console.error("Error generating wallets:", error);
      toast.error("Failed to generate wallets. Please try again.");
    } finally {
      setIsGenerating(false);
      setShowGenerateDialog(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!allWalletsValid) return;
    
    try {
      // Get nostr_hex_id from session
      const sessionData = sessionStorage.getItem("lana_session");
      if (!sessionData) {
        toast.error("Session not found. Please login again.");
        navigate("/");
        return;
      }
      
      const session = JSON.parse(sessionData);
      const nostrHexId = session.nostrHexId;
      
      if (!nostrHexId) {
        toast.error("Invalid session data");
        return;
      }
      
      // Check if profile exists
      const { data: existingProfile, error: profileFetchError } = await supabase
        .from("profiles")
        .select("id")
        .eq("nostr_hex_id", nostrHexId)
        .maybeSingle();
      
      if (profileFetchError) {
        console.error("Error fetching profile:", profileFetchError);
        toast.error("Failed to check profile");
        return;
      }
      
      let profileId: string;
      
      if (!existingProfile) {
        // Create profile
        const { data: newProfile, error: profileInsertError } = await supabase
          .from("profiles")
          .insert({ nostr_hex_id: nostrHexId })
          .select("id")
          .single();
        
        if (profileInsertError) {
          console.error("Error creating profile:", profileInsertError);
          toast.error("Failed to create profile");
          return;
        }
        
        profileId = newProfile.id;
      } else {
        profileId = existingProfile.id;
      }
      
      // Insert wallets (unique constraint prevents duplicates)
      const walletsToInsert = wallets.map(w => ({
        profile_id: profileId,
        wallet_address: w.address,
        wallet_type: "annuity"
      }));
      
      const { error: walletsInsertError } = await supabase
        .from("wallets")
        .upsert(walletsToInsert, { 
          onConflict: "profile_id,wallet_address",
          ignoreDuplicates: true 
        });
      
      if (walletsInsertError) {
        console.error("Error inserting wallets:", walletsInsertError);
        toast.error("Failed to save wallets");
        return;
      }
      
      // Update profile with selected_wallet (wallet address, not ID)
      const { error: updateProfileError } = await supabase
        .from("profiles")
        .update({ selected_wallet: sourceWallet })
        .eq("id", profileId);
      
      if (updateProfileError) {
        console.error("Error updating profile with selected wallet:", updateProfileError);
      }
      
      toast.success("Plan data saved successfully");
      
      // Navigate to preview page with plan data
      navigate("/preview-lana8wonder", {
        state: {
          sourceWallet,
          sourceBalance,
          wallets,
          amountPerWallet,
          planCurrency,
          exchangeRate,
          minRequiredLana,
          phiDonation,
          totalTransferred,
          remainingBalance,
          nostrHexId
        }
      });
    } catch (error) {
      console.error("Error creating plan:", error);
      toast.error("Failed to create plan");
    }
  };

  const allWalletsValid = wallets.every(w => w.isValid === true && w.address.trim() !== "");

  // Calculate PHI donation (12 in plan currency converted to LANA using monthly exchange rate)
  const phiDonation = exchangeRate > 0 ? 12 / exchangeRate : 0;
  
  // Calculate distribution: (Required Deposit - PHI Donation) / 8
  const totalFor8Wallets = minRequiredLana - phiDonation;
  const amountPerWallet = totalFor8Wallets / 8;
  const totalTransferred = minRequiredLana;
  const remainingBalance = sourceBalance - totalTransferred;
  
  const currencySymbol = getCurrencySymbol(planCurrency as 'EUR' | 'USD' | 'GBP');

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
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Wallet Address</p>
                <p className="font-mono text-sm break-all">{sourceWallet}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="font-semibold">{sourceBalance?.toFixed(2) || "0.00"} LANA</p>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-3">Transaction Breakdown</p>
                <div className="space-y-2 text-sm">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-muted-foreground">Required Deposit ({currencySymbol}):</span>
                    <span className="font-mono text-right">{minRequiredLana.toFixed(2)} LANA</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-muted-foreground">PHI Donation (Lana 8 Wonder):</span>
                    <span className="font-mono text-right">{phiDonation.toFixed(2)} LANA</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-muted-foreground">Total to 8 Wallets:</span>
                    <span className="font-mono text-right">{totalFor8Wallets.toFixed(2)} LANA</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-muted-foreground">Per Wallet (8 accounts):</span>
                    <span className="font-mono text-right">{amountPerWallet.toFixed(2)} LANA</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 pt-2 border-t font-semibold">
                    <span>Total to Transfer:</span>
                    <span className="font-mono text-right">{totalTransferred.toFixed(2)} LANA</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-muted-foreground">
                    <span>Remaining in Wallet:</span>
                    <span className="font-mono text-right">{remainingBalance.toFixed(2)} LANA</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle>Annuity Wallet Accounts (8 Required)</CardTitle>
                <CardDescription>
                  All wallets must be empty (balance = 0) or new/unregistered
                </CardDescription>
              </div>
              <Button 
                onClick={() => setShowGenerateDialog(true)}
                disabled={isGenerating}
                size="default"
                className="w-full sm:w-auto shrink-0"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="ml-2">Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span className="ml-2">Generate Wallets</span>
                  </>
                )}
              </Button>
            </div>
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
            onClick={handleCreatePlan}
            className={allWalletsValid ? "bg-primary hover:bg-primary/90" : ""}
          >
            Create Plan
          </Button>
        </div>

        <GenerateWalletsDialog
          open={showGenerateDialog}
          onOpenChange={setShowGenerateDialog}
          onConfirm={handleGenerateWallets}
        />
      </div>
    </div>
  );
};

export default AssignLana8Wonder;
