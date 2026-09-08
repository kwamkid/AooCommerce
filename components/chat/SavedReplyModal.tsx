// Path: components/chat/SavedReplyModal.tsx
//
// สร้าง/แก้ข้อความสำเร็จรูป — **ตัวเดียวใช้ทั้งหน้าจัดการ (`/settings/saved-replies`)
// และปุ่มดินสอ/เพิ่มใหม่ในหน้าแชท** เพื่อไม่ให้กติกา (ชื่อบังคับ · ห้ามอักขระพิเศษ ·
// ห้ามซ้ำ · ต้องมีข้อความหรือรูป · ชิปตัวแปร) หลุดกันสองที่
//
// รูปแนบใช้ `ImageUploader` **โหมด staged** (ไม่ส่ง productId/variationId) ตัวเดียวกับหน้าสินค้า
// — โหมดนั้นย่อรูป/ลากเรียง/ลบ อยู่ในหน่วยความจำล้วน ไม่แตะ storage ไม่ยิง API ของสินค้าเลย
// เราจึงเอา `_stagedFile` ไปอัปขึ้น bucket `chat-media` เองตอนกดบันทึก
//
// **ไม่มีช่อง "ลิงก์" แยก** — ลิงก์พิมพ์ลงช่องข้อความได้เลยและไปเป็นข้อความเดียวกัน
// ช่องแยกทำให้เข้าใจผิดว่าระบบส่งลิงก์เป็นอีกข้อความหนึ่ง (เจ้าของทักมา 8 ก.ย. 2026)
//
// กติกาของชื่ออยู่ที่ [lib/chat/saved-replies.ts](../../lib/chat/saved-replies.ts) ตัวเดียว
// ที่ API ใช้ด้วย — หน้าจอจึงไม่มีทางบอกว่า "ใช้ได้" แล้วเซิร์ฟเวอร์ปฏิเสธ
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import FormInput from '@/components/ui/FormInput';
import ImageUploader, { type ProductImage } from '@/components/ui/ImageUploader';
import { useToast } from '@/lib/toast-context';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { storageKeyFor } from '@/lib/storage-key';
import { SAVED_REPLY_VARS } from '@/lib/chat/saved-reply-vars';
import {
  MAX_SAVED_REPLY_IMAGES, MAX_SAVED_REPLY_TITLE, SAVED_REPLY_TITLE_HINT,
  sanitizeSavedReplyTitle, hasDisallowedTitleChars, findDuplicateTitle,
  type SavedReply,
} from '@/lib/chat/saved-replies';

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
  const [images, setImages] = useState<ProductImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [charWarning, setCharWarning] = useState(false);
  /** รายชื่อทั้งหมดของบริษัท ไว้บอก "ชื่อนี้มีแล้ว" ตั้งแต่ตอนพิมพ์ (เซิร์ฟเวอร์ยังกันซ้ำอีกชั้น) */
  const [allReplies, setAllReplies] = useState<SavedReply[]>([]);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(reply?.title || '');
    setContent(reply?.content ?? initialContent ?? '');
    setImages((reply?.image_urls || []).map((url, i) => ({ image_url: url, sort_order: i })));
    setCharWarning(false);
    // อ่านทั้งคลัง (ไม่ใช่แค่ที่เปิดใช้) — ชื่อชนกับใบที่ปิดอยู่ก็ยังชน · apiFetch แคช 60 วิ
    apiFetch('/api/chat/saved-replies')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.replies) setAllReplies(d.replies as SavedReply[]); })
      .catch(() => {});
  }, [open, reply, initialContent]);

  /** กันอักขระต้องห้าม **ตั้งแต่ตอนพิมพ์** — ตัวที่พิมพ์ไม่ขึ้นต้องมีคำอธิบายเสมอ ไม่ใช่เงียบ */
  const onTitleChange = (raw: string) => {
    const clean = sanitizeSavedReplyTitle(raw);
    setCharWarning(hasDisallowedTitleChars(raw));
    setTitle(clean);
  };

  const duplicate = useMemo(
    () => findDuplicateTitle(allReplies, title, reply?.id),
    [allReplies, title, reply?.id],
  );

  /** แทรกโทเคนตรงตำแหน่งเคอร์เซอร์ ไม่ใช่ต่อท้าย — คนเขียนอยู่กลางประโยคจะได้ไม่ต้องย้ายเอง */
  const insertVar = (token: string) => {
    const el = contentRef.current;
    if (!el) { setContent(prev => prev + token); return; }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? start;
    setContent(content.slice(0, start) + token + content.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    const t = title.trim();
    const c = content.trim();
    if (!t) { showToast('กรุณาตั้งชื่อ Saved Reply', 'error'); return; }
    if (duplicate) { showToast(`มี Saved Reply ชื่อ "${duplicate.title}" อยู่แล้ว`, 'error'); return; }
    if (!c && images.length === 0) {
      showToast('ต้องมีข้อความหรือรูปอย่างน้อยอย่างใดอย่างหนึ่ง', 'error');
      return;
    }

    setSaving(true);
    try {
      // อัปเฉพาะใบที่เพิ่งเลือก (มี _stagedFile) — ใบเก่าคง URL เดิม
      // **วนตามลำดับใน images** เพราะลำดับที่ลากไว้คือลำดับที่จะส่งจริง
      const urls: string[] = [];
      for (const img of images) {
        const file = img._stagedFile;
        if (!file) { urls.push(img.image_url); continue; }
        // ชื่อไฟล์ต้องผ่าน storageKeyFor — ชื่อไทย/อีโมจิ/# ทำให้ Storage ตอบ 400 InvalidKey
        const path = `saved-replies/${storageKeyFor(img._originalName || file.name, 'jpg')}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(path, file, { contentType: file.type || 'image/jpeg' });
        if (uploadError) throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${uploadError.message}`);
        urls.push(supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl);
      }

      const res = await apiFetch('/api/chat/saved-replies', {
        method: reply ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reply?.id, title: t, content: c, image_urls: urls }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

      invalidateApiCache('/api/chat/saved-replies');
      showToast(reply ? 'แก้ไข Saved Reply แล้ว' : 'บันทึก Saved Reply แล้ว');
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
      title={reply ? 'แก้ไข Saved Reply' : 'บันทึก Saved Reply'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <SaveButton onClick={save} loading={saving} disabled={!!duplicate} />
        </div>
      }
    >
      <div className="px-6 py-5 space-y-4">
        <FormInput
          label="ชื่อเรียก"
          required
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="เช่น ค่าส่ง เลขบัญชี ขอบคุณ"
          error={duplicate ? `มีชื่อนี้อยู่แล้ว (${duplicate.title}) — ตั้งชื่ออื่นที่ไม่ซ้ำ` : undefined}
          hint={charWarning ? SAVED_REPLY_TITLE_HINT : 'พิมพ์ต่อจาก / ในช่องแชทเพื่อเรียกใช้ — ห้ามซ้ำกับใบอื่น'}
          maxLength={MAX_SAVED_REPLY_TITLE}
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
            ระบบเติมค่าให้ตอนแทรกลงช่องพิมพ์ — ดูข้อความจริงก่อนกดส่งได้เสมอ<br />
            แปะลิงก์ (คลิปยูทูป · หน้าสินค้า) ในข้อความนี้ได้เลย ไปเป็นข้อความเดียวกัน ไม่กินโควตาเพิ่ม
          </p>
        </div>

        <div>
          <label className="field-label block mb-1">รูปแนบ (ไม่เกิน {MAX_SAVED_REPLY_IMAGES} รูป)</label>
          {/* staged mode — ลากเรียงลำดับ/ลบ/ย่อรูป ได้จากตัวกลางเลย ไม่แตะ storage จนกดบันทึก */}
          <ImageUploader
            images={images}
            onImagesChange={setImages}
            maxImages={MAX_SAVED_REPLY_IMAGES}
            disabled={saving}
          />
          <p className="helper-text text-gray-500 mt-1">
            ส่งตามหลังข้อความตามลำดับที่เรียงไว้ (ลากสลับได้) · <b>รูป 1 ใบ = 1 ข้อความ</b> ของ LINE
            (แนบ {MAX_SAVED_REPLY_IMAGES} รูป = กินโควตา {MAX_SAVED_REPLY_IMAGES} ใบต่อลูกค้า 1 คน)
          </p>
        </div>
      </div>
    </Modal>
  );
}
