import { useRef, useCallback } from 'react';
import jsQR from 'jsqr';

const PW = 640;
const PH = 360;

export function useQRScanner() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const animRef     = useRef<number | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const doneRef     = useRef(false);
  const grayRef     = useRef(new Uint8Array(PW * PH));
  const integralRef = useRef(new Int32Array((PW + 1) * (PH + 1)));

  const cleanup = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const adaptiveThreshold = (imageData: ImageData): void => {
    const { data, width, height } = imageData;
    const gray     = grayRef.current;
    const integral = integralRef.current;
    const S  = 8;
    const T  = 0.85;
    const w1 = width + 1;

    for (let i = 0, j = 0; j < data.length; i++, j += 4) {
      gray[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) | 0;
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        integral[(y + 1) * w1 + (x + 1)] =
          gray[y * width + x]
          + integral[y * w1 + (x + 1)]
          + integral[(y + 1) * w1 + x]
          - integral[y * w1 + x];
      }
    }
    for (let y = 0; y < height; y++) {
      const y1 = Math.max(0, y - S);
      const y2 = Math.min(height - 1, y + S);
      for (let x = 0; x < width; x++) {
        const x1  = Math.max(0, x - S);
        const x2  = Math.min(width - 1, x + S);
        const cnt = (y2 - y1 + 1) * (x2 - x1 + 1);
        const sum =
            integral[(y2 + 1) * w1 + (x2 + 1)]
          - integral[y1 * w1 + (x2 + 1)]
          - integral[(y2 + 1) * w1 + x1]
          + integral[y1 * w1 + x1];
        const val = gray[y * width + x] < (sum / cnt) * T ? 0 : 255;
        const j   = (y * width + x) * 4;
        data[j] = data[j + 1] = data[j + 2] = val;
      }
    }
  };

  const startScanning = useCallback((onScan: (data: string) => void): Promise<void> => {
    doneRef.current = false;

    const scanFrame = () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || doneRef.current) {
        animRef.current = requestAnimationFrame(scanFrame);
        return;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { animRef.current = requestAnimationFrame(scanFrame); return; }
      canvas.width  = PW;
      canvas.height = PH;
      ctx.drawImage(video, 0, 0, PW, PH);
      const imageData = ctx.getImageData(0, 0, PW, PH);
      adaptiveThreshold(imageData);
      const code = jsQR(imageData.data, PW, PH, { inversionAttempts: 'attemptBoth' });
      if (code && !doneRef.current) {
        doneRef.current = true;
        cleanup();
        onScan(code.data);
        return;
      }
      animRef.current = requestAnimationFrame(scanFrame);
    };

    return new Promise<void>((resolve, reject) => {
      setTimeout(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            animRef.current = requestAnimationFrame(scanFrame);
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      }, 100);
    });
  }, [cleanup]);

  return { videoRef, canvasRef, startScanning, cleanup };
}
