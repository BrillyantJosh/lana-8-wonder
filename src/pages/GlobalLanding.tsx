import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Compass, Hourglass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BalanceSignals, BrandLockup, NatureFlowIllustration } from "@/components/Lana8WonderBrand";
import { LanguageSelector } from "@/components/LanguageSelector";
import { getPublicLandingCopy } from "@/i18n/publicLandingCopy";

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
  const { i18n } = useTranslation();
  const copy = getPublicLandingCopy(i18n.resolvedLanguage || i18n.language);
  const detected = useMemo(() => detectCountry(), []);
  const [slotsMap, setSlotsMap] = useState<Record<string, SlotData> | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    const description = document.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute("content");

    document.title = copy.meta.title;
    document.documentElement.lang = i18n.resolvedLanguage || i18n.language;
    description?.setAttribute("content", copy.meta.description);

    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
      if (previousDescription) description?.setAttribute("content", previousDescription);
    };
  }, [copy.meta.description, copy.meta.title, i18n.language, i18n.resolvedLanguage]);

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
        <div className="l8w-global__tools">
          <p className="l8w-eyebrow"><span>{copy.global.eyebrow}</span></p>
          <LanguageSelector />
        </div>
      </header>

      <section className="l8w-global__hero" aria-labelledby="global-title">
        <div className="l8w-global__intro">
          <p className="l8w-kicker">{copy.global.kicker}</p>
          <h1 id="global-title">{copy.global.welcome} <span>Lana8Wonder</span></h1>
          <div className="l8w-flourish" aria-hidden="true"><i /><b>❧</b><i /></div>
          <h2>{copy.global.choose}</h2>
          <p>{copy.global.description}</p>
        </div>

        <div className="l8w-global__visual">
          <NatureFlowIllustration compact />
        </div>
      </section>

      <section className="l8w-country-section" aria-labelledby="regional-paths">
        <h2 id="regional-paths"><span />{copy.global.selectPath}<span /></h2>
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
                aria-label={`${copy.global.continueTo} ${country.name}`}
              >
                {isRecommended && (
                  <span className="l8w-country-card__ribbon l8w-country-card__ribbon--green">
                    <Compass /> {copy.global.recommended}
                  </span>
                )}
                {isSoldOut && (
                  <span className="l8w-country-card__ribbon l8w-country-card__ribbon--gold">
                    <Hourglass /> {copy.global.soldOut}
                  </span>
                )}
                <img
                  src={`https://flagcdn.com/w160/${country.flagCode}.png`}
                  alt=""
                  className="l8w-country-card__flag"
                />
                <span className="l8w-country-card__copy">
                  <strong>{country.name}</strong>
                  <small>{copy.global.currency}: {country.currency}</small>
                </span>
                <span className="l8w-country-card__arrow"><ArrowRight /></span>
              </button>
            );
          })}
        </div>
      </section>

      <BalanceSignals labels={copy.signals} />

      <footer className="l8w-footer l8w-footer--global">
        <p>© {new Date().getFullYear()} Lana8Wonder</p>
        <p>{copy.global.footer}</p>
      </footer>
    </main>
  );
};

export default GlobalLanding;
