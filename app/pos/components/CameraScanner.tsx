// Path: app/pos/components/CameraScanner.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, SwitchCamera, Loader2, CheckCircle } from 'lucide-react';

interface CameraScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

// Check if native BarcodeDetector is available
function hasNativeBarcodeDetector(): boolean {
  return typeof globalThis !== 'undefined' && 'BarcodeDetector' in globalThis;
}

// Apply continuous autofocus + close-range focus if supported
async function applyFocusConstraints(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    const caps = track.getCapabilities() as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adv: any = {};
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      adv.focusMode = 'continuous';
    }
    // Set focus distance to close range if supported (for macro/barcode scanning)
    if (typeof caps.focusDistance === 'object' && caps.focusDistance !== null) {
      const fd = caps.focusDistance as { min?: number; max?: number };
      if (fd.min !== undefined) {
        // Use a near-focus distance — roughly 20% from minimum
        adv.focusDistance = fd.min + (((fd.max || 1) - fd.min) * 0.2);
      }
    }
    if (Object.keys(adv).length > 0) {
      await track.applyConstraints({ advanced: [adv] });
    }
  } catch {
    // Not all devices support advanced constraints
  }
}

// Scan guide box size in CSS pixels (must match the overlay div below)
const SCAN_BOX_W = 300;
const SCAN_BOX_H = 150;

// Compute the crop region in video pixels that corresponds to the scan guide box
function getCropRegion(video: HTMLVideoElement) {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const el = video.getBoundingClientRect();
  if (!el.width || !el.height) return { sx: 0, sy: 0, sw: vw, sh: vh };

  // video uses object-cover — compute the visible portion
  const videoAspect = vw / vh;
  const elAspect = el.width / el.height;

  let scaleX: number, scaleY: number, offsetX: number, offsetY: number;
  if (videoAspect > elAspect) {
    // Video is wider — height fits, width is cropped
    scaleY = vh / el.height;
    scaleX = scaleY;
    offsetX = (vw - el.width * scaleX) / 2;
    offsetY = 0;
  } else {
    // Video is taller — width fits, height is cropped
    scaleX = vw / el.width;
    scaleY = scaleX;
    offsetX = 0;
    offsetY = (vh - el.height * scaleY) / 2;
  }

  // Scan box is centered in the element
  const boxLeft = (el.width - SCAN_BOX_W) / 2;
  const boxTop = (el.height - SCAN_BOX_H) / 2;

  const sx = Math.max(0, Math.round(offsetX + boxLeft * scaleX));
  const sy = Math.max(0, Math.round(offsetY + boxTop * scaleY));
  const sw = Math.min(vw - sx, Math.round(SCAN_BOX_W * scaleX));
  const sh = Math.min(vh - sy, Math.round(SCAN_BOX_H * scaleY));

  return { sx, sy, sw, sh };
}

export default function CameraScanner({ onScan, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const pausedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;

    const startCamera = async () => {
      setLoading(true);
      setError('');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        await applyFocusConstraints(stream);

        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setLoading(false);

        scanningRef.current = true;

        // Shared canvas for cropping scan region
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;

        if (hasNativeBarcodeDetector()) {
          // ===== NATIVE PATH (Chrome / Android) =====
          // @ts-expect-error — BarcodeDetector is not in TS lib yet
          const detector = new globalThis.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'qr_code'],
          });

          let animFrameId: number;
          const scanLoop = async () => {
            if (cancelled || !scanningRef.current) return;
            if (pausedRef.current) {
              animFrameId = requestAnimationFrame(scanLoop);
              return;
            }
            try {
              const { sx, sy, sw, sh } = getCropRegion(video);
              canvas.width = sw;
              canvas.height = sh;
              ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

              const barcodes = await detector.detect(canvas);
              if (barcodes.length > 0 && !cancelled && !pausedRef.current) {
                const code = barcodes[0].rawValue;
                // Pause detection, show success, then resume
                pausedRef.current = true;
                setScanSuccess(code);
                onScanRef.current(code);
                setTimeout(() => {
                  setScanSuccess(null);
                  pausedRef.current = false;
                }, 1500);
              }
            } catch {
              // detect can throw if video not ready yet
            }
            animFrameId = requestAnimationFrame(scanLoop);
          };
          animFrameId = requestAnimationFrame(scanLoop);
        } else {
          // ===== FALLBACK PATH (iOS / Safari) =====
          // We manage the stream ourselves and decode frames via html5-qrcode scanFile
          const { Html5Qrcode } = await import('html5-qrcode');
          const decoder = new Html5Qrcode('pos-camera-scanner-decode', { verbose: false });

          const decodeFrame = async () => {
            if (cancelled || !scanningRef.current) return;
            if (pausedRef.current) {
              if (!cancelled && scanningRef.current) timerId = setTimeout(decodeFrame, 100);
              return;
            }
            try {
              const { sx, sy, sw, sh } = getCropRegion(video);
              canvas.width = sw;
              canvas.height = sh;
              ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

              const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8));
              if (blob && !cancelled && !pausedRef.current) {
                const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
                try {
                  const result = await decoder.scanFile(file, false);
                  if (result && !cancelled && !pausedRef.current) {
                    // Pause detection, show success, then resume
                    pausedRef.current = true;
                    setScanSuccess(result);
                    onScanRef.current(result);
                    setTimeout(() => {
                      setScanSuccess(null);
                      pausedRef.current = false;
                    }, 1500);
                  }
                } catch {
                  // No barcode found in this frame — normal
                }
              }
            } catch {
              // Canvas/blob error — ignore
            }
            if (!cancelled && scanningRef.current) {
              timerId = setTimeout(decodeFrame, 100);
            }
          };

          timerId = setTimeout(decodeFrame, 200);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Permission') || msg.includes('denied') || msg.includes('NotAllowedError')) {
          setError('กรุณาอนุญาตการใช้กล้อง');
        } else if (msg.includes('NotFound') || msg.includes('Requested device not found') || msg.includes('NotFoundError')) {
          setError('ไม่พบกล้อง');
        } else {
          setError('ไม่สามารถเปิดกล้องได้');
        }
        setLoading(false);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      scanningRef.current = false;
      if (timerId) clearTimeout(timerId);
      stopStream();
    };
  }, [facingMode, stopStream]);

  const toggleCamera = useCallback(() => {
    scanningRef.current = false;
    stopStream();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, [stopStream]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top, 12px)' }}>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20"
        >
          <X className="w-5 h-5" />
        </button>
        <p className="text-white text-sm font-medium">สแกนบาร์โค้ด</p>
        <button
          onClick={toggleCamera}
          className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20"
        >
          <SwitchCamera className="w-5 h-5" />
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative">
        {error ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <Camera className="w-16 h-16 text-gray-500" />
            <p className="text-gray-300 text-center">{error}</p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-white/10 rounded-lg text-white text-sm hover:bg-white/20"
            >
              ปิด
            </button>
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
              </div>
            )}

            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            {/* Hidden canvas for iOS fallback frame decoding */}
            <canvas ref={canvasRef} className="hidden" />
            {/* Hidden div for html5-qrcode decoder instance */}
            <div id="pos-camera-scanner-decode" className="hidden" />

            {/* Scan guide overlay */}
            {!loading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  style={{ width: SCAN_BOX_W, height: SCAN_BOX_H }}
                  className={`rounded-lg border-2 transition-colors duration-200 ${scanSuccess ? 'border-green-400' : 'border-white/60'}`}
                />
              </div>
            )}

            {/* Scan success popup */}
            {scanSuccess && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 flex flex-col items-center gap-2 animate-fade-in">
                  <CheckCircle className="w-10 h-10 text-green-400" />
                  <p className="text-green-400 font-bold text-sm">สแกนสำเร็จ</p>
                  <p className="text-white text-xs font-mono">{scanSuccess}</p>
                </div>
              </div>
            )}

            {!loading && !scanSuccess && (
              <p className="absolute bottom-8 left-0 right-0 text-gray-400 text-xs text-center">
                เล็งกล้องไปที่บาร์โค้ด
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
