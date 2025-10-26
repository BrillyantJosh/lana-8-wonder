import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { fetchKind30889, type WalletListRecord } from "@/lib/nostrClient";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SendLana = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [walletRecords, setWalletRecords] = useState<WalletListRecord[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const { params } = useNostrLanaParams();

  // Get transfer params from URL
  const accountId = searchParams.get("accountId");
  const fromWallet = searchParams.get("wallet");
  const amount = searchParams.get("amount");

  useEffect(() => {
    const loadData = async () => {
      const sessionData = sessionStorage.getItem("lana_session");
      if (!sessionData) {
        navigate("/login");
        return;
      }

      const parsedSession: LanaSession = JSON.parse(sessionData);
      setSession(parsedSession);

      if (!params?.relays || params.relays.length === 0) {
        toast.error("No relays available");
        setWalletsLoading(false);
        return;
      }

      try {
        const records = await fetchKind30889(parsedSession.nostrHexId, params.relays);
        setWalletRecords(records);

        // Load balances for all wallets
        if (records.length > 0 && params?.electrum && params.electrum.length > 0) {
          const allWalletAddresses = records.flatMap(r => 
            r.wallets
              .filter(w => w.wallet_type !== "Lana8Wonder")
              .map(w => w.wallet_address)
          );
          loadWalletBalances(allWalletAddresses);
        }
      } catch (error) {
        console.error("Error loading wallets:", error);
        toast.error("Failed to load wallet list");
      } finally {
        setWalletsLoading(false);
      }
    };

    const loadWalletBalances = async (wallets: string[]) => {
      setBalancesLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
          body: { 
            wallet_addresses: wallets,
            electrum_servers: params?.electrum || []
          },
        });

        if (error) throw error;

        if (data?.success && data?.wallets) {
          const balances: Record<string, number> = {};
          data.wallets.forEach((w: any) => {
            balances[w.wallet_id] = w.balance || 0;
          });
          setWalletBalances(balances);
        }
      } catch (error) {
        console.error("Error loading wallet balances:", error);
        toast.error("Failed to load wallet balances");
      } finally {
        setBalancesLoading(false);
      }
    };

    if (params?.relays) {
      loadData();
    }
  }, [navigate, params]);

  const handleBack = () => {
    navigate("/dashboard");
  };

  const handleContinue = () => {
    if (!selectedDestination) {
      toast.error("Please select a destination wallet");
      return;
    }

    // Navigate to confirmation page with all params
    const confirmParams = new URLSearchParams({
      accountId: accountId || "",
      fromWallet: fromWallet || "",
      toWallet: selectedDestination,
      amount: amount || ""
    });
    navigate(`/send-lana-confirm?${confirmParams}`);
  };

  if (!session || !accountId || !fromWallet || !amount) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invalid Transfer Request</CardTitle>
            <CardDescription>Missing required transfer information</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBack}>Return to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get available wallets (excluding Lana8Wonder type)
  const availableWallets = walletRecords.flatMap(record => 
    record.wallets
      .filter(wallet => wallet.wallet_type !== "Lana8Wonder")
      .map(wallet => ({
        ...wallet,
        status: record.status,
        registrar: record.registrar_pubkey
      }))
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Destination Wallet for Withdrawal</CardTitle>
              <CardDescription>
                Choose where to send your LANA tokens
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg mb-6">
                <div>
                  <p className="text-sm text-muted-foreground">From Account:</p>
                  <p className="font-semibold">Account {accountId}</p>
                  <p className="text-xs font-mono break-all mt-1">{fromWallet}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount:</p>
                  <p className="text-2xl font-bold text-green-600">
                    {parseFloat(amount).toFixed(4)} LANA
                  </p>
                </div>
              </div>

              <div>
                <p className="font-semibold mb-4">Select Destination Wallet:</p>
                {walletsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : availableWallets.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No available destination wallets found</p>
                    <p className="text-sm mt-2">Contact your registrar to add wallets</p>
                  </div>
                ) : (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Wallet Address</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Balance (LANA)</TableHead>
                          <TableHead className="max-w-xs">Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availableWallets.map((wallet, idx) => (
                          <TableRow 
                            key={idx}
                            className={`cursor-pointer hover:bg-muted/50 ${selectedDestination === wallet.wallet_address ? 'bg-primary/10' : ''}`}
                            onClick={() => setSelectedDestination(wallet.wallet_address)}
                          >
                            <TableCell>
                              <input
                                type="radio"
                                checked={selectedDestination === wallet.wallet_address}
                                onChange={() => setSelectedDestination(wallet.wallet_address)}
                                className="cursor-pointer"
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{wallet.wallet_address}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {wallet.wallet_type}
                              </span>
                            </TableCell>
                            <TableCell>
                              {balancesLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : walletBalances[wallet.wallet_address] !== undefined ? (
                                <span className="font-semibold">
                                  {walletBalances[wallet.wallet_address].toFixed(8)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-xs">
                              <div className="truncate" title={wallet.note || "—"}>
                                {wallet.note || "—"}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <Button variant="outline" onClick={handleBack}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleContinue}
                  disabled={!selectedDestination || walletsLoading}
                  size="lg"
                >
                  Continue to Confirmation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SendLana;
