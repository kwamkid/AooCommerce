'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Page title (h1) — text or any node */
  title: ReactNode;
  /** Optional subtitle/description shown below the title */
  subtitle?: ReactNode;
  /** When set, shows a back arrow that navigates here. Pass empty string or `back="-1"` for router.back(). */
  backHref?: string;
  /** Element rendered on the right side of the header (buttons, badges, etc.) */
  actions?: ReactNode;
  /** Optional icon shown left of the title */
  icon?: ReactNode;
  /** เผื่อหน้าที่ไม่ได้อยู่ใน Container (ไม่มี space-y ให้) ต้องเว้นระยะเอง */
  className?: string;
}

/**
 * หัวข้อหน้ามาตรฐานของทุกหน้า — ปุ่มย้อนกลับ + (ไอคอน + หัวข้อ + คำอธิบาย) + ปุ่มฝั่งขวา
 *
 * ใช้ทุกหน้า ไม่ใช่เฉพาะหน้าย่อย: หน้าหลักไม่ต้องส่ง backHref แล้วจะได้หัวข้อขนาดใหญ่
 * หน้าย่อยส่ง backHref แล้วจะได้ปุ่มย้อนกลับ + หัวข้อเล็กลงหนึ่งขั้น
 *
 * ⚠️ ห้ามเขียนหัวข้อหน้าเองด้วย <h1 className="heading-1"> อีก — ที่ผ่านมาแต่ละหน้า
 * วางไอคอน/คำอธิบาย/ขนาดต่างกันจนดูเหมือนคนละระบบ
 */
export default function PageHeader({ title, subtitle, backHref, actions, icon, className = '' }: PageHeaderProps) {
  const router = useRouter();
  const handleBack = () => {
    if (backHref === '-1' || backHref === '') {
      router.back();
    } else if (backHref) {
      router.push(backHref);
    }
  };

  return (
    // flex-1 min-w-0 = ยอมให้ย่อได้เวลาไปอยู่ใน flex row ที่มีปุ่มเป็นพี่น้องข้าง ๆ
    // (ถ้าไม่ใส่ หัวข้อยาว ๆ จะดันปุ่มตกขอบจอมือถือ) · ระดับหน้าปกติไม่มีผล
    <div className={`flex flex-1 min-w-0 items-start justify-between gap-3${className ? ` ${className}` : ''}`}>
      <div className="flex items-start gap-3 min-w-0">
        {backHref !== undefined && (
          <button
            onClick={handleBack}
            aria-label="ย้อนกลับ"
            className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
        )}
        {icon && <div className="flex-shrink-0 pt-1 [&>svg]:w-8 [&>svg]:h-8 text-primary">{icon}</div>}
        <div className="min-w-0">
          {/* หน้าหลัก (ไม่มีปุ่มย้อนกลับ) ใช้หัวข้อใหญ่ · หน้าย่อยใช้เล็กลงหนึ่งขั้น
              เป็นลำดับชั้นที่ตั้งไว้ใน CLAUDE.md — คุมจากที่นี่ที่เดียว หน้าไหน ๆ
              ก็ไม่ต้องเลือกขนาดเอง */}
          <h1 className={backHref === undefined ? 'heading-1 truncate' : 'heading-2 truncate'}>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
