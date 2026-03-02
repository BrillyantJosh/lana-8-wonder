import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, KeyRound, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { convertWifToIds } from "@/lib/lanaKeys";
import { fetchKind88888, fetchKind0Profile } from "@/lib/nostrClient";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { LanguageSelector } from "@/components/LanguageSelector";
import { validateWifAndGetAddress } from "@/lib/wifValidation";
import { getDomainKey } from "@/integrations/api/client";

const Login = () => {
  const { t, i18n } = useTranslation();
  const [wif, setWif] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wifValidation, setWifValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);
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
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanning = async () => {
    setIsScanning(true);
    
    // CRITICAL: 100ms delay to ensure DOM is ready
    setTimeout(async () => {
      try {
        // 1. Enumerate cameras
        const cameras = await Html5Qrcode.getCameras();
        
        if (!cameras || cameras.length === 0) {
          toast.error("No camera found on this device");
          setIsScanning(false);
          return;
        }

        // 2. Select camera (priority: back camera)
        let selectedCamera = cameras[0];
        if (cameras.length > 1) {
          const backCamera = cameras.find(camera => 
            camera.label.toLowerCase().includes('back') || 
            camera.label.toLowerCase().includes('rear')
          );
          if (backCamera) {
            selectedCamera = backCamera;
          }
        }

        // 3. Initialize scanner with unique ID
        const scanner = new Html5Qrcode("qr-reader-login");
        scannerRef.current = scanner;

        // 4. Start scanner with camera.id
        await scanner.start(
          selectedCamera.id,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            setWif(decodedText);
            stopScanning();
            toast.success("QR code scanned successfully!");
          },
          (errorMessage) => {
            // Ignore scan errors during operation
          }
        );
      } catch (error: any) {
        console.error("Error starting QR scanner:", error);
        setIsScanning(false);
        
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          toast.error("Camera permission denied. Please allow camera access in your browser settings.");
        } else if (error.name === "NotFoundError") {
          toast.error("No camera found on this device");
        } else if (error.name === "NotReadableError") {
          toast.error("Camera is already in use by another application");
        } else {
          toast.error(`Error starting camera: ${error.message || "Unknown error"}`);
        }
      }
    }, 100);
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (error) {
        console.error("Error stopping scanner:", error);
      }
    }
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
    <div className="min-h-screen bg-background flex items-center justify-center p-2 sm:p-4">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2 px-4 sm:px-6">
          <div className="mx-auto w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <KeyRound className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          </div>
          <CardTitle className="text-xl sm:text-2xl">{t('login.title')}</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t('login.wifPlaceholder')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wif" className="text-sm">{t('login.wifLabel')}</Label>
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
                  className="w-full text-sm"
                  onClick={startScanning}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  {t('login.scanQR')}
                </Button>

                <Button type="submit" className="w-full text-sm" disabled={!wif.trim() || isProcessing || !wifValidation?.valid}>
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('login.processing')}
                    </>
                  ) : (
                    t('login.loginButton')
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                <div
                  id="qr-reader-login"
                  ref={scannerDivRef}
                  className="rounded-lg overflow-hidden border-2 border-primary"
                />
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full text-sm"
                  onClick={stopScanning}
                >
                  {t('login.stopScanning')}
                </Button>
              </div>
            )}
          </form>

          <div className="pt-3 sm:pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Your WIF key is secure and stored locally in your browser
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
