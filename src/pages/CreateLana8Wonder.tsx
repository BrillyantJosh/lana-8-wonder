import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Plus } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";

const CreateLana8Wonder = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);

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

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Create Lana8Wonder Plan</h1>
            <p className="text-muted-foreground">Set up your annuity structure</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <div className="grid gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Wallet ID</p>
                <p className="font-mono text-sm break-all">{session.walletId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nostr HEX ID</p>
                <p className="font-mono text-sm break-all">{session.nostrHexId}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>No Annuity Plan Found</CardTitle>
              <CardDescription>
                You don't have an existing Lana8Wonder annuity plan. Create one to start managing your LANA tokens across 8 accounts with multiple price levels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Plan Structure:</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• 8 accounts with dedicated wallets</li>
                    <li>• Accounts 1-5: 10 levels each</li>
                    <li>• Accounts 6-8: minimum 8 levels each</li>
                    <li>• Total: minimum 74 annuity levels</li>
                    <li>• EUR/LANA price triggers for automatic releases</li>
                  </ul>
                </div>

                <Button className="w-full" size="lg">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Annuity Plan (Coming Soon)
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Plan creation interface will be available soon
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CreateLana8Wonder;
