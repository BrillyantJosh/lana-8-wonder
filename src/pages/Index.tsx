import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CircleDot,
  DoorOpen,
  HandHeart,
  Leaf,
  Loader2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sprout,
  Users,
  WalletCards,
  Waves,
  Wifi,
  Wind,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LanguageSelector } from "@/components/LanguageSelector";
import NostrStatusCard from "@/components/NostrStatusCard";
import { BalanceSignals, BrandLockup, NatureFlowIllustration } from "@/components/Lana8WonderBrand";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { getPublicLandingCopy } from "@/i18n/publicLandingCopy";
import { getDomainKey } from "@/integrations/api/client";

const evolutionIcons = [DoorOpen, Sprout, RefreshCw, Scale] as const;
const principleIcons = [DoorOpen, Waves, WalletCards] as const;
const balanceReasonIcons = [HandHeart, Wind, RefreshCw] as const;
const economyIcons = [RefreshCw, Users, ShieldCheck] as const;

const Index = () => {
  const { t, i18n } = useTranslation();
  const copy = getPublicLandingCopy(i18n.resolvedLanguage || i18n.language);
  const evolutionStages = copy.evolution.stages.map((stage, index) => ({ ...stage, icon: evolutionIcons[index] }));
  const principles = copy.principles.cards.map((principle, index) => ({ ...principle, icon: principleIcons[index] }));
  const balanceReasons = copy.why.items.map((reason, index) => ({ ...reason, icon: balanceReasonIcons[index] }));
  const livingEconomy = copy.economy.items.map((item, index) => ({ ...item, icon: economyIcons[index] }));
  const { params, loading, error } = useNostrLanaParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [enableBuyLana, setEnableBuyLana] = useState(true);

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
    const fetchDomainConfig = async () => {
      const domainKey = getDomainKey();
      const headers = domainKey ? { "X-Domain-Key": domainKey } : {};

      try {
        const response = await fetch("/api/domain-config", { headers });
        const json = await response.json();
        if (json.data?.enable_buy_lana !== undefined) {
          setEnableBuyLana(json.data.enable_buy_lana === 1);
        }
      } catch (fetchError) {
        console.error("Error fetching domain config:", fetchError);
      }
    };

    fetchDomainConfig();
  }, []);

  return (
    <div className="l8w-public l8w-regional">
      <header className="l8w-site-header">
        <a href="#top" className="l8w-site-header__brand" aria-label="Lana8Wonder home">
          <BrandLockup compact />
        </a>

        <nav className="l8w-site-nav" aria-label={copy.nav.howItWorks}>
          <a href="#idea">{copy.nav.idea}</a>
          <a href="#evolution">{copy.nav.evolution}</a>
          <a href="#principles">{copy.nav.principles}</a>
          <a href="#why-balance">{copy.nav.whyBalance}</a>
          <a href="#growth-phase">{copy.nav.howItWorks}</a>
        </nav>

        <div className="l8w-site-header__actions">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button type="button" className="l8w-network" aria-label={t("index.nostrNetworkStatus")}>
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : error ? (
                  <Wifi className="is-offline" />
                ) : (
                  <Wifi className="is-online" />
                )}
                <span className="sr-only">{loading ? t("index.connecting") : error ? t("index.disconnected") : t("index.connected")}</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] sm:max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("index.nostrNetworkStatus")}</DialogTitle>
              </DialogHeader>
              {loading && (
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">{t("index.connectingToNostr")}</span>
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
          <LanguageSelector />
          {enableBuyLana && (
            <Link to="/buy-lana8wonder" className="l8w-button l8w-button--quiet l8w-header-begin">
              {copy.actions.begin}
            </Link>
          )}
          <Link to="/login" className="l8w-button l8w-button--primary l8w-header-enter">
            {copy.actions.enter}
          </Link>
        </div>
        <div className="l8w-mobile-language">
          <LanguageSelector />
        </div>
      </header>

      <main id="top">
        <section className="l8w-hero" aria-labelledby="hero-title">
          <div className="l8w-orbit" aria-hidden="true" />
          <div className="l8w-shell l8w-hero__grid">
            <div className="l8w-hero__copy">
              <p className="l8w-kicker">{copy.hero.kicker}</p>
              <h1 id="hero-title">{copy.hero.line1}<br />{copy.hero.line2Prefix} <span>{copy.hero.balance}</span></h1>
              <div className="l8w-title-line" aria-hidden="true" />
              <p className="l8w-hero__lead">
                {copy.hero.lead}
              </p>
              <div className="l8w-hero__statement">
                <Leaf />
                <p>{copy.hero.statement1}<br /><strong>{copy.hero.statement2}</strong></p>
              </div>
              <div className="l8w-hero__actions">
                {enableBuyLana && (
                  <Link to="/buy-lana8wonder" className="l8w-button l8w-button--primary">
                    {copy.actions.begin} <ArrowRight />
                  </Link>
                )}
                <Link to="/login" className="l8w-button l8w-button--outline">
                  {copy.actions.enter}
                </Link>
              </div>
              {enableBuyLana && (
                <p className="l8w-hero__note">{copy.hero.note}</p>
              )}
            </div>

            <div className="l8w-hero__art">
              <NatureFlowIllustration />
              <BalanceSignals labels={copy.signals} />
            </div>
          </div>
        </section>

        <section id="idea" className="l8w-section l8w-section--idea">
          <div className="l8w-shell l8w-idea-grid">
            <div className="l8w-botanical-medallion" aria-hidden="true">
              <span><Sprout /></span>
              <i /><i /><i />
            </div>
            <div className="l8w-section-copy">
              <p className="l8w-section-number">01</p>
              <h2>{copy.idea.title}</h2>
              <p>{copy.idea.belief}</p>
              <p>{copy.idea.wealth}</p>
              <p>{copy.idea.journey}</p>
              <p>{copy.idea.destinationPrefix} <strong>{copy.idea.destinationName}</strong> {copy.idea.destinationSuffix}</p>
            </div>
            <blockquote className="l8w-feature-quote">
              <span>“</span>
              {copy.idea.quote1}<br />{copy.idea.quote2}
            </blockquote>
          </div>
        </section>

        <section id="evolution" className="l8w-section l8w-section--white">
          <div className="l8w-shell">
            <div className="l8w-section-heading">
              <p className="l8w-section-number">02</p>
              <h2>{copy.evolution.title}</h2>
              <p>{copy.evolution.intro}</p>
            </div>
            <ol className="l8w-evolution">
              {evolutionStages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <li key={stage.title}>
                    <span className="l8w-evolution__number">{index + 1}</span>
                    <div className="l8w-evolution__icon"><Icon /></div>
                    <h3>{stage.title}</h3>
                    <p>{stage.text}</p>
                    {index < evolutionStages.length - 1 && <ArrowRight className="l8w-evolution__arrow" aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section id="principles" className="l8w-section l8w-section--tint">
          <div className="l8w-shell">
            <div className="l8w-section-heading">
              <p className="l8w-section-number">03</p>
              <h2>{copy.principles.title}</h2>
            </div>
            <div className="l8w-principles">
              {principles.map((principle, index) => {
                const Icon = principle.icon;
                return (
                  <article key={principle.title}>
                    <div className={`l8w-principles__icon l8w-principles__icon--${index + 1}`}><Icon /></div>
                    <div>
                      <h3>{principle.title} <Leaf /></h3>
                      <p>{principle.text}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="why-balance" className="l8w-section l8w-section--landscape">
          <div className="l8w-shell">
            <div className="l8w-section-heading">
              <p className="l8w-section-number">04</p>
              <h2>{copy.why.title}</h2>
            </div>
            <div className="l8w-balance-reasons">
              {balanceReasons.map((reason) => {
                const Icon = reason.icon;
                return (
                  <article key={reason.title}>
                    <span><Icon /></span>
                    <div><h3>{reason.title}</h3><p>{reason.text}</p></div>
                  </article>
                );
              })}
            </div>
            <blockquote>{copy.why.quote}</blockquote>
          </div>
        </section>

        <section id="growth-phase" className="l8w-section l8w-section--growth">
          <div className="l8w-shell l8w-growth-grid">
            <div>
              <p className="l8w-kicker">{copy.growth.kicker}</p>
              <h2>{copy.growth.title}</h2>
              <p className="l8w-growth-grid__lead">{copy.growth.lead}</p>
            </div>
            <div className="l8w-growth-grid__copy">
              <p>{copy.growth.p1}</p>
              <p>{copy.growth.p2}</p>
              <p><strong>{copy.growth.p3}</strong></p>
            </div>
            <div className="l8w-growth-symbol" aria-hidden="true">
              <CircleDot /><ArrowRight /><Sprout /><ArrowRight /><Scale />
            </div>
          </div>
        </section>

        <section className="l8w-section l8w-section--white">
          <div className="l8w-shell">
            <div className="l8w-section-heading l8w-section-heading--wide">
              <p className="l8w-kicker">{copy.economy.kicker}</p>
              <h2>{copy.economy.title}</h2>
              <p>{copy.economy.lead}</p>
            </div>
            <div className="l8w-economy-grid">
              {livingEconomy.map((item) => {
                const Icon = item.icon;
                return <article key={item.title}><Icon /><h3>{item.title}</h3><p>{item.text}</p></article>;
              })}
            </div>
          </div>
        </section>

        <section className="l8w-section l8w-section--wallet">
          <div className="l8w-shell l8w-wallet-grid">
            <div className="l8w-wallet-symbol" aria-hidden="true"><WalletCards /><RefreshCw /></div>
            <div>
              <p className="l8w-kicker">{copy.wallet.kicker}</p>
              <h2>{copy.wallet.title}</h2>
              <p>{copy.wallet.intro}</p>
              <div className="l8w-question-shift">
                <span>{copy.wallet.instead}</span><del>{copy.wallet.oldQuestion}</del>
                <span>{copy.wallet.begins}</span><strong>{copy.wallet.newQuestion}</strong>
              </div>
              <p>{copy.wallet.p1}</p>
              <p>{copy.wallet.p2}</p>
            </div>
          </div>
        </section>

        <section className="l8w-section l8w-section--nature">
          <div className="l8w-shell l8w-nature-grid">
            <div>
              <p className="l8w-kicker">{copy.nature.kicker}</p>
              <h2>{copy.nature.title}</h2>
              <p>{copy.nature.p1}</p>
              <p>{copy.nature.p2}</p>
              <p>{copy.nature.p3Prefix} <strong>{copy.nature.p3Strong}</strong></p>
              <small>{copy.nature.disclaimer}</small>
            </div>
            <div className="l8w-nature-cycle" aria-hidden="true">
              <span><CircleDot /></span><ArrowRight /><span><Sprout /></span><ArrowRight /><span><Leaf /></span><ArrowRight /><span><Scale /></span>
            </div>
          </div>
        </section>

        <section className="l8w-entry">
          <div className="l8w-shell l8w-entry__card">
            <div className="l8w-entry__mark"><BrandLockup compact /></div>
            <div className="l8w-entry__copy">
              <p className="l8w-kicker">{copy.entry.kicker}</p>
              <h2>{copy.entry.title}</h2>
              <p>{copy.entry.text}</p>
              <div className="l8w-entry__actions">
                {enableBuyLana ? (
                  <Link to="/buy-lana8wonder" className="l8w-button l8w-button--primary">{copy.actions.getLana} <ArrowRight /></Link>
                ) : (
                  <Badge variant="outline" className="l8w-waiting-badge">{copy.entry.waiting}</Badge>
                )}
              </div>
            </div>
            <div className="l8w-entry__existing">
              <p>{copy.entry.already}</p>
              <Link to="/login" className="l8w-button l8w-button--outline">{copy.actions.enter}</Link>
              <small>{copy.entry.unchanged}</small>
            </div>
          </div>
        </section>
      </main>

      <footer className="l8w-footer">
        <div className="l8w-shell">
          <BrandLockup compact />
          <p>{copy.footer}</p>
          <p>© {new Date().getFullYear()} Lana8Wonder</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
