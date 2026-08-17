import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Compass, Hourglass } from "lucide-react";
import { BalanceSignals, BrandLockup, NatureFlowIllustration } from "@/components/Lana8WonderBrand";

interface CountryOption {
  key: string;
  name: string;
  flagCode: string;
  currency: string;
  hostname: string;
}

const countries: CountryOption[] = [
  { key: "si", name: "Slovenija", flagCode: "si", currency: "EUR", hostname: "si.lana8wonder.com" },
  { key: "at", name: "Österreich", flagCode: "at", currency: "EUR", hostname: "at.lana8wonder.com" },
  { key: "uk", name: "United Kingdom", flagCode: "gb", currency: "GBP", hostname: "uk.lana8wonder.com" },
  { key: "hu", name: "Magyarország", flagCode: "hu", currency: "EUR", hostname: "hu.lana8wonder.com" },
];

interface SlotData {
  slots: number;
  currency: string;
}

function detectCountry(): string | null {
  const lang = (navigator.language || "").toLowerCase();
  if (lang.startsWith("sl")) return "si";
  if (lang.startsWith("hu")) return "hu";
  if (lang.startsWith("de")) return "at";
  if (lang.startsWith("en")) return "uk";
  return null;
}

const GlobalLanding = () => {
  const detected = useMemo(() => detectCountry(), []);
  const [slotsMap, setSlotsMap] = useState<Record<string, SlotData> | null>(null);

  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const response = await fetch("/api/global-slots");
        const json = await response.json();
        if (json.data) setSlotsMap(json.data);
      } catch (error) {
        console.error("Failed to fetch slot availability:", error);
      }
    };

    fetchSlots();
  }, []);

  const handleSelect = (hostname: string) => {
    window.location.href = `https://${hostname}`;
  };

  return (
    <main className="l8w-public l8w-global">
      <div className="l8w-orbit l8w-orbit--global" aria-hidden="true" />
      <header className="l8w-global__header">
        <BrandLockup />
        <p className="l8w-eyebrow"><span>Growth to Balance</span></p>
      </header>

      <section className="l8w-global__hero" aria-labelledby="global-title">
        <div className="l8w-global__intro">
          <p className="l8w-kicker">A balanced relationship with value</p>
          <h1 id="global-title">Welcome to <span>Lana8Wonder</span></h1>
          <div className="l8w-flourish" aria-hidden="true"><i /><b>❧</b><i /></div>
          <h2>Choose your country to begin your journey</h2>
          <p>Step into an ecosystem of real value, purposeful growth and conscious circulation.</p>
        </div>

        <div className="l8w-global__visual">
          <NatureFlowIllustration compact />
        </div>
      </section>

      <section className="l8w-country-section" aria-labelledby="regional-paths">
        <h2 id="regional-paths"><span />Select your regional path<span /></h2>
        <div className="l8w-country-grid">
          {countries.map((country) => {
            const slotInfo = slotsMap?.[country.key];
            const hasSlots = slotInfo ? slotInfo.slots > 1 : null;
            const isRecommended = hasSlots === true || (hasSlots === null && detected === country.key);
            const isSoldOut = hasSlots === false;

            return (
              <button
                type="button"
                key={country.key}
                className={`l8w-country-card ${isRecommended ? "is-recommended" : ""} ${isSoldOut ? "is-sold-out" : ""}`}
                onClick={() => handleSelect(country.hostname)}
                aria-label={`Continue to Lana8Wonder ${country.name}`}
              >
                {isRecommended && (
                  <span className="l8w-country-card__ribbon l8w-country-card__ribbon--green">
                    <Compass /> Recommended
                  </span>
                )}
                {isSoldOut && (
                  <span className="l8w-country-card__ribbon l8w-country-card__ribbon--gold">
                    <Hourglass /> Sold out — waiting list
                  </span>
                )}
                <img
                  src={`https://flagcdn.com/w160/${country.flagCode}.png`}
                  alt=""
                  className="l8w-country-card__flag"
                />
                <span className="l8w-country-card__copy">
                  <strong>{country.name}</strong>
                  <small>Currency: {country.currency}</small>
                </span>
                <span className="l8w-country-card__arrow"><ArrowRight /></span>
              </button>
            );
          })}
        </div>
      </section>

      <BalanceSignals />

      <footer className="l8w-footer l8w-footer--global">
        <p>© {new Date().getFullYear()} Lana8Wonder</p>
        <p>Growth is a phase. Balance is the purpose.</p>
      </footer>
    </main>
  );
};

export default GlobalLanding;
