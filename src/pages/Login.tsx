import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, KeyRound, Loader2 } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { convertWifToIds } from "@/lib/lanaKeys";
import { fetchKind88888, fetchKind0Profile } from "@/lib/nostrClient";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";

const Login = () => {
  const [wif, setWif] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);
  const { params } = useNostrLanaParams();

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
    
    if (!wif.trim()) {
      toast.error("Enter WIF key");
      return;
    }

    if (!params?.relays || params.relays.length === 0) {
      toast.error("No relays available. Please refresh the page.");
      return;
    }

    setIsProcessing(true);

    try {
      // Convert WIF to all identifiers
      const ids = await convertWifToIds(wif);
      
      console.log("Derived identifiers:", {
        walletId: ids.walletId,
        nostrHexId: ids.nostrHexId,
        nostrNpubId: ids.nostrNpubId
      });

      // First, check if user has a KIND 0 profile
      const profile = await fetchKind0Profile(ids.nostrHexId, params.relays);
      
      if (!profile) {
        toast.error("No profile found. Please create a profile first and wait 24 hours before logging in.");
        return;
      }

      toast.success("Profile found!");

      // Store session with profile data
      const lanaSession = {
        ...ids,
        profileName: profile.name,
        profileDisplayName: profile.display_name,
        currency: profile.currency || "EUR" // Use profile currency or default to EUR
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">LANA Login</CardTitle>
          <CardDescription>
            Enter your LANA WIF key or scan QR code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wif">WIF Key</Label>
              <Input
                id="wif"
                type="password"
                placeholder="Enter your WIF key..."
                value={wif}
                onChange={(e) => setWif(e.target.value)}
                disabled={isScanning}
                className="font-mono text-sm"
              />
            </div>

            {!isScanning ? (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={startScanning}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  Scan QR Code
                </Button>

                <Button type="submit" className="w-full" disabled={!wif.trim() || isProcessing}>
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Log In"
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  id="qr-reader-login"
                  ref={scannerDivRef}
                  className="rounded-lg overflow-hidden border-2 border-primary"
                />
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={stopScanning}
                >
                  Stop Scanning
                </Button>
              </div>
            )}
          </form>

          <div className="pt-4 border-t border-border">
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
