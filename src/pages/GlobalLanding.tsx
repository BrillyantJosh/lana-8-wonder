import { useMemo } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import lanaCoin from '@/assets/lana-coin.png';

interface CountryOption {
  key: string;
  name: string;
  flagCode: string; // ISO 3166-1 alpha-2 for flagcdn.com
  currency: string;
  hostname: string;
}

const countries: CountryOption[] = [
  { key: 'si', name: 'Slovenija', flagCode: 'si', currency: 'EUR', hostname: 'si.lana8wonder.com' },
  { key: 'at', name: 'Österreich', flagCode: 'at', currency: 'EUR', hostname: 'at.lana8wonder.com' },
  { key: 'uk', name: 'United Kingdom', flagCode: 'gb', currency: 'GBP', hostname: 'uk.lana8wonder.com' },
  { key: 'hu', name: 'Magyarország', flagCode: 'hu', currency: 'EUR', hostname: 'hu.lana8wonder.com' },
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

      {/* LANA coin background */}
      <img
        src={lanaCoin}
        alt=""
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] md:w-[800px] opacity-[0.08] pointer-events-none select-none z-[1]"
      />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Hero section */}
        <section className="flex flex-col items-center justify-center px-4 pt-16 pb-10 md:pt-24 md:pb-16">
          {/* Title */}
          <h1 className="text-3xl md:text-5xl font-bold text-center mb-3 bg-gradient-to-r from-[hsl(var(--mystical-purple))] via-[hsl(var(--gold-accent))] to-[hsl(var(--cyan-tech))] bg-clip-text text-transparent">
            <Sparkles className="inline h-6 w-6 md:h-8 md:w-8 text-[hsl(var(--gold-accent))] mr-2" />
            Welcome to Lana8Wonder
            <Sparkles className="inline h-6 w-6 md:h-8 md:w-8 text-[hsl(var(--gold-accent))] ml-2" />
          </h1>

          <p className="text-muted-foreground text-center text-base md:text-lg max-w-md">
            Your gateway to the LanaCoin universe
          </p>
        </section>

        {/* Country selection */}
        <section className="px-4 pb-16 md:pb-24 max-w-2xl mx-auto flex-1">
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
                    <img
                      src={`https://flagcdn.com/w80/${country.flagCode}.png`}
                      srcSet={`https://flagcdn.com/w160/${country.flagCode}.png 2x`}
                      alt={country.name}
                      className="w-12 h-8 md:w-14 md:h-10 object-cover rounded shadow-sm"
                      loading="eager"
                    />
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
