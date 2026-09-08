// Path: components/chat/SavedReplyModal.tsx
//
// สร้าง/แก้ข้อความสำเร็จรูป — **ตัวเดียวใช้ทั้งหน้าจัดการ (`/settings/saved-replies`)
// และปุ่ม "บันทึกข้อความนี้" ในหน้าแชท** เพื่อไม่ให้กติกา (ชื่อบังคับ · ต้องมีข้อความหรือรูป ·
// ชิปตัวแปร) หลุดกันสองที่
'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import FormInput from '@/components/ui/FormInput';
import ImageDropzone from '@/components/ui/ImageDropzone';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { storageKeyFor } from '@/lib/storage-key';
import { SAVED_REPLY_VARS } from '@/lib/chat/saved-reply-vars';
import type { SavedReply } from '@/lib/chat/saved-replies';

interface Props {
  open: boolean;
  onClose: () => void;
  /** ส่งมา = โหมดแก้ไข */
  reply?: SavedReply | null;
  /** ข้อความตั้งต้นตอนสร้างใหม่ (เช่นสิ่งที่พิมพ์ค้างไว้ในช่องแชท) */
  initialContent?: string;
  onSaved: (reply: SavedReply) => void;
}

export default function SavedReplyModal({ open, onClose, reply, initialContent, onSaved }: Props) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(reply?.title || '');
    setContent(reply?.content ?? initialContent ?? '');
    setExistingImage(reply?.image_url || null);
    setImageFile(null);
  }, [open, reply, initialContent]);

  /** แทรกโทเคนตรงตำแหน่งเคอร์เซอร์ ไม่ใช่ต่อท้าย — คนเขียนอยู่กลางประโยคจะได้ไม่ต้องย้ายเอง */
  const insertVar = (token: string) => {
    const el = contentRef.current;
    if (!el) { setContent(prev => prev + token); return; }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? start;
    const next = content.slice(0, start) + token + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    const t = title.trim();
    const c = content.trim();
    if (!t) { showToast('กรุณาตั้งชื่อข้อความสำเร็จรูป', 'error'); return; }
    if (!c && !imageFile && !existingImage) {
      showToast('ต้องมีข้อความหรือรูปอย่างน้อยอย่างใดอย่างหนึ่ง', 'error');
      return;
    }

    setSaving(true);
    try {
      let imageUrl = existingImage;

      if (imageFile) {
        // ชื่อไฟล์ต้องผ่าน storageKeyFor — ชื่อไทย/อีโมจิ/# ทำให้ Storage ตอบ 400 InvalidKey
        const path = `saved-replies/${storageKeyFor(imageFile.name, 'jpg')}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(path, imageFile, { contentType: imageFile.type || 'image/jpeg' });
        if (uploadError) throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${uploadError.message}`);
        imageUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
      }

      const res = await apiFetch('/api/chat/saved-replies', {
        method: reply ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reply?.id, title: t, content: c, image_url: imageUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

      showToast(reply ? 'แก้ไขข้อความสำเร็จรูปแล้ว' : 'บันทึกข้อความสำเร็จรูปแล้ว');
      onSaved(data.reply as SavedReply);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<MessageSquareText className="w-5 h-5" />}
      title={reply ? 'แก้ไขข้อความสำเร็จรูป' : 'บันทึกข้อความสำเร็จรูป'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <SaveButton onClick={save} loading={saving} />
        </div>
      }
    >
      <div className="px-6 py-5 space-y-4">
        <FormInput
          label="ชื่อเรียก"
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="เช่น ค่าส่ง, เลขบัญชี, ขอบคุณที่สั่งซื้อ"
          hint="ใช้ค้นหาตอนพิมพ์ / ในช่องแชท"
          maxLength={60}
        />

        <div>
          <label className="field-label block mb-1">ข้อความ</label>
          <textarea
            ref={contentRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="พิมพ์ข้อความที่ใช้ตอบลูกค้าบ่อย ๆ"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base"
          />
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="helper-text text-gray-500">แทรกตัวแปร:</span>
            {SAVED_REPLY_VARS.map(v => (
              <button
                key={v.token}
                type="button"
                title={v.hint}
                onClick={() => insertVar(v.token)}
                className="helper-text px-2 py-0.5 rounded-full border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors"
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="helper-text text-gray-500 mt-1">
            ระบบเติมค่าให้ตอนแทรกลงช่องพิมพ์ — ดูข้อความจริงก่อนกดส่งได้เสมอ
          </p>
        </div>

        <div>
          <label className="field-label block mb-1">รูปแนบ (ถ้ามี)</label>
          <ImageDropzone
            value={imageFile}
            onChange={setImageFile}
            initialPreviewUrl={existingImage}
            label="ลากรูปมาวาง หรือกดเพื่อเลือก"
            hint="เช่น รูปโปรโมชั่น · QR พร้อมเพย์ · แผนที่ร้าน"
            disabled={saving}
          />
          {existingImage && !imageFile && (
            <button
              type="button"
              onClick={() => setExistingImage(null)}
              className="helper-text text-red-600 hover:underline mt-1"
            >
              เอารูปออก
            </button>
          )}
          <p className="helper-text text-gray-500 mt-1">
            รูปจะถูกส่งตามหลังข้อความเมื่อกดส่งในหน้าแชท
          </p>
        </div>
      </div>
    </Modal>
  );
}
