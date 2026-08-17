import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { convertWifToIds } from "@/lib/lanaKeys";
import { fetchKind88888, fetchKind0Profile } from "@/lib/nostrClient";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { useQRScanner } from "@/hooks/useQRScanner";
import { LanguageSelector } from "@/components/LanguageSelector";
import { validateWifAndGetAddress } from "@/lib/wifValidation";
import { api as supabase, getDomainKey } from "@/integrations/api/client";
import { LanaMark } from "@/components/Lana8WonderBrand";

const Login = () => {
  const { t, i18n } = useTranslation();
  const [wif, setWif] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wifValidation, setWifValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const navigate = useNavigate();
  const { videoRef, canvasRef, startScanning: startQR, cleanup } = useQRScanner();
  const { params } = useNostrLanaParams();
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time WIF validation with debounce
  useEffect(() => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    const normalizedWif = wif.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
    
    if (!normalizedWif) {
      setWifValidation(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);

    validationTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await validateWifAndGetAddress(normalizedWif);
        setWifValidation({ valid: result.valid, error: result.error });
      } catch (error) {
        setWifValidation({ valid: false, error: "Invalid LanaWIF format" });
      } finally {
        setIsValidating(false);
      }
    }, 300);

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [wif]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const startScanning = async () => {
    setIsScanning(true);
    try {
      await startQR((data) => {
        setWif(data);
        setIsScanning(false);
        toast.success("QR code scanned successfully!");
      });
    } catch (err: unknown) {
      console.error("Error starting QR scanner:", err);
      setIsScanning(false);
      toast.error(err instanceof Error ? err.message : "Camera error");
    }
  };

  const stopScanning = () => {
    cleanup();
    setIsScanning(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // CRITICAL: Normalize WIF to remove invisible characters (spaces, zero-width chars)
    const normalizedWif = wif.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
    
    if (!normalizedWif) {
      toast.error("Enter WIF key");
      return;
    }

    if (!params?.relays || params.relays.length === 0) {
      toast.error("No relays available. Please refresh the page.");
      return;
    }

    setIsProcessing(true);

    try {
      // Convert WIF to all identifiers (already normalized in convertWifToIds)
      const ids = await convertWifToIds(normalizedWif);
      
      console.log("Derived identifiers:", {
        walletId: ids.walletId,
        isCompressed: ids.isCompressed,
        nostrHexId: ids.nostrHexId,
        nostrNpubId: ids.nostrNpubId
      });

      // First, check if user has a KIND 0 profile
      const profile = await fetchKind0Profile(ids.nostrHexId, params.relays);
      
      if (!profile) {
        toast.error(t('login.profileNotFound'));
        return;
      }

      toast.success(t('login.loginSuccess'));

      // Extract language from KIND 0 profile tags
      const langTag = profile.tags?.find((tag: string[]) => tag[0] === 'lang');
      const userLanguage = langTag ? langTag[1] : 'en';
      
      // Map BCP-47 codes to supported languages (en, sl, de, it)
      const baseLang = userLanguage.split('-')[0]; // Extract base language (e.g., 'en' from 'en-US')
      const supportedLanguages = ['en', 'sl', 'de', 'it'];
      const finalLanguage = supportedLanguages.includes(baseLang) ? baseLang : 'en';
      
      // Store language preference and change i18n language
      sessionStorage.setItem('userLanguage', finalLanguage);
      i18n.changeLanguage(finalLanguage);

      // Store session with profile data
      const lanaSession = {
        ...ids,
        profileName: profile.name,
        profileDisplayName: profile.display_name,
        currency: profile.currency || "EUR", // Use profile currency or default to EUR
        domainKey: getDomainKey()
      };
      
      sessionStorage.setItem("lana_session", JSON.stringify(lanaSession));

      // Check for KIND 88888 plan on relays
      const plan = await fetchKind88888(ids.nostrHexId, params.relays);

      if (plan) {
        toast.success("Annuity plan found!");
        navigate("/dashboard");
      } else {
        // No published plan — check if user has incomplete enrollment
        // (wallets registered + transaction made, but plan not yet published)
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, wallet_registered, tx, published_plan, selected_wallet')
            .eq('nostr_hex_id', ids.nostrHexId)
            .maybeSingle();

          if (profileData) {
            const profileRow = profileData as {
              id: string;
              wallet_registered: number | null;
              tx: string | null;
              published_plan: number | null;
              selected_wallet: string | null;
            };

            // Check if 8 annuity wallets exist locally
            const { data: walletData } = await supabase
              .from('wallets')
              .select('wallet_address')
              .eq('profile_id', profileRow.id)
              .eq('wallet_type', 'annuity');

            const hasAllWallets = Array.isArray(walletData) && walletData.length === 8;
            const hasTransaction = !!profileRow.tx;
            const planNotPublished = !profileRow.published_plan;

            if (hasAllWallets && hasTransaction && planNotPublished) {
              toast.info("Resuming: complete your annuity plan publication.");
              navigate("/preview-lana8wonder");
              return;
            }
          }
        } catch (err) {
          console.error('Error checking incomplete enrollment:', err);
          // Fall through to default behavior
        }

        toast.info("No annuity plan found. Create a new one.");
        navigate("/create-lana8wonder");
      }

    } catch (error) {
      console.error("Login error:", error);
      toast.error(error instanceof Error ? error.message : "Invalid WIF key");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="l8w-login-page min-h-screen bg-background flex items-center justify-center p-2 sm:p-4">
      <div className="l8w-login-language absolute top-2 right-2 sm:top-4 sm:right-4">
        <LanguageSelector />
      </div>
      <div className="l8w-login-layout">
      <Card className="l8w-login-card w-full max-w-md">
        <CardHeader className="text-center space-y-1 sm:space-y-2 px-4 sm:px-6 py-3 sm:py-6">
          <LanaMark className="l8w-login-mark mx-auto mb-1 sm:mb-2" />
          <CardTitle className="text-lg sm:text-2xl">{t('login.title')}</CardTitle>
          <CardDescription className="text-xs sm:text-sm hidden sm:block">
            {t('login.wifPlaceholder')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-6 px-4 sm:px-6">
          <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="wif" className="text-xs sm:text-sm">{t('login.wifLabel')}</Label>
              <div className="relative">
                <Input
                  id="wif"
                  type="password"
                  placeholder={t('login.wifPlaceholder')}
                  value={wif}
                  onChange={(e) => setWif(e.target.value)}
                  disabled={isScanning}
                  className={`font-mono text-xs sm:text-sm pr-10 ${
                    wifValidation !== null 
                      ? wifValidation.valid 
                        ? 'border-green-500 focus-visible:ring-green-500' 
                        : 'border-destructive focus-visible:ring-destructive' 
                      : ''
                  }`}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
                {wif.trim() && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isValidating ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : wifValidation?.valid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : wifValidation !== null ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : null}
                  </div>
                )}
              </div>
              {wifValidation !== null && !wifValidation.valid && !isValidating && (
                <p className="text-xs text-destructive mt-1">
                  {t('login.invalidWif', 'Invalid LanaWIF format')}
                </p>
              )}
            </div>

            {!isScanning ? (
              <div className="space-y-2 sm:space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-xs sm:text-sm h-9 sm:h-10"
                  onClick={startScanning}
                >
                  <QrCode className="mr-1.5 sm:mr-2 h-4 w-4" />
                  {t('login.scanQR')}
                </Button>

                <Button type="submit" className="w-full text-xs sm:text-sm h-9 sm:h-10" disabled={!wif.trim() || isProcessing || !wifValidation?.valid}>
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-1.5 sm:mr-2 h-4 w-4 animate-spin" />
                      {t('login.processing')}
                    </>
                  ) : (
                    t('login.loginButton')
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-4">
                <div className="relative rounded-lg overflow-hidden border-2 border-primary aspect-square bg-black">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-4 left-4 w-10 h-10 border-l-4 border-t-4 border-primary rounded-tl-lg" />
                    <div className="absolute top-4 right-4 w-10 h-10 border-r-4 border-t-4 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-4 left-4 w-10 h-10 border-l-4 border-b-4 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-4 right-4 w-10 h-10 border-r-4 border-b-4 border-primary rounded-br-lg" />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full text-xs sm:text-sm h-9 sm:h-10"
                  onClick={stopScanning}
                >
                  {t('login.stopScanning')}
                </Button>
              </div>
            )}
          </form>

          <div className="pt-2 sm:pt-4 border-t border-border">
            <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
              Your WIF key is secure and stored locally in your browser
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="l8w-login-visual" aria-hidden="true">
        <img src="/images/lana8wonder/growth-to-balance-hero.webp" alt="" />
      </div>
      </div>
    </div>
  );
};

export default Login;
