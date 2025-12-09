import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, TrendingUp, Check } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { toast } from "sonner";

interface SplitOption {
  number: number;
  price: number;
}

const UpgradeSplit = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [selectedSplit, setSelectedSplit] = useState<number | null>(null);
  const { params, loading: paramsLoading } = useNostrLanaParams();

  useEffect(() => {
    const sessionData = sessionStorage.getItem("lana_session");
    if (!sessionData) {
      navigate("/login");
      return;
    }
    setSession(JSON.parse(sessionData));
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("lana_session");
    navigate("/login");
  };

  // Calculate split price: Split N = 0.001 * 2^(N-1)
  const calculateSplitPrice = (splitNumber: number): number => {
    return 0.001 * Math.pow(2, splitNumber - 1);
  };

  // Generate list of splits from current down to 1
  const generateSplitOptions = (): SplitOption[] => {
    const currentSplit = parseInt(params?.split || "5");
    const splits: SplitOption[] = [];
    
    for (let i = currentSplit; i >= 1; i--) {
      splits.push({
        number: i,
        price: calculateSplitPrice(i)
      });
    }
    
    return splits;
  };

  const handleSelectSplit = (split: SplitOption) => {
    setSelectedSplit(split.number);
  };

  const handleContinue = () => {
    if (selectedSplit === null) {
      toast.error("Please select a split");
      return;
    }

    const selectedOption = splitOptions.find(s => s.number === selectedSplit);
    if (!selectedOption) return;

    // Store selected split info in session for next step
    sessionStorage.setItem("upgrade_split_selection", JSON.stringify({
      splitNumber: selectedSplit,
      price: selectedOption.price
    }));

    // Navigate to confirmation page
    navigate("/upgrade-split-confirm");
  };

  if (!session) return null;

  const currentSplit = parseInt(params?.split || "5");
  const splitOptions = generateSplitOptions();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Upgrade Your Split
            </CardTitle>
            <CardDescription>
              Current Split: <span className="font-bold text-foreground">{currentSplit}</span> 
              {" "}(Price: <span className="font-mono">{calculateSplitPrice(currentSplit).toFixed(4)}</span>)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Select the split you want to enter. Lower splits have lower entry prices.
            </p>

            {paramsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading split options...
              </div>
            ) : (
              <div className="space-y-3">
                {splitOptions.map((split) => {
                  const isCurrent = split.number === currentSplit;
                  const isSelected = selectedSplit === split.number;
                  
                  return (
                    <button
                      key={split.number}
                      onClick={() => !isCurrent && handleSelectSplit(split)}
                      disabled={isCurrent}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                        isCurrent 
                          ? "border-muted bg-muted/30 cursor-not-allowed opacity-60"
                          : isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50 hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                            isSelected 
                              ? "bg-primary text-primary-foreground" 
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {split.number}
                          </div>
                          <div>
                            <p className="font-semibold">
                              Split {split.number}
                              {isCurrent && (
                                <span className="ml-2 text-xs text-muted-foreground">(Current)</span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Entry price
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-mono text-lg font-bold">
                              {split.price.toFixed(4)}
                            </p>
                            <p className="text-xs text-muted-foreground">LANA/EUR</p>
                          </div>
                          {isSelected && (
                            <Check className="h-5 w-5 text-primary" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedSplit !== null && (
              <div className="mt-6 pt-4 border-t">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-muted-foreground">Selected Split:</span>
                  <span className="font-bold text-lg">Split {selectedSplit}</span>
                </div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-muted-foreground">Entry Price:</span>
                  <span className="font-mono font-bold text-lg">
                    {splitOptions.find(s => s.number === selectedSplit)?.price.toFixed(4)} LANA/EUR
                  </span>
                </div>
                <Button 
                  onClick={handleContinue} 
                  className="w-full"
                  size="lg"
                >
                  Continue to Next Step
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UpgradeSplit;
