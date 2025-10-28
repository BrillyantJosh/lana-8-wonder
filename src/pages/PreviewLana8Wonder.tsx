import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { getCurrencySymbol } from "@/lib/utils";

const PreviewLana8Wonder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { params } = useNostrLanaParams();
  const [isPublishing, setIsPublishing] = useState(false);

  const {
    sourceWallet,
    sourceBalance,
    wallets,
    amountPerWallet,
    planCurrency,
    exchangeRate,
    minRequiredLana,
    phiDonation,
    totalTransferred,
    remainingBalance
  } = location.state || {};

  useEffect(() => {
    if (!sourceWallet || !wallets) {
      toast.error("Missing plan data");
      navigate("/assign-lana8wonder");
    }
  }, [sourceWallet, wallets, navigate]);

  const handlePublish = async () => {
    setIsPublishing(true);
    
    try {
      const sessionData = sessionStorage.getItem("nostrSession");
      if (!sessionData) {
        throw new Error("No session data found");
      }
      
      const session = JSON.parse(sessionData);
      const subjectHex = session.nostrHexId;
      
      const walletAddresses = wallets.map((w: any) => w.address);
      
      const relays = params?.relays || [
        'wss://relay.lanavault.space',
        'wss://relay.lanacoin-eternity.com'
      ];
      
      console.log('📝 Publishing Lana8Wonder plan...', {
        subject_hex: subjectHex,
        wallets: walletAddresses.length,
        currency: planCurrency,
        exchange_rate: exchangeRate
      });
      
      const { data, error } = await supabase.functions.invoke('publish-lana8wonder-plan', {
        body: {
          subject_hex: subjectHex,
          wallets: walletAddresses,
          amount_per_wallet: amountPerWallet,
          currency: planCurrency,
          exchange_rate: exchangeRate,
          start_price: 0.075,
          relays
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        const successCount = data.publish_results.filter((r: any) => r.success).length;
        toast.success(
          `✅ Plan published to ${successCount}/${data.publish_results.length} relays`,
          { duration: 5000 }
        );
        
        console.log('✅ Plan published:', {
          event_id: data.event_id,
          accounts: data.plan.accounts,
          total_levels: data.plan.total_levels,
          publish_results: data.publish_results
        });
        
        setTimeout(() => {
          navigate("/dashboard");
        }, 2000);
      } else {
        throw new Error('Failed to publish plan');
      }
      
    } catch (error) {
      console.error('❌ Error publishing plan:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish plan');
    } finally {
      setIsPublishing(false);
    }
  };

  const currencySymbol = getCurrencySymbol(planCurrency as 'EUR' | 'USD' | 'GBP');

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/assign-lana8wonder")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Review Lana 8 Wonder Plan</h2>
          <p className="text-muted-foreground">
            Review the plan details before publishing to Nostr
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Source Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Wallet Address</p>
                <p className="font-mono text-sm break-all">{sourceWallet}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="font-semibold">{sourceBalance?.toFixed(8) || "0.00000000"} LANA</p>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-3">Transaction Breakdown</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Required Deposit ({currencySymbol}):</span>
                    <span className="font-mono">{minRequiredLana?.toFixed(8)} LANA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PHI Donation (Lana 8 Wonder):</span>
                    <span className="font-mono">{phiDonation?.toFixed(8)} LANA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total to 8 Wallets:</span>
                    <span className="font-mono">{(minRequiredLana - phiDonation)?.toFixed(8)} LANA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per Wallet (8 accounts):</span>
                    <span className="font-mono">{amountPerWallet?.toFixed(8)} LANA</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t font-semibold">
                    <span>Total to Transfer:</span>
                    <span className="font-mono">{totalTransferred?.toFixed(8)} LANA</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Remaining in Wallet:</span>
                    <span className="font-mono">{remainingBalance?.toFixed(8)} LANA</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Annuity Wallet Accounts</CardTitle>
            <CardDescription>
              8 empty wallets that will receive the annuity payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {wallets?.map((wallet: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">Wallet {index + 1}</span>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <Badge variant="default" className="bg-green-600">Valid</Badge>
                    </div>
                    <p className="font-mono text-xs break-all text-muted-foreground">
                      {wallet.address}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold">{amountPerWallet?.toFixed(8)} LANA</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6 border-primary">
          <CardHeader>
            <CardTitle>Plan Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currency:</span>
                <span className="font-semibold">{planCurrency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exchange Rate:</span>
                <span className="font-mono">{exchangeRate?.toFixed(8)} LANA/{currencySymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Price:</span>
                <span className="font-mono">0.075 {currencySymbol}/LANA</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Total Accounts:</span>
                <span className="font-semibold">8</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distribution per Account:</span>
                <span className="font-mono">{amountPerWallet?.toFixed(8)} LANA</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate("/assign-lana8wonder")}>
            Cancel
          </Button>
          <Button
            disabled={isPublishing}
            onClick={handlePublish}
            className="bg-primary hover:bg-primary/90"
          >
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing to Nostr...
              </>
            ) : (
              "Publish Plan"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PreviewLana8Wonder;
