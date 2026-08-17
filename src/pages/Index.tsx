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
import { getDomainKey } from "@/integrations/api/client";

const evolutionStages = [
  {
    title: "Entry",
    icon: DoorOpen,
    text: "You enter with a deliberately limited amount of Registered LANA. Limited entry protects balance and keeps participation from becoming a competition for capital.",
  },
  {
    title: "Growth",
    icon: Sprout,
    text: "Your wallet develops through successive economic cycles, connected to the wider Lana economy, real circulation and time.",
  },
  {
    title: "Circulation",
    icon: RefreshCw,
    text: "Value is meant to move through real consumption, giving, community support and the wider Lana ecosystem.",
  },
  {
    title: "Balance",
    icon: Scale,
    text: "The mature state is a Balanced Wallet — a defined personal capacity designed around enough, circulation and long-term balance.",
  },
];

const principles = [
  {
    title: "Limited Entry",
    icon: DoorOpen,
    text: "Participation begins with a deliberately limited amount. Lana8Wonder is not designed to reward whoever can place the most capital into the system.",
  },
  {
    title: "Real Circulation",
    icon: Waves,
    text: "Value has meaning when it moves through real people, merchants, creation and community. Circulation is part of the model — not an afterthought.",
  },
  {
    title: "Balanced Wallet",
    icon: WalletCards,
    text: "The goal is not infinite accumulation. It is a mature wallet with a defined capacity that remains useful, active and connected to the wider economy.",
  },
];

const balanceReasons = [
  {
    title: "Use What You Need",
    icon: HandHeart,
    text: "Value exists to support life, creation and purpose — not simply to be stored forever.",
  },
  {
    title: "Release What You Don’t Need",
    icon: Wind,
    text: "What is not needed can return to circulation, be given, donated or directed toward the common good.",
  },
  {
    title: "Keep Value in Motion",
    icon: RefreshCw,
    text: "When value circulates, it can support people, merchants, creators and the wider community.",
  },
];

const livingEconomy = [
  { title: "Circulation", icon: RefreshCw, text: "Value moves through real consumption." },
  { title: "Common Good", icon: Users, text: "Value can support creation, people and community." },
  { title: "Balance", icon: ShieldCheck, text: "Personal capacity matures from accumulation toward healthy flow." },
];

const Index = () => {
  const { t } = useTranslation();
  const { params, loading, error } = useNostrLanaParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [enableBuyLana, setEnableBuyLana] = useState(true);

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

        <nav className="l8w-site-nav" aria-label="Main navigation">
          <a href="#idea">The Idea</a>
          <a href="#evolution">How It Evolves</a>
          <a href="#principles">Principles</a>
          <a href="#why-balance">Why Balance</a>
          <a href="#growth-phase">How It Works</a>
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
              Begin Your Journey
            </Link>
          )}
          <Link to="/login" className="l8w-button l8w-button--primary l8w-header-enter">
            Enter with Wallet
          </Link>
        </div>
      </header>

      <main id="top">
        <section className="l8w-hero" aria-labelledby="hero-title">
          <div className="l8w-orbit" aria-hidden="true" />
          <div className="l8w-shell l8w-hero__grid">
            <div className="l8w-hero__copy">
              <p className="l8w-kicker">A journey toward enough</p>
              <h1 id="hero-title">From Growth<br />to <span>Balance</span></h1>
              <div className="l8w-title-line" aria-hidden="true" />
              <p className="l8w-hero__lead">
                Lana8Wonder is a journey toward a Balanced Wallet — built through real circulation, gradual growth and responsible use of value.
              </p>
              <div className="l8w-hero__statement">
                <Leaf />
                <p>Not built for endless accumulation.<br /><strong>Built for maturity, flow and balance.</strong></p>
              </div>
              <div className="l8w-hero__actions">
                {enableBuyLana && (
                  <Link to="/buy-lana8wonder" className="l8w-button l8w-button--primary">
                    Begin Your Journey <ArrowRight />
                  </Link>
                )}
                <Link to="/login" className="l8w-button l8w-button--outline">
                  Enter with Wallet
                </Link>
              </div>
              {enableBuyLana && (
                <p className="l8w-hero__note">To begin, you need the required amount of Registered LANA for the current cycle.</p>
              )}
            </div>

            <div className="l8w-hero__art">
              <NatureFlowIllustration />
              <BalanceSignals />
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
              <h2>The Idea</h2>
              <p>Lana8Wonder is built on a simple belief:</p>
              <p>True wealth is not defined by how much value you can accumulate, but by your ability to live with enough and keep value in healthy circulation.</p>
              <p>The journey begins with growth. But growth is not the destination.</p>
              <p>The destination is a <strong>Balanced Wallet</strong> — one that supports your life, participates in the wider economy and gradually moves from accumulation toward flow.</p>
            </div>
            <blockquote className="l8w-feature-quote">
              <span>“</span>
              A Balanced Wallet is not empty or full.<br />It is aligned, useful and always in motion.
            </blockquote>
          </div>
        </section>

        <section id="evolution" className="l8w-section l8w-section--white">
          <div className="l8w-shell">
            <div className="l8w-section-heading">
              <p className="l8w-section-number">02</p>
              <h2>How It Evolves</h2>
              <p>Growth has a role. Circulation gives it meaning. Balance gives it direction.</p>
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
              <h2>Core Principles</h2>
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
              <h2>Why Balance Matters</h2>
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
            <blockquote>Balance is not a destination you own. It is a way of moving through life.</blockquote>
          </div>
        </section>

        <section id="growth-phase" className="l8w-section l8w-section--growth">
          <div className="l8w-shell l8w-growth-grid">
            <div>
              <p className="l8w-kicker">Transparent by design</p>
              <h2>Growth Is a Phase</h2>
              <p className="l8w-growth-grid__lead">Lana8Wonder uses successive economic cycles as part of the development of the wallet.</p>
            </div>
            <div className="l8w-growth-grid__copy">
              <p>These cycles can change the system reference value of Registered LANA. But Lana8Wonder is not designed around the promise of a future monetary outcome.</p>
              <p>The timing of future cycles is not guaranteed. Liquidity is not unlimited. A system reference value is not the same as guaranteed cash value or guaranteed redemption.</p>
              <p><strong>The purpose of the growth phase is to help the wallet mature toward balance.</strong></p>
            </div>
            <div className="l8w-growth-symbol" aria-hidden="true">
              <CircleDot /><ArrowRight /><Sprout /><ArrowRight /><Scale />
            </div>
          </div>
        </section>

        <section className="l8w-section l8w-section--white">
          <div className="l8w-shell">
            <div className="l8w-section-heading l8w-section-heading--wide">
              <p className="l8w-kicker">A living economy</p>
              <h2>A Wallet Does Not Live Alone</h2>
              <p>Lana8Wonder is part of the wider Lana Balanced Exchange — an economy built around circulation, creation, common good and balance. Its growth is connected to real activity in the wider ecosystem.</p>
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
              <p className="l8w-kicker">Enough creates flow</p>
              <h2>What Is a Balanced Wallet?</h2>
              <p>A Balanced Wallet represents a different relationship with value.</p>
              <div className="l8w-question-shift">
                <span>Instead of asking</span><del>“How much can I accumulate?”</del>
                <span>it begins to ask</span><strong>“How much is enough for me to live, create and participate?”</strong>
              </div>
              <p>A mature Balanced Wallet is designed around a defined personal capacity. Value beyond what a person needs is encouraged to move — through consumption, giving, support and recirculation.</p>
              <p>The long-term vision is an economy in which value behaves more like a living flow than a collection of isolated piles.</p>
            </div>
          </div>
        </section>

        <section className="l8w-section l8w-section--nature">
          <div className="l8w-shell l8w-nature-grid">
            <div>
              <p className="l8w-kicker">A design philosophy inspired by nature</p>
              <h2>Growth Like a Living System</h2>
              <p>Nature grows through cycles. A single cell divides. A young organism grows quickly. A mature organism does not grow forever.</p>
              <p>It develops capacity, structure and balance.</p>
              <p>Lana8Wonder uses the same idea as a metaphor — <strong>growth → maturation → balance.</strong></p>
              <small>This is a metaphor for the design philosophy, not biological proof of a financial outcome.</small>
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
              <p className="l8w-kicker">Your next step</p>
              <h2>Begin Your Journey</h2>
              <p>If you do not yet have the Registered LANA required for the current Lana8Wonder cycle, enter through the existing onboarding process.</p>
              <div className="l8w-entry__actions">
                {enableBuyLana ? (
                  <Link to="/buy-lana8wonder" className="l8w-button l8w-button--primary">Get the Required LANA <ArrowRight /></Link>
                ) : (
                  <Badge variant="outline" className="l8w-waiting-badge">New entries are currently coordinated through the regional waiting list.</Badge>
                )}
              </div>
            </div>
            <div className="l8w-entry__existing">
              <p>Already part of Lana8Wonder?</p>
              <Link to="/login" className="l8w-button l8w-button--outline">Enter with Wallet</Link>
              <small>Your existing wallet authentication remains unchanged.</small>
            </div>
          </div>
        </section>
      </main>

      <footer className="l8w-footer">
        <div className="l8w-shell">
          <BrandLockup compact />
          <p>From growth to balance — value in healthy circulation.</p>
          <p>© {new Date().getFullYear()} Lana8Wonder</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
