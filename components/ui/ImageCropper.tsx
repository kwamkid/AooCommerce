'use client';

/**
 * <ImageCropper /> — ครอบรูปแบบ Instagram: **กรอบอยู่กับที่ รูปลาก/ซูมข้างใน**
 *
 * ยกมาจาก aoosocial (`src/components/ui/image-cropper.tsx`) ตาม pattern กลาง
 * `aoo-techstack/ui/DROPZONE.md` — บทเรียนที่มากับของเดิม **ห้ามรื้อ**:
 *   • เคยลอง react-image-crop (ลากกล่องบนรูปนิ่ง) แล้วผู้ใช้สับสน → ใช้ react-easy-crop
 *   • `objectFit="contain"` เสมอ — โหมด cover ของไลบรารีคำนวณแกนผิดจนรูปยืด
 *   • smartcrop เลือกกรอบตั้งต้นให้ (เล็งใบหน้า/จุดเด่น) แล้วผู้ใช้ค่อยขยับเอง
 *
 * ต่างจากต้นฉบับ: ตัด i18n/ชิปหลายสัดส่วนออก (ที่นี่ปลายทางล็อกสัดส่วนเดียว
 * เช่นการ์ดชวนรับข่าวสารของ Messenger ที่บังคับ 1:1)
 */

import { useCallback, useEffect, useState } from 'react';
import { AddIcon, RemoveIcon } from '@/lib/icons';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import smartcrop from 'smartcrop';
import Button from './Button';

interface Props {
  /** object URL / data URL ของรูปต้นฉบับ */
  src: string;
  /** สัดส่วนกรอบ (กว้าง/สูง) — 1 = จัตุรัส */
  aspect: number;
  /** ด้านยาวสุดของไฟล์ที่ครอบเสร็จ (px) */
  outputSize?: number;
  quality?: number;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.2;

export default function ImageCropper({
  src, aspect, outputSize = 1080, quality = 0.9, onConfirm, onCancel,
}: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [seedArea, setSeedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  // smartcrop เลือกกรอบตั้งต้นให้ก่อน — react-easy-crop แปลงเป็น (crop, zoom) เอง
  // ผ่าน initialCroppedAreaPixels ไม่ต้องคำนวณเอง
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let cw = img.naturalWidth;
      let ch = cw / aspect;
      if (ch > img.naturalHeight) {
        ch = img.naturalHeight;
        cw = ch * aspect;
      }
      smartcrop.crop(img, { width: cw, height: ch })
        .then(({ topCrop }) => {
          if (!cancelled) setSeedArea({ x: topCrop.x, y: topCrop.y, width: topCrop.width, height: topCrop.height });
        })
        // smartcrop พังก็ปล่อยให้ cropper จัดกลางเอง — ไม่ใช่เรื่องที่ต้องบอกผู้ใช้
        .catch(() => { if (!cancelled) setSeedArea(null); });
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, aspect]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => setAreaPixels(pixels), []);

  const handleConfirm = async () => {
    if (!areaPixels) return;
    setBusy(true);
    try {
      const blob = await renderCroppedBlob(src, areaPixels, outputSize, quality);
      if (blob) onConfirm(blob);
    } finally {
      setBusy(false);
    }
  };

  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

  return (
    <div className="grid gap-4">
      <div className="flex justify-center">
        <div
          className="relative w-full max-w-[380px] bg-gray-900 rounded-lg overflow-hidden"
          style={{ aspectRatio: String(aspect) }}
        >
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            minZoom={ZOOM_MIN}
            maxZoom={ZOOM_MAX}
            objectFit="contain"
            restrictPosition
            showGrid
            // remount เมื่อ seed เปลี่ยน — prop นี้อ่านครั้งเดียวตอน mount
            key={seedArea ? JSON.stringify(seedArea) : 'center'}
            initialCroppedAreaPixels={seedArea ?? undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="subtitle-text">ซูม</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))}
          disabled={zoom <= ZOOM_MIN}
          aria-label="ซูมออก"
        >
          <RemoveIcon className="w-4 h-4" />
        </Button>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.01}
          value={zoom}
          onChange={e => setZoom(clampZoom(Number(e.target.value)))}
          className="flex-1 accent-primary"
          aria-label="ระดับการซูม"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))}
          disabled={zoom >= ZOOM_MAX}
          aria-label="ซูมเข้า"
        >
          <AddIcon className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>ยกเลิก</Button>
        <Button variant="primary" onClick={handleConfirm} loading={busy} disabled={!areaPixels}>
          ใช้รูปนี้
        </Button>
      </div>
    </div>
  );
}

/** วาดส่วนที่เลือกลง canvas แล้วคืนเป็นไฟล์จริง (`area` เป็นพิกเซลของรูปต้นฉบับ) */
export async function renderCroppedBlob(
  src: string, area: Area, outputSize: number, quality: number,
): Promise<Blob | null> {
  const img = await loadImage(src);
  const ratio = area.width / area.height;
  const outW = ratio >= 1 ? outputSize : Math.round(outputSize * ratio);
  const outH = ratio >= 1 ? Math.round(outputSize / ratio) : outputSize;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', quality));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
