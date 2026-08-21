// Path: components/dev/ColorLab.tsx
// แผงลองสีสด ๆ บนหน้าจริง — โหมด dev เท่านั้น
//
// ทำไมต้องมี: เวลาจะเลือกสีสักจุด ถ้าต้องไล่แก้โค้ด → รอ compile → รีเฟรช → ดู
// รอบละครึ่งนาที ลองสามสีก็หมดอารมณ์แล้ว · แผงนี้เขียนทับ CSS variable ตรง ๆ
// เห็นผลทันทีในหน้าที่ใช้งานจริง (ไม่ใช่หน้า showcase ที่บริบทไม่เหมือนของจริง)
//
// ⚠️ ไม่ render ใน production เด็ดขาด — เช็ค NODE_ENV ก่อนเสมอ
// ⚠️ มันแค่ทับค่าในเบราว์เซอร์ ไม่ได้แก้โค้ด · เลือกได้แล้วเอาค่าไปแก้ในโค้ดจริง
//
// เพิ่มจุดที่ลองสีได้: ทำให้จุดนั้นอ่านสีผ่าน var(--ชื่อ, ค่าเดิม) แล้วมาเพิ่มใน TARGETS
'use client';

import { useEffect, useState } from 'react';

interface Swatch { name: string; value: string }
interface Target {
  /** ชื่อ CSS variable ที่จะทับ เช่น --op-current */
  cssVar: string;
  label: string;
  /** ค่าที่ใช้อยู่จริงในโค้ด (ค่า fallback ของ var) */
  current: string;
  swatches: Swatch[];
}

const TARGETS: Target[] = [
  {
    cssVar: '--op-current',
    label: 'แถบสถานะ · ขั้นที่กำลังทำอยู่',
    current: '#e2725b',
    swatches: [
      { name: 'terracotta อ่อน (ใช้อยู่)', value: '#e2725b' },
      { name: 'เทาเข้ม', value: '#1f2937' },
      { name: 'น้ำเงิน', value: '#2563eb' },
      { name: 'คราม', value: '#4f46e5' },
      { name: 'เขียวน้ำทะเล', value: '#0d9488' },
      { name: 'อำพัน', value: '#b45309' },
      { name: 'ม่วง', value: '#7c3aed' },
      { name: 'ชมพูเข้ม', value: '#be185d' },
      { name: 'ฟ้าเข้ม', value: '#0369a1' },
      // terracotta — โทนดินเผา ใกล้สีแบรนด์แต่หม่นกว่า เลยไม่อ่านเป็น error
      { name: 'terracotta', value: '#c65d45' },
      { name: 'terracotta เข้ม', value: '#a64b2a' },
    ],
  },
  {
    cssVar: '--op-current-ink',
    label: 'แถบสถานะ · ตัวเลขบนจุดที่กำลังทำ',
    current: '#3f1a0d',
    swatches: [
      { name: 'น้ำตาลเข้ม', value: '#3f1a0d' },
      { name: 'ขาว', value: '#ffffff' },
      { name: 'ดำ', value: '#111827' },
    ],
  },
  {
    cssVar: '--op-done',
    label: 'แถบสถานะ · ขั้นที่ผ่านแล้ว',
    current: '#059669',
    swatches: [
      { name: 'เขียวมิ้นต์', value: '#059669' },
      { name: 'เขียว', value: '#15803d' },
      { name: 'เขียวเข้ม', value: '#166534' },
      { name: 'เทา', value: '#6b7280' },
    ],
  },
  {
    cssVar: '--sf-primary',
    label: 'สีแบรนด์ของร้าน (ทั้งหน้าร้าน)',
    current: 'ตามที่ร้านตั้งไว้',
    swatches: [
      { name: 'ส้มอิฐ', value: '#F4511E' },
      { name: 'แดงเชอร์รี่', value: '#c0392b' },
      { name: 'เขียวป่า', value: '#166534' },
      { name: 'น้ำเงินเข้ม', value: '#1e3a8a' },
    ],
  },
];

const STORE_KEY = 'aoo-colorlab';

export default function ColorLab() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});

  // จำค่าที่เลือกไว้ข้ามการรีเฟรช — กำลังเทียบสีอยู่แล้วหายทุกครั้งที่เซฟโค้ดคือฝันร้าย
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, string>;
      setPicked(saved);
      for (const [k, v] of Object.entries(saved)) document.documentElement.style.setProperty(k, v);
    } catch { /* ไม่มีค่าเดิมก็ไม่เป็นไร */ }
  }, []);

  const apply = (cssVar: string, value: string | null) => {
    setPicked(prev => {
      const next = { ...prev };
      if (value) {
        next[cssVar] = value;
        document.documentElement.style.setProperty(cssVar, value);
      } else {
        delete next[cssVar];
        document.documentElement.style.removeProperty(cssVar);
      }
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* โควตาเต็มก็ช่าง */ }
      return next;
    });
  };

  if (process.env.NODE_ENV !== 'development') return null;

  // มุมขวาล่าง — ซ้ายล่างเป็นที่ของปุ่ม dev tools ของ Next.js (ตัว N)
  // วางทับกันแล้วปุ่มเราจมหายไปข้างใต้ หาไม่เจอ
  const box: React.CSSProperties = {
    position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000,
    fontFamily: 'system-ui, sans-serif', fontSize: 13, color: '#111827',
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="ลองสี (dev เท่านั้น)"
        style={{
          ...box, width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: '#111827', color: '#fff', fontSize: 17, boxShadow: '0 2px 10px rgba(0,0,0,.3)',
        }}
      >
        ◑
      </button>
    );
  }

  return (
    <div style={{ ...box, width: 268, background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.25)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
        <strong style={{ flex: 1, fontSize: 13 }}>ลองสี (dev)</strong>
        <button
          type="button"
          onClick={() => { for (const t of TARGETS) apply(t.cssVar, null); }}
          style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}
        >
          รีเซ็ต
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '10px 12px 12px' }}>
        {TARGETS.map(t => (
          <div key={t.cssVar} style={{ marginBottom: 14 }}>
            <div style={{ color: '#374151', marginBottom: 6, fontSize: 12.5 }}>{t.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {t.swatches.map(sw => {
                const on = picked[t.cssVar] === sw.value;
                return (
                  <button
                    key={sw.value}
                    type="button"
                    title={`${sw.name} ${sw.value}`}
                    onClick={() => apply(t.cssVar, sw.value)}
                    style={{
                      width: 26, height: 26, borderRadius: 7, cursor: 'pointer', background: sw.value,
                      border: on ? '2px solid #111827' : '1px solid rgba(0,0,0,.12)',
                      outline: on ? '2px solid #fff' : 'none', outlineOffset: -4,
                    }}
                  />
                );
              })}
              <input
                type="color"
                value={picked[t.cssVar] || (t.current.startsWith('#') ? t.current : '#888888')}
                onChange={e => apply(t.cssVar, e.target.value)}
                title="เลือกสีเอง"
                style={{ width: 26, height: 26, padding: 0, border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, background: 'none', cursor: 'pointer' }}
              />
            </div>
            <div style={{ marginTop: 5, fontSize: 11.5, color: '#6b7280', fontFamily: 'ui-monospace, monospace' }}>
              {picked[t.cssVar] || `ค่าปัจจุบัน ${t.current}`}
            </div>
          </div>
        ))}
        <p style={{ margin: 0, fontSize: 11.5, color: '#9ca3af', lineHeight: 1.5 }}>
          ทับเฉพาะในเบราว์เซอร์นี้ ไม่ได้แก้โค้ด — เลือกได้แล้วบอกค่าสีมา เดี๋ยวแก้ให้ถาวร
        </p>
      </div>
    </div>
  );
}
