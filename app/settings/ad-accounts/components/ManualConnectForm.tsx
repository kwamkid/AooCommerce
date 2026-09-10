// Path: app/settings/ad-accounts/components/ManualConnectForm.tsx
// กรอกบัญชีโฆษณาเอง — ทางที่สองที่ต้องมีเสมอ ไม่ใช่ของสำรอง
//
// Login Facebook เห็นเฉพาะบัญชีที่ผู้ใช้เป็นแอดมินใน Business ของตัวเอง · บัญชีที่อยู่
// ใน Business ของเอเจนซี/ลูกค้า หรือช่วงที่แอปยังไม่ผ่าน App Review จะไม่โผล่มาเลย
// — ทางเดียวที่ร้านแบบนั้นใช้ได้คือ System User token ที่กรอกเอง
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, Zap } from 'lucide-react';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FormInput from '@/components/ui/FormInput';
import SaveButton from '@/components/ui/SaveButton';
import StepNumber from '@/components/ui/StepNumber';
import { useFormValidation } from '@/lib/useFormValidation';
import { META_ADS_MANAGER_URL, META_EVENTS_MANAGER_URL, stripActPrefix } from '@/lib/ads/meta-ui';

export interface ManualConnectValues {
  name: string;
  external_id: string;
  dataset_id: string;
  access_token: string;
}

export interface ManualConnectErrors {
  /** ข้อความรวมของฟอร์ม (เช่น บัญชีนี้เชื่อมอยู่แล้ว) */
  form?: string | null;
  external_id?: string | null;
  dataset_id?: string | null;
  access_token?: string | null;
}

interface Props {
  saving: boolean;
  errors: ManualConnectErrors;
  /** มี App ID ถึงจะกลับไปใช้ Login Facebook ได้ */
  showBackToOauth: boolean;
  onBackToOauth: () => void;
  onCancel: () => void;
  onSubmit: (values: ManualConnectValues) => void;
}

function GuideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 mt-1 text-primary hover:underline"
    >
      <ExternalLink className="w-3.5 h-3.5" /> {children}
    </a>
  );
}

export default function ManualConnectForm({
  saving, errors, showBackToOauth, onBackToOauth, onCancel, onSubmit,
}: Props) {
  const form = useFormValidation();
  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const handleSubmit = () => {
    if (!form.validateAll()) return;
    onSubmit({
      name: name.trim(),
      external_id: stripActPrefix(externalId),
      dataset_id: datasetId.trim(),
      access_token: token.trim(),
    });
  };

  return (
    <Card>
      <div className="space-y-4">
        <h3 className="heading-3 text-gray-900 dark:text-white">กรอกข้อมูลบัญชีโฆษณาเอง</h3>

        <Alert tone="info">
          <span className="subtitle-text">
            ใช้เมื่อกด Login แล้วไม่เห็นบัญชี (บัญชีอยู่ใน Business ของคนอื่น หรือแอปยังไม่ผ่าน App Review)
            {' · '}
            token จาก Events Manager ใช้ส่ง event ได้แต่ sync กลุ่มเป้าหมายไม่ได้ — ต้องเป็น System User token
          </span>
        </Alert>

        {errors.form && <Alert tone="danger"><span className="subtitle-text">{errors.form}</span></Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput
            label="ชื่อที่ใช้เรียกในระบบ"
            value={name}
            onChange={e => setName(e.target.value)}
            hint="ไม่บังคับ — เว้นว่างจะใช้ชื่อจาก Meta"
            containerClassName="sm:col-span-2"
          />
          <FormInput
            ref={form.register('external_id')}
            label="Ad Account ID"
            required
            value={externalId}
            onChange={e => setExternalId(e.target.value)}
            validate={v => (/^\d+$/.test(stripActPrefix(v)) ? null : 'กรอกเฉพาะตัวเลข (ตัดคำว่า act_ ออกให้เองได้)')}
            error={errors.external_id || undefined}
            hint="ตัวเลขหลัง act_"
            placeholder="1234567890"
          />
          <FormInput
            ref={form.register('dataset_id')}
            label="Dataset ID"
            required
            value={datasetId}
            onChange={e => setDatasetId(e.target.value)}
            pattern="^\d+$"
            patternMessage="กรอกเฉพาะตัวเลข"
            error={errors.dataset_id || undefined}
            hint="Events Manager › Data sources"
            placeholder="1234567890"
          />
          <FormInput
            ref={form.register('access_token')}
            label="Access Token"
            required
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={e => setToken(e.target.value)}
            error={errors.access_token || undefined}
            containerClassName="sm:col-span-2"
            postfix={
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                aria-label={showToken ? 'ซ่อน token' : 'แสดง token'}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => setGuideOpen(v => !v)}
            className="flex items-center gap-2 subtitle-text text-gray-500 dark:text-slate-400 hover:text-primary transition-colors"
          >
            <Zap className="w-4 h-4 text-primary" />
            <span>วิธีหาข้อมูล</span>
            {guideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {guideOpen && (
            <div className="mt-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-3 subtitle-text text-gray-600 dark:text-slate-300">
              <div className="flex gap-3">
                <StepNumber number={1} />
                <div>
                  <p className="field-label text-gray-900 dark:text-white">หา Dataset ID</p>
                  <p>Events Manager &rarr; เลือก Dataset &rarr; Settings &rarr; คัดลอก Dataset ID</p>
                  <GuideLink href={META_EVENTS_MANAGER_URL}>เปิด Events Manager</GuideLink>
                </div>
              </div>
              <div className="flex gap-3">
                <StepNumber number={2} />
                <div>
                  <p className="field-label text-gray-900 dark:text-white">สร้าง Access Token</p>
                  <p>ในหน้าเดิม แท็บ Settings &rsaquo; Conversions API &rsaquo; &ldquo;Generate access token&rdquo; &rarr; คัดลอกเก็บไว้</p>
                </div>
              </div>
              <div className="flex gap-3">
                <StepNumber number={3} />
                <div>
                  <p className="field-label text-gray-900 dark:text-white">หา Ad Account ID</p>
                  <p>Ads Manager มุมซ้ายบน — เลขหลัง act_</p>
                  <GuideLink href={META_ADS_MANAGER_URL}>เปิด Ads Manager</GuideLink>
                </div>
              </div>
              <div className="flex gap-3">
                <StepNumber number={4} />
                <div>
                  <p className="field-label text-gray-900 dark:text-white">ต้องการ sync กลุ่มเป้าหมายด้วย</p>
                  <p>
                    Business Settings &rsaquo; System Users &rsaquo; สร้าง System User (Admin)
                    &rsaquo; Assign assets (บัญชีโฆษณา + Dataset) &rsaquo; Generate token
                    เลือกสิทธิ์ ads_management, ads_read, business_management
                  </p>
                  <p className="mt-1">แล้วใช้ token ใบนี้แทนใบจากขั้นที่ 2</p>
                </div>
              </div>
              <div className="flex gap-3">
                <StepNumber number={5} />
                <div>
                  <p className="field-label text-gray-900 dark:text-white">บันทึกแล้วกดทดสอบ</p>
                  <p>ระบบจะบอกว่า token ใบนี้ทำอะไรได้บ้าง (ส่ง event / sync กลุ่มเป้าหมาย)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {showBackToOauth && (
          <button
            type="button"
            onClick={onBackToOauth}
            className="subtitle-text text-gray-500 hover:text-primary transition-colors underline"
          >
            กลับไปใช้ Login with Facebook
          </button>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>ยกเลิก</Button>
          <SaveButton loading={saving} onClick={handleSubmit} />
        </div>
      </div>
    </Card>
  );
}
