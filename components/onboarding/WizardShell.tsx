'use client';

import { type ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const STEPS = [
  { key: 'channels',  label: 'ช่องทาง',  href: '/onboarding/setup' },
  { key: 'warehouse', label: 'คลัง',     href: '/onboarding/setup/warehouse' },
  { key: 'carriers',  label: 'ขนส่ง',    href: '/onboarding/setup/carriers' },
  { key: 'payment',   label: 'ชำระเงิน', href: '/onboarding/setup/payment' },
];

interface WizardShellProps {
  step: 1 | 2 | 3 | 4;
  /** Whether "Next" should be disabled (e.g. async submit running) */
  nextDisabled?: boolean;
  /** Async handler invoked when user clicks Next — return false to abort navigation */
  onNext: () => Promise<boolean | void>;
  /** Optional override for the next-step destination (defaults to STEPS[step].href) */
  nextHref?: string;
  children: ReactNode;
}

export default function WizardShell({ step, nextDisabled, onNext, nextHref, children }: WizardShellProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [skipAllOpen, setSkipAllOpen] = useState(false);
  const [skippingAll, setSkippingAll] = useState(false);

  const currentIdx = step - 1;
  const prevStep = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const next = nextHref || (currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1].href : '/onboarding/setup/complete');

  const handleNext = async () => {
    setSubmitting(true);
    try {
      const ok = await onNext();
      if (ok === false) return;
      router.push(next);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipAll = async () => {
    setSkippingAll(true);
    try {
      const res = await apiFetch('/api/onboarding/skip-all', { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'ข้ามไม่สำเร็จ');
      }
      router.push('/onboarding/setup/complete');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ข้ามไม่สำเร็จ', 'error');
      setSkippingAll(false);
      setSkipAllOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold">A</div>
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">AooCommerce</div>
              <div className="font-semibold text-gray-900 dark:text-white">ตั้งค่าเริ่มต้น</div>
            </div>
          </div>
          <button
            onClick={() => setSkipAllOpen(true)}
            disabled={submitting || skippingAll}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            ข้ามทั้งหมด
          </button>
        </div>

        {/* Progress */}
        <div className="max-w-4xl mx-auto px-6 pb-5">
          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const isCompleted = i < currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm transition-colors ${
                        isCompleted
                          ? 'bg-primary text-white'
                          : isCurrent
                          ? 'bg-primary text-white ring-4 ring-primary/20'
                          : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                    <div className={`mt-1.5 text-sm font-medium ${isCurrent ? 'text-primary' : 'text-gray-500 dark:text-slate-400'}`}>
                      {s.label}
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${i < currentIdx ? 'bg-primary' : 'bg-gray-200 dark:bg-slate-700'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 md:p-8">
          {children}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => prevStep && router.push(prevStep.href)}
            disabled={!prevStep || submitting}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            ย้อนกลับ
          </button>
          <button
            onClick={handleNext}
            disabled={nextDisabled || submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {step === 4 ? 'เสร็จสิ้น' : 'ถัดไป'}
            {!submitting && step !== 4 && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={skipAllOpen}
        onClose={() => !skippingAll && setSkipAllOpen(false)}
        onConfirm={handleSkipAll}
        title="ข้ามทั้งหมด?"
        description="ระบบจะใช้ค่าเริ่มต้นทั้งหมด (ขายปลีก, คลังหลัก, ขนส่งยอดนิยม, เงินสด) — ปรับเปลี่ยนภายหลังได้ที่หน้าตั้งค่า"
        confirmLabel="ข้ามและใช้ค่าเริ่มต้น"
        loading={skippingAll}
      />
    </div>
  );
}
