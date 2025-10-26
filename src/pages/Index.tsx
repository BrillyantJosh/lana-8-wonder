import TradingPlanCalculator from "@/components/TradingPlanCalculator";
import lanaCoin from "@/assets/lana-coin.png";
import einsteinImg from "@/assets/einstein.png";
import { Sparkles, Wifi, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import NostrStatusCard from "@/components/NostrStatusCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

const Index = () => {
  const { params, loading, error } = useNostrLanaParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Top Navigation Bar */}
      <nav className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Connection Status */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Connecting...</span>
                    </>
                  ) : error ? (
                    <>
                      <Wifi className="w-5 h-5 text-destructive" />
                      <Badge variant="destructive" className="text-xs">Disconnected</Badge>
                    </>
                  ) : params ? (
                    <>
                      <Wifi className="w-5 h-5 text-green-500" />
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
                        Connected
                      </Badge>
                    </>
                  ) : null}
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nostr Network Status</DialogTitle>
                </DialogHeader>
                {loading && (
                  <div className="flex items-center justify-center gap-3 py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-muted-foreground">Connecting to Nostr Network...</span>
                  </div>
                )}
                {error && (
                  <div className="p-6 bg-destructive/10 border border-destructive/30 rounded-lg">
                    <p className="text-sm text-destructive">Error: {error}</p>
                  </div>
                )}
                {params && <NostrStatusCard params={params} />}
              </DialogContent>
            </Dialog>
          </div>
          
          <Button variant="default" size="sm" asChild>
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </nav>

      {/* Hero Header */}
      <header className="relative overflow-hidden bg-gradient-hero">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col items-center text-center space-y-8">
            {/* LANA Coin Image - Full width */}
            <div className="w-full max-w-6xl">
              <img 
                src={lanaCoin} 
                alt="LANA Crypto Coin" 
                className="w-full h-auto object-contain drop-shadow-2xl animate-in fade-in zoom-in duration-700"
              />
            </div>

            {/* Title and Description */}
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-700">
              <div className="flex items-center justify-center gap-3">
                <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                <h1 className="text-6xl md:text-8xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                  Lana8Wonder
                </h1>
                <Sparkles className="w-8 h-8 text-accent animate-pulse" />
              </div>
              
              <p className="text-2xl md:text-3xl font-semibold text-foreground max-w-4xl mx-auto">
                Transform your €88 investment into extraordinary wealth with 8-account.
              </p>
              
              <div className="flex items-center justify-center gap-6 pt-8 max-w-4xl mx-auto">
                <div className="w-32 h-32 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
                  <img 
                    src={einsteinImg} 
                    alt="Albert Einstein" 
                    className="w-full h-full object-cover object-center"
                  />
                </div>
                <blockquote className="text-left">
                  <p className="text-lg md:text-xl font-medium text-foreground italic">
                    "Compound interest is the eighth wonder of the world. He who understands it, earns it… He who doesn't, pays it."
                  </p>
                  <cite className="block mt-3 text-sm text-muted-foreground not-italic">— Albert Einstein</cite>
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <TradingPlanCalculator />
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 mt-12 border-t border-border">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">
            © 2024 Lana8Wonder. Investment strategies calculated using proven mathematical formulas.
          </p>
          <p className="text-xs mt-2">
            Initial investment: €88 | 8 Accounts | Linear, Compound & Passive Strategies
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
