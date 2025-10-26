import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { Lana8WonderPlan } from "@/lib/nostrClient";

const Dashboard = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [plan, setPlan] = useState<Lana8WonderPlan | null>(null);

  useEffect(() => {
    const sessionData = sessionStorage.getItem("lana_session");
    if (!sessionData) {
      navigate("/login");
      return;
    }

    const parsedSession: LanaSession = JSON.parse(sessionData);
    setSession(parsedSession);

    // TODO: Load plan from relay
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("lana_session");
    navigate("/login");
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Lana8Wonder Dashboard</h1>
            <p className="text-muted-foreground">Your Annuity Plan</p>
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
              <div>
                <p className="text-sm text-muted-foreground">Nostr npub</p>
                <p className="font-mono text-sm break-all">{session.nostrNpubId}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Annuity Plan (Coming Soon)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Your annuity plan tables will be displayed here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
