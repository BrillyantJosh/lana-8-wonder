import TradingPlanCalculator from "@/components/TradingPlanCalculator";
import lanaCoin from "@/assets/lana-coin.png";
import { Sparkles } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Hero Header */}
      <header className="relative overflow-hidden min-h-[600px] md:min-h-[700px] flex items-center">
        {/* Full-width background image */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-mystical opacity-40 z-10"></div>
          <img 
            src={lanaCoin} 
            alt="LANA Crypto Coin" 
            className="w-full h-full object-cover opacity-30"
          />
        </div>

        {/* Content overlay */}
        <div className="container mx-auto px-4 py-12 relative z-20">
          <div className="flex flex-col items-center text-center space-y-6">
            {/* Title and Description */}
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-700">
              <div className="flex items-center justify-center gap-3">
                <Sparkles className="w-8 h-8 text-primary animate-pulse drop-shadow-lg" />
                <h1 className="text-6xl md:text-8xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent drop-shadow-2xl">
                  Lana8Wonder
                </h1>
                <Sparkles className="w-8 h-8 text-accent animate-pulse drop-shadow-lg" />
              </div>
              
              <p className="text-2xl md:text-3xl font-semibold text-foreground max-w-4xl mx-auto drop-shadow-lg">
                Transform your €88 investment into extraordinary wealth with our 8-account trading strategy
              </p>
              
              <div className="flex flex-wrap justify-center gap-4 pt-8">
                <div className="bg-card/90 backdrop-blur-md px-6 py-3 rounded-full border border-primary/30 shadow-mystical">
                  <p className="text-sm font-medium text-muted-foreground">Linear Growth</p>
                  <p className="text-lg font-bold text-primary">Accounts 1-2</p>
                </div>
                <div className="bg-card/90 backdrop-blur-md px-6 py-3 rounded-full border border-accent/30 shadow-mystical">
                  <p className="text-sm font-medium text-muted-foreground">Compound Returns</p>
                  <p className="text-lg font-bold text-accent">Accounts 3-5</p>
                </div>
                <div className="bg-card/90 backdrop-blur-md px-6 py-3 rounded-full border border-secondary/30 shadow-mystical">
                  <p className="text-sm font-medium text-muted-foreground">Passive Income</p>
                  <p className="text-lg font-bold text-secondary">Accounts 6-8</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-20"></div>
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
