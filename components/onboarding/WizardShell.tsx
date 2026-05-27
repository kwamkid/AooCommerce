'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { useToast } from '@/lib/toast-context';
import { useCompany } from '@/lib/company-context';
import { WIZARD_KEYS } from '@/components/onboarding/wizard-storage';
import { useWizardPackage } from '@/components/onboarding/use-wizard-package';

type StepKey = 'company' | 'channels' | 'warehouse' | 'carriers' | 'payment';

const ALL_STEPS: { key: StepKey; label: string; href: string }[] = [
  { key: 'company',   label: 'บริษัท',   href: '/onboarding/setup' },
  { key: 'channels',  label: 'ช่องทาง',  href: '/onboarding/setup/channels' },
  { key: 'warehouse', label: 'คลัง',     href: '/onboarding/setup/warehouse' },
  { key: 'carriers',  label: 'ขนส่ง',    href: '/onboarding/setup/carriers' },
  { key: 'payment',   label: 'ชำระเงิน', href: '/onboarding/setup/payment' },
];

interface WizardShellProps {
  /** 1-based position in the full 5-step flow. The warehouse step is filtered
   *  out when the active package doesn't support stock (e.g. Free). */
  step: 1 | 2 | 3 | 4 | 5;
  /** Whether "Next" should be disabled (e.g. async submit running) */
  nextDisabled?: boolean;
  /** Async handler invoked when user clicks Next — return false to abort navigation */
  onNext: () => Promise<boolean | void>;
  /** Optional override for the next-step destination (defaults to next visible step) */
  nextHref?: string;
  /** Custom label for the Next button on the last step (default: "เสร็จสิ้น") */
  finishLabel?: string;
  children: ReactNode;
}

// Read just the saved company name/logo from sessionStorage so WizardShell
// can preview them in the header even before /api/onboarding/finalize runs.
function useWizardCompanyPreview(): { name: string; logoDataUrl: string | null } {
  const [preview, setPreview] = useState<{ name: string; logoDataUrl: string | null }>({ name: '', logoDataUrl: null });

  // Re-read on each render via a tick — keeps the header in sync after the
  // company step writes its form to sessionStorage. The cheap path is the
  // initial-mount read; a 1s poll catches changes from other routes.
  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem(WIZARD_KEYS.company);
        if (!raw) {
          setPreview({ name: '', logoDataUrl: null });
          return;
        }
        const parsed = JSON.parse(raw);
        setPreview({
          name: (parsed?.name as string | undefined) || '',
          logoDataUrl: (parsed?.logoDataUrl as string | null | undefined) || null,
        });
      } catch { /* ignore */ }
    };
    read();
    const interval = setInterval(read, 1000);
    return () => clearInterval(interval);
  }, []);
  return preview;
}

export default function WizardShell({ step, nextDisabled, onNext, nextHref, finishLabel, children }: WizardShellProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { currentCompany, companies } = useCompany();
  const { stockEnabled } = useWizardPackage();
  const wizardPreview = useWizardCompanyPreview();
  const [submitting, setSubmitting] = useState(false);

  // Prefer the in-progress wizard's own logo/name (sessionStorage) over the
  // current company — the wizard creates the company only at finalize, so
  // currentCompany may be a previously-selected company, not the new one.
  const companyName = wizardPreview.name || currentCompany?.name || 'AooCommerce';
  const logoSrc = wizardPreview.logoDataUrl || currentCompany?.logo_url || null;
  const initial = (companyName.trim().charAt(0) || 'A').toUpperCase();

  // Hide the warehouse step when the package doesn't support stock.
  // The 1-based `step` prop refers to the full flow's index; we map it
  // to the visible position in `steps`.
  const STEPS = stockEnabled ? ALL_STEPS : ALL_STEPS.filter(s => s.key !== 'warehouse');
  const currentKey = ALL_STEPS[step - 1]?.key;
  const currentIdx = STEPS.findIndex(s => s.key === currentKey);
  const prevStep = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const next = nextHref || (currentIdx >= 0 && currentIdx < STEPS.length - 1
    ? STEPS[currentIdx + 1].href
    : '/onboarding/setup/complete');
  const isLastStep = currentIdx === STEPS.length - 1;

  // Escape hatch — on step 1, if the user has existing companies they may
  // want to abandon this wizard and pick a different company. The /onboarding
  // page would loop back to the wizard for users with zero companies, so we
  // only show this when there's somewhere meaningful to go.
  const canExitToPicker = currentIdx === 0 && companies.length > 0;
  const handleBack = () => {
    if (prevStep) router.push(prevStep.href);
    else if (canExitToPicker) router.push('/onboarding');
  };

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt={companyName}
                className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center font-bold">
                {initial}
              </div>
            )}
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">{companyName}</div>
              <div className="font-semibold text-gray-900 dark:text-white">ตั้งค่าเริ่มต้น</div>
            </div>
          </div>
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
            onClick={handleBack}
            disabled={(!prevStep && !canExitToPicker) || submitting}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {canExitToPicker && !prevStep ? 'กลับไปเลือกบริษัท' : 'ย้อนกลับ'}
          </button>
          <button
            onClick={handleNext}
            disabled={nextDisabled || submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isLastStep ? (finishLabel || 'เสร็จสิ้น') : 'ถัดไป'}
            {!submitting && !isLastStep && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
