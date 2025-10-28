import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Wallet, Send, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface LocationState {
  sourceWallet: string;
  sourceBalance: string;
  wallets: any[];
  donationWalletId: string;
  totalAmount: number;
  nostrHexId: string;
}

const SendLana8WonderTransfer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [privateKey, setPrivateKey] = useState("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!state) {
    navigate('/preview-lana8wonder');
    return null;
  }

  const { sourceWallet, sourceBalance, wallets, donationWalletId, totalAmount, nostrHexId } = state;

  // Calculate amounts
  const walletsWithAmounts = wallets.map((wallet: any) => ({
    address: wallet.address,
    amount: parseFloat(wallet.amount),
    label: wallet.label
  }));

  const donationAmount = parseFloat((totalAmount * 0.01).toFixed(8)); // 1% donation
  const totalWithDonation = totalAmount + donationAmount;

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(num);
  };

  const handleTransfer = async () => {
    if (!privateKey.trim()) {
      toast.error("Please enter your private key");
      return;
    }

    setIsProcessing(true);

    try {
      // Prepare recipients: 8 wallets + donation wallet
      const recipients = [
        ...walletsWithAmounts.map(w => ({
          address: w.address,
          amount: w.amount
        })),
        {
          address: donationWalletId,
          amount: donationAmount
        }
      ];

      // Call the send-lana-transaction edge function
      const { data, error } = await supabase.functions.invoke('send-lana-transaction', {
        body: {
          sender_address: sourceWallet,
          recipients: recipients,
          private_key: privateKey.trim(),
          electrum_servers: [
            { host: "electrum1.lanacoin.com", port: 5097 },
            { host: "electrum2.lanacoin.com", port: 5097 }
          ]
        }
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Transaction failed');
      }

      // Update profile with TX hash
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ tx: data.txid })
        .eq('nostr_hex_id', nostrHexId);

      if (updateError) {
        console.error('Error updating profile with TX:', updateError);
      }

      toast.success("Transfer successful!");
      
      // Navigate back to preview
      navigate('/preview-lana8wonder', {
        state: { nostrHexId }
      });

    } catch (error: any) {
      console.error('Transfer error:', error);
      toast.error(error.message || "Transfer failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 p-4">
      <div className="max-w-4xl mx-auto space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Transfer Confirmation</h1>
            <p className="text-muted-foreground">Review and confirm your Lana8Wonder transfer</p>
          </div>
        </div>

        {/* Source Wallet */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Source Wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-accent/50 rounded">
              <span className="text-sm font-medium">Wallet Address:</span>
              <code className="text-xs bg-background px-2 py-1 rounded">
                {sourceWallet}
              </code>
            </div>
            <div className="flex justify-between items-center p-3 bg-accent/50 rounded">
              <span className="text-sm font-medium">Current Balance:</span>
              <span className="font-bold">{formatNumber(parseFloat(sourceBalance))} LANA</span>
            </div>
          </CardContent>
        </Card>

        {/* Recipients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Recipients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 8 Wallets */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Lana8Wonder Wallets</h3>
              {walletsWithAmounts.map((wallet, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-accent/30 rounded">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{wallet.label}</span>
                    <code className="text-xs text-muted-foreground">{wallet.address}</code>
                  </div>
                  <span className="font-bold text-primary">
                    {formatNumber(wallet.amount)} LANA
                  </span>
                </div>
              ))}
            </div>

            {/* Donation */}
            <div className="pt-3 border-t">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Donation (1%)</h3>
              <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-950 rounded">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-green-800 dark:text-green-200">Donation Wallet</span>
                  <code className="text-xs text-green-700 dark:text-green-300">{donationWalletId}</code>
                </div>
                <span className="font-bold text-green-600 dark:text-green-400">
                  {formatNumber(donationAmount)} LANA
                </span>
              </div>
            </div>

            {/* Total */}
            <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
              <span className="text-lg font-bold">Total Amount:</span>
              <span className="text-2xl font-bold text-primary">
                {formatNumber(totalWithDonation)} LANA
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Private Key Input */}
        <Card>
          <CardHeader>
            <CardTitle>Authorization Required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Enter the private key for wallet: <code className="font-mono text-xs bg-background px-1 py-0.5 rounded">{sourceWallet}</code>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="privateKey">Private Key (WIF Format)</Label>
              <div className="relative">
                <Input
                  id="privateKey"
                  type={showPrivateKey ? "text" : "password"}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="Enter your private key..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your private key is used locally to sign the transaction and is never stored.
              </p>
            </div>

            <Button
              onClick={handleTransfer}
              disabled={isProcessing || !privateKey.trim()}
              className="w-full"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing Transfer...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Confirm and Transfer
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SendLana8WonderTransfer;
