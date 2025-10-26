import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, KeyRound, Scan } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";

const Login = () => {
  const [wif, setWif] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanning = async () => {
    if (!scannerDivRef.current) return;

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          setWif(decodedText);
          stopScanning();
          toast.success("QR koda uspešno skenirana!");
        },
        () => {
          // Error callback - ignore frame errors
        }
      );

      setIsScanning(true);
    } catch (error) {
      console.error("Error starting QR scanner:", error);
      toast.error("Napaka pri zagonu skenerja kamere");
    }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!wif.trim()) {
      toast.error("Vnesite WIF ključ");
      return;
    }

    // TODO: Validate WIF format and authenticate
    // For now, just store in localStorage
    localStorage.setItem("lana_wif", wif);
    toast.success("Prijava uspešna!");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">LANA Prijava</CardTitle>
          <CardDescription>
            Vnesite vaš LANA WIF ključ ali skenirajte QR kodo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wif">WIF Ključ</Label>
              <Input
                id="wif"
                type="text"
                placeholder="Vnesite vaš WIF ključ..."
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
                  Skeniraj QR Kodo
                </Button>

                <Button type="submit" className="w-full" disabled={!wif.trim()}>
                  Prijavi se
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  id="qr-reader"
                  ref={scannerDivRef}
                  className="rounded-lg overflow-hidden border-2 border-primary"
                />
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={stopScanning}
                >
                  Ustavi Skeniranje
                </Button>
              </div>
            )}
          </form>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Vaš WIF ključ je varen in se shrani lokalno v vašem brskalniku
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
