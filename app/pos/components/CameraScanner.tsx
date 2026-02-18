// Path: app/pos/components/CameraScanner.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, SwitchCamera } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface CameraScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function CameraScanner({ onScan, onClose }: CameraScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Keep callback ref up to date without re-triggering useEffect
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let stopped = false;
    let isRunning = false;
    const scannerId = 'pos-camera-scanner';

    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode },
          {
            fps: 10,
            qrbox: { width: 280, height: 160 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (!stopped) {
              stopped = true;
              isRunning = false;
              scanner.stop().catch(() => {});
              onScanRef.current(decodedText);
            }
          },
          () => {} // ignore errors during scanning
        );

        if (!stopped) {
          isRunning = true;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Permission') || msg.includes('denied')) {
          setError('กรุณาอนุญาตการใช้กล้อง');
        } else if (msg.includes('NotFound') || msg.includes('Requested device not found')) {
          setError('ไม่พบกล้อง');
        } else {
          setError('ไม่สามารถเปิดกล้องได้');
        }
      }
    };

    startScanner();

    return () => {
      stopped = true;
      if (scannerRef.current && isRunning) {
        isRunning = false;
        scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current = null;
    };
  }, [facingMode]);

  const toggleCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2 || state === 3) {
          await scannerRef.current.stop();
        }
      } catch {}
      scannerRef.current = null;
    }
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
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
      <div className="w-full max-w-sm px-4">
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
          <div className="relative">
            <div id="pos-camera-scanner" className="rounded-xl overflow-hidden" />
            <p className="text-gray-400 text-xs text-center mt-3">
              เล็งกล้องไปที่บาร์โค้ด
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
