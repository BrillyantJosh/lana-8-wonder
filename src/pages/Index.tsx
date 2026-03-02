import TradingPlanCalculator from "@/components/TradingPlanCalculator";
import lanaCoin from "@/assets/lana-coin.png";
import einsteinImg from "@/assets/einstein.png";
import { Sparkles, Wifi, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import NostrStatusCard from "@/components/NostrStatusCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { getCurrencySymbol } from "@/lib/utils";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getDomainKey } from "@/integrations/api/client";

// Video URLs - prepared for multi-language support
const getVideoUrl = (language: string): string => {
  const videoUrls: Record<string, string> = {
    sl: "https://www.youtube.com/embed/cP-MNpeo6gw",
    // When English version is available, add here:
    // en: "https://www.youtube.com/embed/ENGLISH_VIDEO_ID",
    default: "https://www.youtube.com/embed/cP-MNpeo6gw"
  };

  return videoUrls[language] || videoUrls.default;
};

const Index = () => {
  const { t, i18n } = useTranslation();
  const { params, loading, error } = useNostrLanaParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [domainCurrency, setDomainCurrency] = useState<'EUR' | 'USD' | 'GBP'>('EUR');

  // Get currency symbol from domain config or session
  const sessionData = typeof window !== 'undefined' ? sessionStorage.getItem("lana_session") : null;
  const sessionCurrency = sessionData ? JSON.parse(sessionData).currency : null;
  const currencySymbol = getCurrencySymbol(sessionCurrency || domainCurrency || 'EUR');

  // Fetch domain config for default currency
  useEffect(() => {
    const fetchDomainCurrency = async () => {
      try {
        const res = await fetch('/api/domain-config', {
          headers: {
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          }
        });
        const json = await res.json();
        if (json.data?.currency_default) {
          const cur = json.data.currency_default.toUpperCase();
          if (cur === 'EUR' || cur === 'USD' || cur === 'GBP') {
            setDomainCurrency(cur);
          }
        }
      } catch (error) {
        console.error('Error fetching domain config:', error);
      }
    };

    fetchDomainCurrency();
  }, []);

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

      {/* 8th Wonder Annuity Plan Calculator — shown by default */}
      <main className="container mx-auto px-2 sm:px-4 py-6 sm:py-12">
        <TradingPlanCalculator defaultCurrency={domainCurrency} autoCalculate={true} />
      </main>

      {/* Buy LANA CTA Section */}
      <section className="container mx-auto px-2 sm:px-4 py-6 sm:py-8">
        <div className="max-w-5xl mx-auto">
          <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 to-background">
            <CardContent className="p-6 sm:p-10 text-center space-y-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-primary">
                {t('buyLana.title')}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
                {t('buyLana.step2Notice')}
              </p>
              <Button size="lg" className="text-lg px-8 py-6" asChild>
                <Link to="/buy-lana8wonder">
                  {t('buyLana.indexBuyButton')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="container mx-auto px-2 sm:px-4 py-6 sm:py-12">
        <div className="max-w-5xl mx-auto">
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-primary mb-4 sm:mb-6">{t('index.faq.title')}</h2>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger className="text-left text-sm sm:text-base">
                    {t('index.faq.q1')}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {t('index.faq.a1')}{" "}
                    <a href="https://youtu.be/cpzb5qKMAXM?si=VMHT2ZpXF40mHE4K" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      https://youtu.be/cpzb5qKMAXM
                    </a>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-2">
                  <AccordionTrigger className="text-left text-sm sm:text-base">
                    {t('index.faq.q2')}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {t('index.faq.a2')}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-3">
                  <AccordionTrigger className="text-left text-sm sm:text-base">
                    {t('index.faq.q3')}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {t('index.faq.a3')}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-4">
                  <AccordionTrigger className="text-left text-sm sm:text-base">
                    {t('index.faq.q4')}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    <span dangerouslySetInnerHTML={{ __html: t('index.faq.a4') }} />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-5">
                  <AccordionTrigger className="text-left text-sm sm:text-base">
                    {t('index.faq.q5')}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
                    <p>{t('index.faq.a5_intro')}</p>
                    <p>{t('index.faq.a5_videos')}</p>
                    <p>
                      {t('index.faq.a5_step1')}{" "}
                      <a href="https://youtu.be/AjLZJC1NUMY?si=fnHCG72s9SZsavmn" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        https://youtu.be/AjLZJC1NUMY
                      </a>
                    </p>
                    <p>
                      {t('index.faq.a5_step2')}{" "}
                      <a href="https://youtu.be/JKyQrO6Im5A?si=wiUcYGPHTI3kNpn5" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        https://youtu.be/JKyQrO6Im5A
                      </a>
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-6">
                  <AccordionTrigger className="text-left text-sm sm:text-base">
                    {t('index.faq.q6')}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
                    <p>{t('index.faq.a6_intro')}{" "}
                      <a href="https://mejmosefajn.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        https://mejmosefajn.org/
                      </a>
                      {t('index.faq.a6_wif')}
                    </p>
                    <p>{t('index.faq.a6_workshop')}</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* What is Lana Video Section */}
      <section className="container mx-auto px-2 sm:px-4 py-6 sm:py-12">
        <div className="max-w-5xl mx-auto">
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-8">
              <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                {/* Video Embed */}
                <div className="w-full md:basis-1/4 md:flex-none md:max-w-[320px]">
                  <div className="aspect-video rounded-lg overflow-hidden shadow-lg">
                    <iframe
                      src={getVideoUrl(i18n.language)}
                      title={t('index.whatIsLana.title')}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>

                {/* Text Content */}
                <div className="flex-1 min-w-0 space-y-3 flex flex-col justify-center">
                  <h2 className="text-xl sm:text-2xl font-bold text-primary">
                    {t('index.whatIsLana.title')}
                  </h2>
                  <p className="text-base sm:text-lg font-semibold text-foreground">
                    {t('index.whatIsLana.question1')}
                  </p>
                  <p className="text-base sm:text-lg font-semibold text-foreground">
                    {t('index.whatIsLana.question2')}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('index.whatIsLana.description')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

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
