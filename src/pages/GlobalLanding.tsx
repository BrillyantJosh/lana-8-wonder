import { useMemo } from 'react';
import lanaCoin from '@/assets/lana-coin.png';
import { Sparkles, Globe, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface CountryOption {
  key: string;
  name: string;
  flag: string;
  currency: string;
  hostname: string;
}

const countries: CountryOption[] = [
  { key: 'si', name: 'Slovenija', flag: '🇸🇮', currency: 'EUR', hostname: 'si.lana8wonder.com' },
  { key: 'at', name: 'Österreich', flag: '🇦🇹', currency: 'EUR', hostname: 'at.lana8wonder.com' },
  { key: 'uk', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', hostname: 'uk.lana8wonder.com' },
  { key: 'hu', name: 'Magyarország', flag: '🇭🇺', currency: 'EUR', hostname: 'hu.lana8wonder.com' },
];

function detectCountry(): string | null {
  const lang = (navigator.language || '').toLowerCase();
  if (lang.startsWith('sl')) return 'si';
  if (lang.startsWith('hu')) return 'hu';
  if (lang.startsWith('de')) return 'at';
  if (lang.startsWith('en')) return 'uk';
  return null;
}

const GlobalLanding = () => {
  const detected = useMemo(() => detectCountry(), []);

  const handleSelect = (hostname: string) => {
    window.location.href = `https://${hostname}`;
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--gradient-hero))] relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-[hsl(270_60%_95%)] to-background pointer-events-none" />

      <div className="relative z-10">
        {/* Header bar */}
        <header className="w-full py-4 px-6 flex items-center justify-center">
          <div className="flex items-center gap-2 text-primary">
            <Globe className="h-5 w-5" />
            <span className="font-semibold text-lg tracking-wide">Lana8Wonder</span>
          </div>
        </header>

        {/* Hero section */}
        <section className="flex flex-col items-center justify-center px-4 pt-6 pb-10 md:pt-10 md:pb-16">
          {/* Coin image */}
          <div className="relative mb-6 md:mb-8">
            <div className="absolute inset-0 bg-[hsl(var(--mystical-purple)/0.15)] rounded-full blur-3xl scale-110" />
            <img
              src={lanaCoin}
              alt="LanaCoin"
              className="relative w-40 h-40 md:w-56 md:h-56 object-contain drop-shadow-2xl animate-in fade-in zoom-in duration-700"
            />
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-5xl font-bold text-center mb-3 bg-gradient-to-r from-[hsl(var(--mystical-purple))] via-[hsl(var(--gold-accent))] to-[hsl(var(--cyan-tech))] bg-clip-text text-transparent">
            <Sparkles className="inline h-6 w-6 md:h-8 md:w-8 text-[hsl(var(--gold-accent))] mr-2" />
            Welcome to Lana8Wonder
            <Sparkles className="inline h-6 w-6 md:h-8 md:w-8 text-[hsl(var(--gold-accent))] ml-2" />
          </h1>

          <p className="text-muted-foreground text-center text-base md:text-lg max-w-md mb-2">
            Your gateway to the LanaCoin universe
          </p>
          <p className="text-muted-foreground/70 text-center text-sm max-w-sm">
            88 LANA &middot; 8 Wallets &middot; 8 Levels of Growth
          </p>
        </section>

        {/* Country selection */}
        <section className="px-4 pb-16 md:pb-24 max-w-2xl mx-auto">
          <h2 className="text-center text-lg md:text-xl font-semibold text-foreground mb-6">
            Choose your country to get started
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {countries.map((country) => {
              const isDetected = detected === country.key;
              return (
                <Card
                  key={country.key}
                  onClick={() => handleSelect(country.hostname)}
                  className={`
                    cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-[var(--shadow-mystical)]
                    group relative overflow-hidden
                    ${isDetected
                      ? 'ring-2 ring-primary shadow-[var(--shadow-mystical)]'
                      : 'hover:ring-1 hover:ring-primary/40'
                    }
                  `}
                >
                  {isDetected && (
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-bl-lg">
                      Recommended
                    </div>
                  )}
                  <CardContent className="flex items-center gap-4 p-5">
                    <span className="text-4xl md:text-5xl" role="img" aria-label={country.name}>
                      {country.flag}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base md:text-lg text-foreground">
                        {country.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Currency: {country.currency}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-6 text-xs text-muted-foreground/60 border-t border-border/30">
          <p>&copy; {new Date().getFullYear()} Lana8Wonder &mdash; Powered by LanaCoin</p>
        </footer>
      </div>
    </div>
  );
};

export default GlobalLanding;
