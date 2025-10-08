import TradingPlanCalculator from "@/components/TradingPlanCalculator";
import lanaCoin from "@/assets/lana-coin.png";
import { Sparkles } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Hero Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-mystical opacity-20"></div>
        <div className="container mx-auto px-4 py-12 relative z-10">
          <div className="flex flex-col items-center text-center space-y-6">
            {/* LANA Coin Image */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-mystical blur-3xl opacity-30 group-hover:opacity-50 transition-opacity duration-500"></div>
              <img 
                src={lanaCoin} 
                alt="LANA Crypto Coin" 
                className="relative w-48 h-48 md:w-64 md:h-64 object-contain drop-shadow-2xl animate-in fade-in zoom-in duration-700"
              />
            </div>

            {/* Title and Description */}
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom duration-700 delay-150">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                  Lana8Wonder
                </h1>
                <Sparkles className="w-6 h-6 text-accent animate-pulse" />
              </div>
              
              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
                Transform your €88 investment into extraordinary wealth with our 8-account trading strategy
              </p>
              
              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <div className="bg-card/80 backdrop-blur-sm px-6 py-3 rounded-full border border-primary/20 shadow-card">
                  <p className="text-sm font-medium text-muted-foreground">Linear Growth</p>
                  <p className="text-lg font-bold text-primary">Accounts 1-2</p>
                </div>
                <div className="bg-card/80 backdrop-blur-sm px-6 py-3 rounded-full border border-accent/20 shadow-card">
                  <p className="text-sm font-medium text-muted-foreground">Compound Returns</p>
                  <p className="text-lg font-bold text-accent">Accounts 3-5</p>
                </div>
                <div className="bg-card/80 backdrop-blur-sm px-6 py-3 rounded-full border border-secondary/20 shadow-card">
                  <p className="text-sm font-medium text-muted-foreground">Passive Income</p>
                  <p className="text-lg font-bold text-secondary">Accounts 6-8</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent"></div>
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
