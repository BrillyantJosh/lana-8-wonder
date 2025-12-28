import TradingPlanCalculator from "@/components/TradingPlanCalculator";
import { AvailableSlotsCard } from "@/components/AvailableSlotsCard";
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
import { getCurrencySymbol } from "@/lib/utils";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTranslation } from "react-i18next";

const Index = () => {
  const { t } = useTranslation();
  const { params, loading, error } = useNostrLanaParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Get currency symbol from session if user is logged in
  const sessionData = typeof window !== 'undefined' ? sessionStorage.getItem("lana_session") : null;
  const sessionCurrency = sessionData ? JSON.parse(sessionData).currency : 'EUR';
  const currencySymbol = getCurrencySymbol(sessionCurrency || 'EUR');

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Top Navigation Bar */}
      <nav className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Connection Status */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-1 sm:gap-2 hover:opacity-80 transition-opacity min-w-0">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-muted-foreground flex-shrink-0" />
                      <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">{t('index.connecting')}</span>
                    </>
                  ) : error ? (
                    <>
                      <Wifi className="w-4 h-4 sm:w-5 sm:h-5 text-destructive flex-shrink-0" />
                      <Badge variant="destructive" className="text-xs">{t('index.disconnected')}</Badge>
                    </>
                  ) : params ? (
                    <>
                      <Wifi className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
                        {t('index.connected')}
                      </Badge>
                    </>
                  ) : null}
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-[90vw] sm:max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('index.nostrNetworkStatus')}</DialogTitle>
                </DialogHeader>
                {loading && (
                  <div className="flex items-center justify-center gap-3 py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">{t('index.connectingToNostr')}</span>
                  </div>
                )}
                {error && (
                  <div className="p-4 sm:p-6 bg-destructive/10 border border-destructive/30 rounded-lg">
                    <p className="text-xs sm:text-sm text-destructive break-words">{error}</p>
                  </div>
                )}
                {params && <NostrStatusCard params={params} />}
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <LanguageSelector />
            <Button variant="default" size="sm" asChild className="text-xs sm:text-sm">
              <Link to="/login">{t('index.logIn')}</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Header */}
      <header className="relative overflow-hidden bg-gradient-hero">
        <div className="container mx-auto px-2 sm:px-4 py-6 sm:py-12">
          <div className="flex flex-col items-center text-center space-y-4 sm:space-y-8">
            {/* LANA Coin Image - Full width */}
            <div className="w-full max-w-6xl px-2">
              <img 
                src={lanaCoin} 
                alt="LANA Crypto Coin" 
                className="w-full h-auto object-contain drop-shadow-2xl animate-in fade-in zoom-in duration-700"
              />
            </div>

            {/* Title and Description */}
            <div className="space-y-3 sm:space-y-6 animate-in fade-in slide-in-from-bottom duration-700 px-2">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <Sparkles className="w-5 h-5 sm:w-8 sm:h-8 text-primary animate-pulse flex-shrink-0" />
                <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-8xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                  {t('index.title')}
                </h1>
                <Sparkles className="w-5 h-5 sm:w-8 sm:h-8 text-accent animate-pulse flex-shrink-0" />
              </div>
              
              <p className="text-base sm:text-xl md:text-2xl lg:text-3xl font-semibold text-foreground max-w-4xl mx-auto px-2">
                {t('index.tagline', { currency: currencySymbol })}
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 pt-4 sm:pt-8 max-w-4xl mx-auto">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
                  <img 
                    src={einsteinImg} 
                    alt="Albert Einstein" 
                    className="w-full h-full object-cover object-center"
                  />
                </div>
                <blockquote className="text-left px-2">
                  <p className="text-sm sm:text-base md:text-lg lg:text-xl font-medium text-foreground italic">
                    "{t('index.quote')}"
                  </p>
                  <cite className="block mt-2 sm:mt-3 text-xs sm:text-sm text-muted-foreground not-italic">— {t('index.quoteAuthor')}</cite>
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Available Slots Section */}
      <section className="container mx-auto px-2 sm:px-4 py-6 sm:py-8">
        <AvailableSlotsCard params={params} loading={loading} />
      </section>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-6 sm:py-12">
        <TradingPlanCalculator />
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-2 sm:px-4 py-6 sm:py-8 mt-8 sm:mt-12 border-t border-border">
        <div className="text-center text-muted-foreground px-2">
          <p className="text-xs sm:text-sm">
            {t('index.footer')}
          </p>
          <p className="text-xs mt-2">
            {t('index.footerDetails', { currency: currencySymbol })}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
