// Path: app/pos/components/CameraScanner.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, SwitchCamera, Loader2 } from 'lucide-react';

interface CameraScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

// Check if native BarcodeDetector is available
function hasNativeBarcodeDetector(): boolean {
  return typeof globalThis !== 'undefined' && 'BarcodeDetector' in globalThis;
}

export default function CameraScanner({ onScan, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Cleanup stream helper
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let animFrameId: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let html5Scanner: any = null;

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

        if (hasNativeBarcodeDetector()) {
          // ===== NATIVE PATH (Chrome / Android) =====
          const video = videoRef.current!;
          video.srcObject = stream;
          await video.play();
          setLoading(false);

          // @ts-expect-error — BarcodeDetector is not in TS lib yet
          const detector = new globalThis.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'qr_code'],
          });

          scanningRef.current = true;

          const scanLoop = async () => {
            if (cancelled || !scanningRef.current) return;
            try {
              const barcodes = await detector.detect(video);
              if (barcodes.length > 0 && !cancelled) {
                scanningRef.current = false;
                stopStream();
                onScanRef.current(barcodes[0].rawValue);
                return;
              }
            } catch {
              // detect can throw if video not ready yet, ignore
            }
            animFrameId = requestAnimationFrame(scanLoop);
          };

          animFrameId = requestAnimationFrame(scanLoop);
        } else {
          // ===== FALLBACK PATH (iOS / Safari) — use html5-qrcode =====
          // Stop our direct stream since html5-qrcode manages its own
          stream.getTracks().forEach(t => t.stop());
          streamRef.current = null;

          const { Html5Qrcode } = await import('html5-qrcode');
          const scanner = new Html5Qrcode('pos-camera-scanner-fallback', { verbose: false });
          html5Scanner = scanner;

          await scanner.start(
            { facingMode },
            { fps: 20, qrbox: { width: 300, height: 150 }, disableFlip: false },
            (decodedText: string) => {
              if (!cancelled) {
                cancelled = true;
                scanner.stop().catch(() => {});
                onScanRef.current(decodedText);
              }
            },
            () => {}
          );

          if (!cancelled) setLoading(false);
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
      if (animFrameId) cancelAnimationFrame(animFrameId);
      stopStream();
      if (html5Scanner) {
        try {
          const state = html5Scanner.getState();
          if (state === 2 || state === 3) html5Scanner.stop().catch(() => {});
        } catch {}
      }
    };
  }, [facingMode, stopStream]);

  const toggleCamera = useCallback(() => {
    scanningRef.current = false;
    stopStream();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, [stopStream]);

  const useNative = hasNativeBarcodeDetector();

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

            {useNative ? (
              /* Native BarcodeDetector — direct video element */
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
                {/* Scan guide overlay */}
                {!loading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[300px] h-[150px] border-2 border-white/60 rounded-lg" />
                  </div>
                )}
              </>
            ) : (
              /* Fallback html5-qrcode */
              <>
                <style jsx>{`
                  #pos-camera-scanner-fallback {
                    width: 100% !important;
                    flex: 1;
                  }
                  #pos-camera-scanner-fallback video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover;
                  }
                  #pos-camera-scanner-fallback > div > img,
                  #pos-camera-scanner-fallback__header_message,
                  #pos-camera-scanner-fallback__dashboard {
                    display: none !important;
                  }
                `}</style>
                <div id="pos-camera-scanner-fallback" className="w-full flex-1" />
              </>
            )}

            {!loading && (
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
