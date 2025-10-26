import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Home } from "lucide-react";

const SendLanaResult = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const success = searchParams.get("success") === "true";
  const txHash = searchParams.get("txHash");
  const amount = searchParams.get("amount");
  const error = searchParams.get("error");

  useEffect(() => {
    // If no params, redirect to dashboard
    if (!searchParams.has("success")) {
      navigate("/dashboard");
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {success ? (
              <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-12 h-12 text-red-600" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl">
            {success ? "Transaction Successful!" : "Transaction Failed"}
          </CardTitle>
          <CardDescription>
            {success 
              ? "Your LANA has been sent successfully"
              : "There was an error processing your transaction"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {success ? (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Amount Sent:</p>
                  <p className="text-2xl font-bold text-green-600">
                    {amount ? parseFloat(amount).toFixed(4) : "0.0000"} LANA
                  </p>
                </div>
                
                {txHash && (
                  <div className="border-t pt-3">
                    <p className="text-sm text-muted-foreground mb-1">Transaction ID:</p>
                    <p className="text-sm font-mono break-all bg-background p-2 rounded">
                      {txHash}
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  ℹ️ Your transaction has been broadcast to the LANA network. 
                  It may take a few minutes to be confirmed on the blockchain.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-red-500/20 rounded-lg p-4 bg-red-500/5">
                <p className="text-sm font-semibold text-red-600 mb-2">Error Details:</p>
                <p className="text-sm text-muted-foreground">
                  {error || "An unknown error occurred while processing your transaction."}
                </p>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  ⚠️ Your funds are safe. No transaction was completed. 
                  Please check your wallet balance and try again.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center pt-4 border-t">
            <Button onClick={() => navigate("/dashboard")} size="lg">
              <Home className="mr-2 h-4 w-4" />
              Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SendLanaResult;
