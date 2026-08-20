// Path: components/ui/MapAddressPicker.tsx
// เลือกที่อยู่จัดส่งด้วยการปักหมุดบนแผนที่ แล้วอ่านที่อยู่กลับมาเอง (reverse geocode)
//
// รูปแบบ "หมุดอยู่กลางจอ เลื่อนแผนที่แทน" แบบเดียวกับแอปส่งอาหาร — บนมือถือ
// ลากหมุดเล็ก ๆ ยาก แต่ลากแผนที่ง่าย และไม่ต้องพึ่ง Marker API ที่ Google ทยอย deprecate
//
// สิ่งที่ได้กลับมาคือ "พิกัด + ที่อยู่ไทยที่ normalize แล้ว" (ดู lib/thai-geocode.ts)
// เพราะปลายทางคือ resolveZone() ที่จับคู่โซนด้วยรหัสไปรษณีย์/อำเภอ/จังหวัดเป็นข้อความ
//
// ⚠️ reverse geocode ในไทยได้ละเอียดสุดแค่ระดับถนน/ตำบล — บ้านเลขที่ ซอย ชื่อหมู่บ้าน
// Google ไม่มีให้ ต้องมีช่องให้ลูกค้าพิมพ์เองเสมอ ห้ามเอาแผนที่ไปแทนช่องที่อยู่ทั้งหมด
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseThaiGeocode, buildMapsLink, type GeocodeComponent, type ParsedThaiAddress } from '@/lib/thai-geocode';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

/** ไม่มีคีย์ = ไม่ต้อง render แผนที่ ให้ฟอร์มถอยไปใช้ช่องกรอกที่อยู่ปกติ */
export const mapPickerEnabled = !!MAPS_KEY;

/** อนุสาวรีย์ชัยฯ — ใช้เป็นจุดตั้งต้นเมื่อยังไม่รู้ว่าลูกค้าอยู่ไหน */
const DEFAULT_CENTER = { lat: 13.7649, lng: 100.5383 };

export interface PickedPlace extends ParsedThaiAddress {
  lat: number;
  lng: number;
  maps_link: string;
}

// ── minimal typing ของ Google Maps JS API เท่าที่ใช้ (โปรเจกต์ไม่ได้ลง @types/google.maps) ──
interface GLatLng { lat(): number; lng(): number }
interface GMapInstance {
  addListener(event: string, handler: () => void): void;
  getCenter(): GLatLng | undefined;
  panTo(latLng: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
}
interface GGeocodeResult {
  address_components: GeocodeComponent[];
  formatted_address: string;
  geometry: { location: GLatLng };
}
interface GGeocoderInstance {
  geocode(request: Record<string, unknown>): Promise<{ results: GGeocodeResult[] }>;
}
interface GoogleMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMapInstance;
  Geocoder: new () => GGeocoderInstance;
}

let mapsLoader: Promise<GoogleMapsApi> | null = null;

function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<GoogleMapsApi>((resolve, reject) => {
    const w = window as unknown as {
      google?: { maps?: GoogleMapsApi };
      __aooMapsReady?: () => void;
    };
    if (w.google?.maps) { resolve(w.google.maps); return; }

    w.__aooMapsReady = () => {
      if (w.google?.maps) resolve(w.google.maps);
      else reject(new Error('maps api missing after load'));
    };
    const script = document.createElement('script');
    script.src =
      'https://maps.googleapis.com/maps/api/js'
      + `?key=${encodeURIComponent(MAPS_KEY)}`
      + '&language=th&region=TH&loading=async&callback=__aooMapsReady';
    script.async = true;
    script.onerror = () => reject(new Error('maps script failed'));
    document.head.appendChild(script);
  });
  // โหลดพลาด (คีย์ผิด/โดนบล็อก) → ล้าง cache ให้ลองใหม่รอบหน้าได้
  mapsLoader.catch(() => { mapsLoader = null; });
  return mapsLoader;
}

/** ระยะห่างคร่าว ๆ เป็นเมตร — ใช้กันยิง geocode ซ้ำตอนแผนที่ขยับนิดเดียว */
function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

interface Props {
  /** พิกัดที่เลือกไว้แล้ว (ถ้ามี) — ใช้ตั้งจุดเริ่มต้นของแผนที่ */
  value?: { lat: number; lng: number } | null;
  onPick: (place: PickedPlace) => void;
  /**
   * ข้อความพื้นที่ที่ลูกค้าเลือกไว้ (ตำบล อำเภอ จังหวัด) — ใช้เลื่อนแผนที่ไปแถวนั้นให้
   * ก่อนที่ลูกค้าจะเริ่มลาก · พอลากเองแล้วจะไม่ตามอีก (หมุดที่ลากเองสำคัญกว่า)
   */
  centerHint?: string;
  height?: number;
  /** โหลดแผนที่ไม่ได้ (คีย์ผิด/ออฟไลน์) — ให้ฟอร์มถอยไปวิธีเดิม */
  onUnavailable?: () => void;
}

export default function MapAddressPicker({ value, onPick, centerHint, height = 260, onUnavailable }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMapInstance | null>(null);
  const geocoderRef = useRef<GGeocoderInstance | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointRef = useRef<{ lat: number; lng: number } | null>(null);
  const touchedRef = useRef(false);      // ลูกค้าขยับแผนที่เองแล้วหรือยัง
  const hintRef = useRef('');
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reading, setReading] = useState(false);
  const [label, setLabel] = useState('');
  const [locating, setLocating] = useState(false);

  const runReverse = useCallback(async (point: { lat: number; lng: number }) => {
    const geocoder = geocoderRef.current;
    if (!geocoder) return;
    setReading(true);
    try {
      const { results } = await geocoder.geocode({ location: point, language: 'th', region: 'TH' });
      const hit = results?.[0];
      const parsed = hit
        ? parseThaiGeocode(hit.address_components)
        : { address: '', district: '', amphoe: '', province: '', postal_code: '', matched: false };
      setLabel(
        [parsed.district, parsed.amphoe, parsed.province, parsed.postal_code].filter(Boolean).join(' ')
        || hit?.formatted_address
        || 'อ่านที่อยู่จากหมุดนี้ไม่ได้ — กรอกพื้นที่เองด้านล่างได้',
      );
      onPickRef.current({ ...parsed, lat: point.lat, lng: point.lng, maps_link: buildMapsLink(point.lat, point.lng) });
    } catch {
      // geocode ล้มไม่ใช่เรื่องคอขาดบาดตาย — พิกัดยังใช้ได้ คนส่งของกดลิงก์ไปได้อยู่ดี
      setLabel('อ่านที่อยู่จากหมุดไม่สำเร็จ — พิกัดถูกบันทึกแล้ว กรอกพื้นที่เองด้านล่างได้');
      onPickRef.current({
        address: '', district: '', amphoe: '', province: '', postal_code: '', matched: false,
        lat: point.lat, lng: point.lng, maps_link: buildMapsLink(point.lat, point.lng),
      });
    } finally {
      setReading(false);
    }
  }, []);

  // ── สร้างแผนที่ครั้งเดียว ──────────────────────────────────────────
  useEffect(() => {
    if (!MAPS_KEY || mapRef.current) return;
    let cancelled = false;

    loadGoogleMaps().then(maps => {
      if (cancelled || !boxRef.current || mapRef.current) return;
      const start = value || DEFAULT_CENTER;
      const map = new maps.Map(boxRef.current, {
        center: start,
        zoom: value ? 17 : 15,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',   // มือถือเลื่อนนิ้วเดียวได้ ไม่ต้องสองนิ้ว
        clickableIcons: false,
      });
      mapRef.current = map;
      geocoderRef.current = new maps.Geocoder();
      setReady(true);

      map.addListener('dragstart', () => { touchedRef.current = true; });
      map.addListener('idle', () => {
        const c = map.getCenter();
        if (!c) return;
        const point = { lat: c.lat(), lng: c.lng() };
        // ขยับไม่ถึง 15 เมตร ถือว่าจุดเดิม — ไม่ต้องเสียค่า geocode ซ้ำ
        if (lastPointRef.current && metersBetween(lastPointRef.current, point) < 15) return;
        lastPointRef.current = point;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => runReverse(point), 500);
      });
    }).catch(() => {
      if (cancelled) return;
      setFailed(true);
      onUnavailable?.();
    });

    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
    // ตั้งค่าครั้งเดียวตอน mount — value/centerHint จัดการใน effect ถัดไป
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ลูกค้าเลือกตำบล/อำเภอไว้ก่อน → เลื่อนแผนที่ไปแถวนั้นให้ ──────────
  useEffect(() => {
    const hint = (centerHint || '').trim();
    if (!ready || !hint || touchedRef.current || hint === hintRef.current) return;
    hintRef.current = hint;
    geocoderRef.current?.geocode({ address: `${hint} ประเทศไทย`, region: 'TH', language: 'th' })
      .then(({ results }) => {
        const loc = results?.[0]?.geometry?.location;
        if (!loc || touchedRef.current || !mapRef.current) return;
        mapRef.current.panTo({ lat: loc.lat(), lng: loc.lng() });
        mapRef.current.setZoom(15);
      })
      .catch(() => { /* หาไม่เจอก็ปล่อยแผนที่ไว้ที่เดิม */ });
  }, [centerHint, ready]);

  const useMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        touchedRef.current = true;
        mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setZoom(17);
        setLocating(false);
      },
      () => { setLocating(false); setLabel('เปิดสิทธิ์ตำแหน่งไม่ได้ — เลื่อนแผนที่หาบ้านเองได้เลย'); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  if (!MAPS_KEY || failed) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          position: 'relative', height, borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(0,0,0,.12)', background: '#eceff1',
        }}
      >
        <div ref={boxRef} style={{ position: 'absolute', inset: 0 }} />

        {/* หมุดกลางจอ — ไม่รับคลิก ให้ลากแผนที่ผ่านมันได้ */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-100%)',
            pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))',
          }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="#F4511E">
            <path d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z" />
            <circle cx="12" cy="9" r="2.6" fill="#fff" />
          </svg>
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={!ready || locating}
          style={{
            position: 'absolute', right: 10, bottom: 10, zIndex: 2,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 999, border: 'none',
            background: '#fff', color: '#1f2937', fontSize: 14, fontWeight: 500,
            boxShadow: '0 1px 4px rgba(0,0,0,.3)', cursor: ready ? 'pointer' : 'default',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F4511E" strokeWidth="2">
            <circle cx="12" cy="12" r="7" />
            <path d="M12 1v3M12 20v3M1 12h3M20 12h3" strokeLinecap="round" />
          </svg>
          {locating ? 'กำลังหาตำแหน่ง…' : 'ตำแหน่งฉัน'}
        </button>
      </div>

      <p style={{ margin: '6px 2px 0', fontSize: 14, color: '#4b5563', lineHeight: 1.5 }}>
        {reading ? 'กำลังอ่านที่อยู่จากหมุด…' : (label || 'เลื่อนแผนที่ให้หมุดตรงหน้าบ้าน')}
      </p>
    </div>
  );
}
