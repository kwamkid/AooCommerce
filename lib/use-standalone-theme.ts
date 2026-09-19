'use client';

// หน้าที่อยู่นอกแอป (บิลออนไลน์ · พอร์ทัลคู่ค้า · หน้ารับของด้วยลิงก์) สลับธีมเอง
// ด้วย state ของตัวเอง ไม่ได้ใช้ธีมของแอด — แต่ component กลางทั้งระบบใช้ `dark:`
// ของ Tailwind ซึ่งอ่านจาก class `dark` บน ancestor (`darkMode: 'class'`)
//
// ⛔ ปัญหาที่เกิดถ้าไม่ sync: แอดมินตั้งแอปเป็นโหมดมืด แล้วเปิดบิลโหมดสว่าง →
//    ป้ายสถานะ/ปุ่ม/แถบขั้นตอน ใช้สีชุดมืด (ตัวอักษรสว่าง) บนพื้นสว่าง อ่านไม่ออก
//    (เจ้าของท้วง 18–19 ก.ย. 2026) · เดิมต้องไล่ส่ง prop `dark` ให้ทุก component
//    แล้วเขียนสีเองสองชุด ซึ่งไล่ไม่มีวันครบ
//
// hook นี้ทำให้ class `dark` บน <html> ตรงกับธีมที่หน้านั้น**แสดงจริง** — component
// กลางจึงได้สีถูกเองทั้งหมด และคืนค่าเดิมให้แอปเมื่อออกจากหน้า

import { useEffect } from 'react';

export function useStandaloneTheme(dark: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains('dark');
    root.classList.toggle('dark', dark);
    return () => { root.classList.toggle('dark', had); };
  }, [dark]);
}
