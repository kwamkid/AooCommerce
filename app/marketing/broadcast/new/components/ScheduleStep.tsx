// Path: app/marketing/broadcast/new/components/ScheduleStep.tsx
//
// การ์ด "ส่งเมื่อไหร่" ของขั้นที่ 2 — ส่งทันที หรือให้ระบบส่งให้เองตามเวลาที่ตั้ง
//
// เวลาที่ผู้ใช้เห็นต้องเป็นเวลาที่ระบบจะส่งจริง (formatThaiDateTime ของค่าที่คำนวณแล้ว)
// ไม่ใช่แค่ค่าที่พิมพ์ลงสองช่องแยกกัน — ตั้งผิดวันแล้วรู้ตัวตอนลูกค้าได้ข้อความคือสายไป
'use client';

import Card from '@/components/ui/Card';
import Radio from '@/components/ui/Radio';
import DateRangePicker, { type DateValueType } from '@/components/ui/DateRangePicker';
import TimePicker from '@/components/ui/TimePicker';
import { formatThaiDateTime } from '@/lib/utils/format';

export type SendMode = 'now' | 'schedule';

interface Props {
  mode: SendMode;
  onModeChange: (m: SendMode) => void;
  date: DateValueType;
  onDateChange: (v: DateValueType) => void;
  time: string;
  onTimeChange: (v: string) => void;
  /** เวลาที่ประกอบจากวัน+เวลาแล้ว — null = ยังเลือกไม่ครบ */
  scheduledAt: Date | null;
  /** เหตุที่ตั้งเวลานี้ไม่ได้ (เร็วเกิน/ไกลเกิน/ยังไม่เลือก) */
  error: string | null;
  disabled?: boolean;
}

export default function ScheduleStep({
  mode, onModeChange, date, onDateChange, time, onTimeChange, scheduledAt, error, disabled,
}: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const modeCard = (value: SendMode, label: string, hint: string) => (
    <Radio
      checked={mode === value}
      onChange={() => onModeChange(value)}
      disabled={disabled}
      className={`choice-card flex-1 !items-start px-3 py-2.5 ${mode === value ? 'choice-card-active' : ''}`}
    >
      <span className="min-w-0">
        <span className="block body-text text-gray-900 dark:text-white">{label}</span>
        <span className="block helper-text text-gray-500 dark:text-slate-400 mt-0.5">{hint}</span>
      </span>
    </Radio>
  );

  return (
    <Card padding="md">
      <h2 className="heading-4 mb-3">ส่งเมื่อไหร่</h2>

      <div className="flex flex-col sm:flex-row gap-2">
        {modeCard('now', 'ส่งทันที', 'เริ่มส่งทันทีที่กดยืนยัน')}
        {modeCard('schedule', 'ตั้งเวลา', 'ระบบส่งให้เองตามเวลาที่ตั้ง')}
      </div>

      {mode === 'schedule' && (
        <div className="mt-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="sm:w-48">
              <DateRangePicker
                value={date}
                onChange={onDateChange}
                asSingle
                useRange={false}
                showShortcuts={false}
                showFooter={false}
                minDate={today}
                disabled={disabled}
                placeholder="เลือกวันที่"
              />
            </div>
            <div className="sm:w-40">
              <TimePicker value={time} onChange={onTimeChange} disabled={disabled} />
            </div>
          </div>

          {error ? (
            <p className="helper-text text-red-600 dark:text-red-400 mt-2">{error}</p>
          ) : (
            <p className="helper-text text-gray-500 dark:text-slate-400 mt-2">
              ระบบจะเริ่มส่ง {formatThaiDateTime(scheduledAt)} น. · ยกเลิกได้จนถึงก่อนเวลาส่ง
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
