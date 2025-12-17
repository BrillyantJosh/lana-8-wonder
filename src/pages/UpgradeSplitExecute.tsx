import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogOut, TrendingUp, Wallet, ChevronDown, ChevronUp, Coins, Loader2, ArrowRight, Send, QrCode, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { getCurrencySymbol } from "@/lib/utils";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { supabase } from "@/integrations/supabase/client";
import { fetchKind88888, Lana8WonderPlan } from "@/lib/nostrClient";
import { toast } from "sonner";
import { Html5Qrcode } from "html5-qrcode";
import { verifyWifMatchesWallet } from "@/lib/wifValidation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TradingLevel {
  level: number;
  triggerPrice: string;
  splitNumber: number;
  splitPrice: string;
  lanasOnSale: number;
  cashOut: string;
  remaining: number;
}

interface Account {
  number: number;
  name: string;
  type: "linear" | "compound" | "passive";
  color: string;
  description: string;
  levels: TradingLevel[];
  totalCashOut: number;
  portfolioValue?: number;
}

interface SplitSelection {
  splitNumber: number;
  price: number;
}

// NOTE: getAccountConfigs, calculateSplit, and level generation functions removed
// Accounts now come directly from sessionStorage (calculated on confirm page)

function formatNumber(value: number): string {
  if (value >= 100) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else if (value >= 10) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } else {
    return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  }
}

const UpgradeSplitExecute = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [splitSelection, setSplitSelection] = useState<SplitSelection | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [existingPlan, setExistingPlan] = useState<Lana8WonderPlan | null>(null);
  const [planWalletBalances, setPlanWalletBalances] = useState<Record<string, number>>({});
  const [planBalancesLoading, setPlanBalancesLoading] = useState(false);
  const [donationWalletId, setDonationWalletId] = useState<string | null>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyValidationStatus, setKeyValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; txid?: string; error?: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { params } = useNostrLanaParams();

  const selectedCurrency: 'EUR' | 'USD' | 'GBP' = 'EUR';
  const currencySymbol = getCurrencySymbol(selectedCurrency);

  // Get current system split from Nostr params
  const currentSystemSplit = parseInt(params?.split || "5");

  useEffect(() => {
    const sessionData = sessionStorage.getItem("lana_session");
    if (!sessionData) {
      navigate("/login");
      return;
    }
    const parsedSession = JSON.parse(sessionData);
    setSession(parsedSession);

    const selectionData = sessionStorage.getItem("upgrade_split_selection");
    if (!selectionData) {
      navigate("/upgrade-split");
      return;
    }
    setSplitSelection(JSON.parse(selectionData));
  }, [navigate]);

  // Fetch donation wallet from app_settings
  useEffect(() => {
    const fetchDonationWallet = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'donation_wallet_id')
          .single();

        if (error) throw error;
        if (data) {
          setDonationWalletId(data.setting_value);
        }
      } catch (error) {
        console.error("Error fetching donation wallet:", error);
      }
    };

    fetchDonationWallet();
  }, []);

  // Fetch existing plan and its wallet balances
  useEffect(() => {
    const loadExistingPlanAndBalances = async () => {
      if (!session?.nostrHexId || !params?.relays || params.relays.length === 0) return;
      
      try {
        const plan = await fetchKind88888(session.nostrHexId, params.relays);
        
        if (plan) {
          setExistingPlan(plan);
          
          if (params?.electrum && params.electrum.length > 0) {
            setPlanBalancesLoading(true);
            
            const walletAddresses = plan.accounts.map(acc => acc.wallet);
            
            const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
              body: { 
                wallet_addresses: walletAddresses,
                electrum_servers: params.electrum
              },
            });

            if (error) throw error;

            if (data?.success && data?.wallets) {
              const balances: Record<string, number> = {};
              data.wallets.forEach((w: { wallet_id: string; balance: number }) => {
                balances[w.wallet_id] = w.balance || 0;
              });
              setPlanWalletBalances(balances);
            }
          }
        }
      } catch (error) {
        console.error("Error loading existing plan:", error);
        toast.error("Failed to load existing plan wallets");
      } finally {
        setPlanBalancesLoading(false);
      }
    };

    if (session && params?.relays) {
      loadExistingPlanAndBalances();
    }
  }, [session, params]);

  // Load accounts from sessionStorage (same data as confirm page)
  useEffect(() => {
    const storedAccounts = sessionStorage.getItem("upgrade_accounts");
    if (storedAccounts) {
      setAccounts(JSON.parse(storedAccounts));
    } else {
      // If no stored accounts, go back to confirm page
      navigate("/upgrade-split-confirm");
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("lana_session");
    sessionStorage.removeItem("upgrade_split_selection");
    navigate("/login");
  };

  const toggleAccount = (accountNumber: number) => {
    setExpandedAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountNumber)) {
        newSet.delete(accountNumber);
      } else {
        newSet.add(accountNumber);
      }
      return newSet;
    });
  };

  // Private key QR scanning
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
          if (backCamera) {
            selectedCamera = backCamera;
          }
        }

        const scanner = new Html5Qrcode("qr-reader-execute");
        scannerRef.current = scanner;

        await scanner.start(
          selectedCamera.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setPrivateKey(decodedText);
            stopScanning();
            toast.success("QR code scanned successfully!");
            validatePrivateKey(decodedText);
          },
          () => {}
        );
      } catch (error: any) {
        console.error("Error starting QR scanner:", error);
        setIsScanning(false);
        
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          toast.error("Camera permission denied");
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

  // Validate private key matches source wallet
  const validatePrivateKey = async (key: string) => {
    if (!key.trim() || !session?.walletId) return;
    
    setIsValidatingKey(true);
    setKeyValidationStatus('idle');
    
    try {
      const result = await verifyWifMatchesWallet(key, session.walletId);
      
      if (result.matches) {
        setKeyValidationStatus('valid');
        toast.success("Private key verified!");
      } else {
        setKeyValidationStatus('invalid');
        toast.error("Private key doesn't match source wallet");
      }
    } catch (error) {
      setKeyValidationStatus('invalid');
      toast.error("Invalid private key format");
    } finally {
      setIsValidatingKey(false);
    }
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // Get stored expired LANA info from confirm page (don't recalculate!)
  const storedExpiredLanaInfo = useMemo(() => {
    const stored = sessionStorage.getItem("upgrade_expired_lana");
    if (stored) {
      return JSON.parse(stored);
    }
    return { totalExpiredLana: 0, expiredSplits: [], expiredPerAccount: {} };
  }, []);

  // Use the per-account expired LANA values from confirm page
  const expiredLanaPerAccount: Record<number, number> = storedExpiredLanaInfo.expiredPerAccount || {};

  // Calculate what needs to be added to each wallet
  const walletDistribution = useMemo(() => {
    if (!existingPlan || !splitSelection || accounts.length === 0) return [];

    const totalLanas = 88 / splitSelection.price;
    const lanasPerAccount = totalLanas / 8;

    return existingPlan.accounts.map((planAccount, index) => {
      const accountNumber = index + 1;
      const currentBalance = planWalletBalances[planAccount.wallet] || 0;
      const expiredForThisAccount = expiredLanaPerAccount[accountNumber] || 0;
      // Required balance is the initial allocation minus what's already been "sold" in expired splits
      const requiredBalance = lanasPerAccount - expiredForThisAccount;
      const toAdd = Math.max(0, requiredBalance - currentBalance);

      return {
        accountId: planAccount.account_id,
        wallet: planAccount.wallet,
        currentBalance,
        requiredBalance,
        toAdd
      };
    });
  }, [existingPlan, splitSelection, planWalletBalances, accounts, expiredLanaPerAccount]);

  // Calculate total amount to transfer
  const totalToTransfer = useMemo(() => {
    const walletAmount = walletDistribution.reduce((sum, w) => sum + w.toAdd, 0);
    const feeAmount = storedExpiredLanaInfo?.totalExpiredLana || 0;
    return walletAmount + feeAmount;
  }, [walletDistribution, storedExpiredLanaInfo]);

  // Execute upgrade: send LANA and publish new KIND 88888
  const handleExecuteUpgrade = async () => {
    if (!session?.walletId || !existingPlan || !params?.relays || !params?.electrum) {
      toast.error("Missing required data for transaction");
      return;
    }

    setIsExecuting(true);
    setShowConfirmDialog(false);
    setExecutionResult(null);

    try {
      // Build recipients list (8 wallets + fee wallet)
      const recipients: Array<{ address: string; amount: number }> = [];
      
      // Add wallet distribution outputs
      for (const wallet of walletDistribution) {
        if (wallet.toAdd > 0) {
          recipients.push({
            address: wallet.wallet,
            amount: wallet.toAdd
          });
        }
      }
      
      // Add fee output to donation wallet
      const feeAmount = storedExpiredLanaInfo?.totalExpiredLana || 0;
      if (feeAmount > 0 && donationWalletId) {
        recipients.push({
          address: donationWalletId,
          amount: feeAmount
        });
      }

      console.log("📤 Sending LANA transaction with recipients:", recipients);
      console.log("📤 Total recipients:", recipients.length);
      console.log("📤 Total LANA:", recipients.reduce((sum, r) => sum + r.amount, 0));

      // Step 1: Send LANA transaction
      const { data: txData, error: txError } = await supabase.functions.invoke('send-lana-multi-output', {
        body: {
          sender_address: session.walletId,
          recipients: recipients,
          private_key: privateKey,
          electrum_servers: params.electrum.map(e => ({ host: e.host, port: parseInt(e.port) }))
        }
      });

      if (txError) {
        throw new Error(`Transaction error: ${txError.message}`);
      }

      if (!txData?.success || !txData?.txid) {
        throw new Error(txData?.error || "Transaction failed - no txid returned");
      }

      console.log("✅ Transaction successful:", txData.txid);
      toast.success(`Transaction sent: ${txData.txid.substring(0, 16)}...`);

      // Step 2: Publish new KIND 88888 to Nostr
      console.log("📤 Publishing new KIND 88888 to Nostr...");
      
      // Get wallets from existing plan
      const planWallets = existingPlan.accounts.map(acc => acc.wallet);
      
      // ✅ VALIDATION: Ensure exactly 8 non-empty wallet addresses
      if (!planWallets || planWallets.length !== 8) {
        throw new Error(`Cannot publish: invalid plan with ${planWallets.length} wallets`);
      }
      
      const emptyWallets = planWallets.filter((w: string) => !w || w.trim() === '');
      if (emptyWallets.length > 0) {
        throw new Error(`Cannot publish: ${emptyWallets.length} wallet addresses are empty`);
      }
      
      console.log('✅ Validated 8 wallet addresses before publish');
      
      const { data: planData, error: planError } = await supabase.functions.invoke('publish-lana8wonder-plan', {
        body: {
          subject_hex: session.nostrHexId,
          wallets: planWallets,
          amount_per_wallet: (88 / splitSelection.price) / 8,
          currency: selectedCurrency,
          exchange_rate: splitSelection.price,
          start_price: splitSelection.price * 1.08, // +8% adjustment as per existing logic
          relays: params.relays
        }
      });

      if (planError) {
        console.error("⚠️ Plan publishing error:", planError);
        toast.warning("Transaction sent but plan publishing failed. Please try publishing manually.");
      } else if (planData?.success && planData?.publish_results) {
        const publishResults = planData.publish_results;
        const successCount = publishResults.filter((r: { success: boolean }) => r.success).length;
        const totalRelays = publishResults.length;
        
        console.log("📊 KIND 88888 publish results:", {
          event_id: planData.event_id,
          successCount,
          totalRelays,
          details: publishResults
        });
        
        if (successCount === 0) {
          // This shouldn't happen as backend throws, but just in case
          toast.error("Failed to publish plan to any relay. Please try again.");
        } else if (successCount < totalRelays) {
          // Partial success - warn user
          toast.warning(
            `Plan published to ${successCount}/${totalRelays} relays. Some relays did not accept the event.`,
            { duration: 6000 }
          );
        } else {
          // Full success
          toast.success(
            `Annuity plan published to all ${totalRelays} relays!`,
            { duration: 5000 }
          );
        }
      } else if (planData && !planData.success) {
        console.error("⚠️ Plan publishing returned failure:", planData);
        toast.warning("Transaction sent but plan publishing failed. Check relay connectivity.");
      }

      setExecutionResult({
        success: true,
        txid: txData.txid
      });

      // Clear session data
      sessionStorage.removeItem("upgrade_split_selection");
      sessionStorage.removeItem("upgrade_expired_lana");
      sessionStorage.removeItem("upgrade_accounts");

    } catch (error) {
      console.error("❌ Execution error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(errorMessage);
      setExecutionResult({
        success: false,
        error: errorMessage
      });
    } finally {
      setIsExecuting(false);
    }
  };

  if (!session || !splitSelection) return null;

  const totalLanas = 88 / splitSelection.price;
  // Use the fee from the confirm page (stored in sessionStorage)
  const fee = storedExpiredLanaInfo?.totalExpiredLana || 0;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/upgrade-split-confirm")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Confirmation
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <div className="space-y-8">
          {/* BOX 1: Wallet Distribution */}
          <Card className="border-secondary/30 bg-gradient-to-r from-secondary/5 to-secondary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-secondary" />
                Your Current Lana8Wonder Wallets
              </CardTitle>
              <CardDescription>
                Distribution of LANA to each account according to the new annuity plan
              </CardDescription>
            </CardHeader>
            <CardContent>
              {planBalancesLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span>Loading wallet balances...</span>
                </div>
              ) : existingPlan ? (
                <div className="space-y-3">
                  {walletDistribution.map((wallet) => (
                    <div 
                      key={wallet.accountId} 
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-background/50 rounded-lg border border-border/50 gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-bold">
                          {wallet.accountId}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">Account {wallet.accountId}</p>
                          <p className="font-mono text-xs text-muted-foreground break-all">{wallet.wallet}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:text-right pl-13 sm:pl-0">
                        <div>
                          <p className="text-xs text-muted-foreground">Current</p>
                          <p className="font-medium text-foreground">
                            {formatNumber(wallet.currentBalance)} LANA
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Required</p>
                          <p className="font-medium text-foreground">
                            {formatNumber(wallet.requiredBalance)} LANA
                          </p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-sm font-bold ${wallet.toAdd > 0 ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                          {wallet.toAdd > 0 ? `+${formatNumber(wallet.toAdd)}` : '✓'}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Fee Distribution */}
                  {fee > 0 && donationWalletId && (
                    <div className="mt-6 pt-4 border-t border-amber-500/30">
                      <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
                        <div className="flex items-center gap-2 mb-3">
                          <Send className="h-4 w-4 text-amber-500" />
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            Fee (Expired Splits) Payment
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount:</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {formatNumber(fee)} LANA
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                            <span className="text-muted-foreground">To Donation Wallet:</span>
                            <span className="font-mono text-xs text-foreground break-all">
                              {donationWalletId}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No existing plan found
                </div>
              )}
            </CardContent>
          </Card>

          {/* BOX 2: New Annuity Plan */}
          <Card className="p-8 shadow-mystical bg-card border-border">
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <Coins className="w-6 h-6 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">New Annuity Plan - Split {splitSelection.splitNumber}</h2>
              </div>
              <p className="text-muted-foreground">
                Your personalized 8-account trading strategy at Split {splitSelection.splitNumber} price of {splitSelection.price.toFixed(4)} {currencySymbol}/LANA.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Selected Split</p>
                  <p className="text-3xl font-bold text-primary">Split {splitSelection.splitNumber}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Total Lanas</p>
                  <p className="text-3xl font-bold text-foreground">{formatNumber(totalLanas)}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Trading Accounts */}
          {accounts.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Wallet className="w-6 h-6 text-primary" />
                Your 8 Lana Wonder Accounts at Split {splitSelection.splitNumber}
              </h3>
              
              {accounts.map(account => (
                <Card key={account.number} className="overflow-hidden shadow-card hover:shadow-mystical transition-all duration-300">
                  <div className={`bg-gradient-to-r ${account.color} p-6 cursor-pointer`} onClick={() => toggleAccount(account.number)}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold text-white">
                            Account {account.number}
                          </span>
                          <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-white uppercase">
                            {account.type}
                          </span>
                        </div>
                        <h4 className="text-2xl font-bold text-white mb-1">{account.name}</h4>
                        {account.description && <p className="text-white/90 text-sm">{account.description}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-white/80 mb-1">
                          {account.type === "passive" ? "Portfolio Value" : "Total Cash Out"}
                        </p>
                        <p className="text-2xl font-bold text-white">
                          {currencySymbol}{formatNumber(account.type === "passive" && account.portfolioValue ? account.portfolioValue : account.totalCashOut)}
                        </p>
                        <div className="mt-2">
                          {expandedAccounts.has(account.number) ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {expandedAccounts.has(account.number) && (
                    <div className="p-6 bg-card">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-3 px-4 font-semibold text-foreground">Level</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">Trigger Price</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">Split</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">LANA on Sale</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">Cash Out</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">Remaining</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(account.number >= 6 && account.number <= 8 ? account.levels : account.levels.slice(0, 10)).map((level, index, array) => {
                              const isNewSplitGroup = account.number < 6 && index > 0 && level.splitNumber !== array[index - 1].splitNumber;
                              const splitGroupClass = account.number < 6 && isNewSplitGroup ? 'border-t-2 border-primary/40' : '';
                              const isExpiredSplit = level.splitNumber <= currentSystemSplit;
                              
                              return (
                                <tr 
                                  key={level.level} 
                                  className={`hover:bg-muted/50 transition-colors ${splitGroupClass} ${
                                    isExpiredSplit ? 'bg-amber-100/50 dark:bg-amber-900/20' : ''
                                  }`}
                                >
                                  <td className="py-3 px-4 font-medium text-foreground">
                                    {isExpiredSplit && (
                                      <span className="text-amber-600 dark:text-amber-400 mr-1">⚠️</span>
                                    )}
                                    {level.level}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                    {currencySymbol}{formatNumber(parseFloat(level.triggerPrice))}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}`}>
                                    Split {level.splitNumber}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                    {formatNumber(level.lanasOnSale)}
                                  </td>
                                  <td className={`text-right py-3 px-4 font-semibold ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                                    {currencySymbol}{formatNumber(parseFloat(level.cashOut))}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                    {formatNumber(level.remaining)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Total Amount & Source Wallet */}
          <Card className="border-green-500/30 bg-gradient-to-r from-green-500/5 to-green-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-green-500" />
                Transaction Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Totals */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-background/50 rounded-lg border border-border/50">
                  <p className="text-sm text-muted-foreground mb-1">Total LANA to Transfer</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatNumber(walletDistribution.reduce((sum, w) => sum + w.toAdd, 0) + fee)} LANA
                  </p>
                </div>
                <div className="p-4 bg-background/50 rounded-lg border border-border/50">
                  <p className="text-sm text-muted-foreground mb-1">From Source Wallet</p>
                  <p className="font-mono text-xs text-foreground break-all">
                    {session?.walletId}
                  </p>
                </div>
              </div>

              {/* Private Key Input */}
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">Private Key (WIF)</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter the private key of your source wallet to authorize the transaction
                </p>
                
                <div className="space-y-3">
                  <Input
                    type="password"
                    placeholder="Enter WIF private key..."
                    value={privateKey}
                    onChange={(e) => {
                      setPrivateKey(e.target.value);
                      setKeyValidationStatus('idle');
                    }}
                    onBlur={() => privateKey && validatePrivateKey(privateKey)}
                    disabled={isScanning}
                    className={`font-mono text-sm ${
                      keyValidationStatus === 'valid' ? 'border-green-500 focus-visible:ring-green-500' :
                      keyValidationStatus === 'invalid' ? 'border-red-500 focus-visible:ring-red-500' : ''
                    }`}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                  
                  {keyValidationStatus === 'valid' && (
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      ✓ Private key verified - matches source wallet
                    </p>
                  )}
                  {keyValidationStatus === 'invalid' && (
                    <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      ✗ Private key doesn't match source wallet
                    </p>
                  )}

                  {!isScanning ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={startScanning}
                    >
                      <QrCode className="mr-2 h-4 w-4" />
                      Scan QR Code
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div
                        id="qr-reader-execute"
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
                </div>
              </div>

              {/* Execution Result */}
              {executionResult && (
                <div className={`p-4 rounded-lg border ${
                  executionResult.success 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : 'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {executionResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className={`font-semibold ${
                      executionResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {executionResult.success ? 'Upgrade Completed Successfully!' : 'Upgrade Failed'}
                    </span>
                  </div>
                  {executionResult.success && executionResult.txid && (
                    <div className="space-y-2 text-sm">
                      <p className="text-muted-foreground">Transaction ID:</p>
                      <p className="font-mono text-xs break-all text-foreground">{executionResult.txid}</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => navigate("/dashboard")}
                      >
                        Go to Dashboard
                      </Button>
                    </div>
                  )}
                  {!executionResult.success && executionResult.error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{executionResult.error}</p>
                  )}
                </div>
              )}

              {/* Execute Button */}
              <div className="pt-4">
                <Button 
                  size="lg"
                  className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-lg py-6"
                  disabled={keyValidationStatus !== 'valid' || isValidatingKey || isExecuting || executionResult?.success}
                  onClick={() => setShowConfirmDialog(true)}
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Executing Transaction...
                    </>
                  ) : isValidatingKey ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Validating...
                    </>
                  ) : executionResult?.success ? (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Upgrade Complete
                    </>
                  ) : (
                    <>
                      <TrendingUp className="mr-2 h-5 w-5" />
                      Execute Upgrade
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Upgrade Execution</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>You are about to execute the following transaction:</p>
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total LANA:</span>
                  <span className="font-bold text-foreground">{formatNumber(totalToTransfer)} LANA</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Outputs:</span>
                  <span className="font-medium text-foreground">
                    {walletDistribution.filter(w => w.toAdd > 0).length + (fee > 0 ? 1 : 0)} wallets
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">From:</span>
                  <span className="font-mono text-xs break-all text-foreground">{session?.walletId}</span>
                </div>
              </div>
              <p className="text-amber-600 dark:text-amber-400 font-medium">
                This action cannot be undone. The transaction will be broadcast to the LANA network.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleExecuteUpgrade}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirm & Execute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UpgradeSplitExecute;
