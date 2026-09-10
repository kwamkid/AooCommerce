// Path: app/marketing/broadcast/new/components/ContentStep.tsx
//
// การ์ด "สิ่งที่จะส่ง" ของขั้นที่ 2 — เลือกชนิดเนื้อหา (ชนิดกลาง ไม่ใช่ศัพท์ของ LINE)
// แล้วกรอกตามชนิดนั้น · ลิมิตทุกตัวมาจาก `compose` (ค่าที่แคบที่สุดของช่องทางที่เลือก)
// ห้าม hardcode ซ้ำที่นี่
'use client';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import OptionCards, { type OptionCardItem } from '@/components/ui/OptionCards';
import ImageDropzone from '@/components/ui/ImageDropzone';
import MessageComposer from '@/components/ui/MessageComposer';
import ChipsInput from '@/components/ui/ChipsInput';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { formatPrice } from '@/lib/utils/format';
import {
  BUTTON_LABEL_MAX,
  CARD_TEXT_MAX,
  EMPTY_ACTION,
  discountPercent,
  type BroadcastAction,
  type BroadcastButton,
  type BroadcastProductCard,
} from '@/lib/broadcast/content';
import type { BroadcastCompose, BroadcastContentKind } from '@/lib/broadcast/platforms';
import { Plus, Trash2 } from 'lucide-react';
import { KIND_MOCKS, MockImage, MockLine } from './KindMockups';
import ActionPicker from './ActionPicker';
import { newGalleryDraft, type GalleryDraft } from './types';

/** ชื่อชนิดเนื้อหา — หน้าสร้างเอาไปสรุปในแผงขวาด้วย จึง export ออกไป */
export const KIND_LABELS: Record<BroadcastContentKind, string> = {
  announce: 'รูปธรรมดา',
  poster: 'รูปเต็มจอ',
  gallery: 'รูปหลายใบ',
  // ถอดจากตัวเลือกแล้ว (10 ก.ย. 2026) — เหลือชื่อไว้ให้ใบเก่าในรายการ/รายงาน
  promo: 'โปรโมชัน',
  products: 'สินค้า',
};

/**
 * การ์ดเลือกชนิดเนื้อหา — พรีวิวเป็นห้องแชทจำลองทั้งใบจาก KindMockups (placeholder คงที่
 * ไม่ใช่รูปของร่าง) เพราะตรงนี้ผู้ใช้ยังไม่ได้กรอกอะไร ต้องเห็นก่อนว่าแต่ละแบบหน้าตาเป็นยังไง
 */
const KIND_CARDS: Record<BroadcastContentKind, { label: string; description: string; preview: React.ReactNode }> = {
  announce: { label: KIND_LABELS.announce, description: 'รูปในฟองแชท (+ ข้อความ)', preview: KIND_MOCKS.announce },
  poster: { label: KIND_LABELS.poster, description: 'รูปเต็มความกว้าง กดแล้วไปต่อได้', preview: KIND_MOCKS.poster },
  gallery: { label: KIND_LABELS.gallery, description: 'เลื่อนดู แต่ละใบกดแล้วไปต่อได้', preview: KIND_MOCKS.gallery },
  promo: { label: KIND_LABELS.promo, description: 'หัวข้อ + ข้อความ + ปุ่ม', preview: KIND_MOCKS.promo },
  products: { label: KIND_LABELS.products, description: 'ดึงจากคลัง มีปุ่มสั่งซื้อ', preview: KIND_MOCKS.products },
};

/** การ์ดสินค้าแสดงยังไง — เลื่อนดูได้ทั้งคู่ ต่างกันที่ "มีตัวหนังสือใต้รูปไหม" */
function cardStyleCards(sampleImageUrl: string | null): OptionCardItem<'image' | 'detail'>[] {
  return [
    {
      id: 'image',
      label: 'รูปเต็ม',
      description: 'รูป + ราคาลอยบนรูป กดไปลิงก์',
      preview: (
        // ใบที่สองโผล่มาครึ่งเดียว = เลื่อนดูต่อได้ (กรอบพรีวิวครอบส่วนเกินให้เอง)
        <div className="w-full h-full p-2 flex items-center gap-1">
          <div className="relative flex-shrink-0">
            <MockImage src={sampleImageUrl} className="w-14 h-14 rounded-lg" />
            <div className="absolute bottom-1 left-3 right-3 h-1.5 rounded-full bg-black/60" />
          </div>
          <MockImage src={sampleImageUrl} className="w-14 h-14 rounded-lg flex-shrink-0" />
        </div>
      ),
    },
    {
      id: 'detail',
      label: 'มีชื่อ + ปุ่ม',
      description: 'รูป + ชื่อ + ราคา + ปุ่มสั่งเลย',
      preview: (
        <div className="w-full h-full p-2 flex items-center justify-center">
          <div className="w-12 rounded-lg bg-white dark:bg-slate-800 overflow-hidden">
            <MockImage src={sampleImageUrl} className="w-12 h-12" />
            <div className="p-1 space-y-1">
              <MockLine />
              <MockLine className="w-2/3" />
              <div className="h-1.5 rounded bg-line" />
            </div>
          </div>
        </div>
      ),
    },
  ];
}

interface Props {
  compose: BroadcastCompose;
  /** ชื่อช่องทางที่ใช้ในข้อความอธิบายข้อจำกัด */
  platformLabel: string;
  /** LINE เท่านั้น — เตือนว่าการ์ดสวย ๆ ไม่ได้กินโควตามากกว่าข้อความเปล่า */
  showCreditNote: boolean;

  kind: BroadcastContentKind;
  onKindChange: (k: BroadcastContentKind) => void;
  title: string;
  onTitleChange: (v: string) => void;
  text: string;
  onTextChange: (v: string) => void;

  imageFile: File | null;
  onImageFileChange: (f: File | null) => void;
  /** รูปของใบที่คัดลอกมา — โชว์เป็นพรีวิวจนกว่าจะเลือกไฟล์ใหม่ */
  existingImageUrl: string | null;
  /** รูปที่เห็นอยู่ตอนนี้ (blob ของไฟล์ที่เพิ่งเลือก หรือรูปเดิม) — เอาไปวาดในการ์ดตัวเลือกด้วย */
  imagePreviewUrl: string | null;
  /** โปสเตอร์: กดรูปแล้วเกิดอะไร (ทะเบียนกลาง BroadcastAction) */
  tapAction: BroadcastAction;
  onTapActionChange: (a: BroadcastAction) => void;
  /** รูปหลายใบ — หน้าเป็นเจ้าของ (สร้าง/คืน object URL + วัดขนาดเอง) */
  gallery: GalleryDraft[];
  onGalleryChange: (items: GalleryDraft[]) => void;
  /** แปลงผลค้นหาเป็นการ์ดสินค้า (ตัวเดียวกับที่การ์ดสินค้าใช้) */
  productToCard: (p: ProductSearchItem) => BroadcastProductCard;
  /** ร้านเปิดหน้าร้านออนไลน์แล้วไหม — "ไปที่สินค้า" ของโปสเตอร์ใช้ได้เฉพาะตอนเปิดแล้ว */
  storefrontOpen: boolean;
  /** การ์ดสินค้า: รูปเต็ม หรือมีชื่อ+ปุ่ม */
  cardStyle: 'image' | 'detail';
  onCardStyleChange: (v: 'image' | 'detail') => void;

  buttons: BroadcastButton[];
  onButtonsChange: (b: BroadcastButton[]) => void;
  cards: BroadcastProductCard[];
  onCardsChange: (c: BroadcastProductCard[]) => void;
  quickReplies: string[];
  onQuickRepliesChange: (q: string[]) => void;

  productResults: ProductSearchItem[];
  productLoading: boolean;
  onProductSearch: (q: string) => void;
  onAddProduct: (p: ProductSearchItem) => void;

  disabled?: boolean;
}

export default function ContentStep({
  compose, platformLabel, showCreditNote,
  kind, onKindChange, title, onTitleChange, text, onTextChange,
  imageFile, onImageFileChange, existingImageUrl, imagePreviewUrl,
  tapAction, onTapActionChange, gallery, onGalleryChange, productToCard, storefrontOpen, cardStyle, onCardStyleChange,
  buttons, onButtonsChange, cards, onCardsChange, quickReplies, onQuickRepliesChange,
  productResults, productLoading, onProductSearch, onAddProduct,
  disabled,
}: Props) {
  const textMax = kind === 'promo' ? CARD_TEXT_MAX : compose.bodyMax;

  const textField = (
    <FormTextarea
      label={kind === 'products' ? 'ข้อความเกริ่น (ไม่บังคับ)' : kind === 'promo' ? 'ข้อความบนการ์ด' : 'ข้อความ'}
      value={text}
      onChange={e => onTextChange(e.target.value)}
      maxLength={textMax}
      rows={kind === 'announce' ? 5 : 3}
      placeholder="พิมพ์ข้อความที่จะส่งถึงลูกค้า"
      disabled={disabled}
    />
  );

  const imageLabel = kind === 'promo' ? 'แบนเนอร์ (ไม่บังคับ)' : 'รูปภาพ (ไม่บังคับ)';

  const dropzone = (
    <ImageDropzone
      value={imageFile}
      onChange={onImageFileChange}
      initialPreviewUrl={existingImageUrl}
      disabled={disabled}
      label="ลากรูปมาวาง หรือกดเพื่อเลือก"
      // ย่อทั้งพิกเซลและขนาดไฟล์ก่อนอัป — รูปใหญ่กว่านี้ LINE ไม่รับ และเปลืองที่เก็บ
      maxWidthOrHeight={1024}
      maxSizeMB={0.3}
    />
  );

  const imageField = compose.image && kind !== 'products' && (
    <div>
      <p className="field-label mb-1">{imageLabel}</p>
      {dropzone}
      {kind === 'promo' && (
        <p className="subtitle-text mt-1">
          ส่งเป็นสัดส่วนตามรูปจริง (แนวตั้งได้ สูงสุด 3 เท่าของความกว้าง)
        </p>
      )}
    </div>
  );

  /** ของที่ ActionPicker ทุกตัวต้องใช้เหมือนกัน (ค้นสินค้า · สถานะหน้าร้าน) */
  const pickerProps = { storefrontOpen, productResults, productLoading, onProductSearch, productToCard, disabled };

  /** รูปแนบของกล่องรูป — ประกาศกับโปสเตอร์ใช้ชุดเดียวกัน ต่างกันแค่ป้ายและแถบล่าง */
  const composerImage = compose.image ? {
    file: imageFile,
    onChange: onImageFileChange,
    previewUrl: imagePreviewUrl || existingImageUrl,
    // ย่อทั้งพิกเซลและขนาดไฟล์ก่อนอัป — รูปใหญ่กว่านี้ LINE ไม่รับ และเปลืองที่เก็บ
    maxWidthOrHeight: 1024,
    maxSizeMB: 0.3,
  } : undefined;

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="heading-4">สิ่งที่จะส่ง</h2>
        {showCreditNote && (
          <span className="section-desc text-right">
            การ์ดที่มีรูป หัวข้อ และปุ่ม นับเป็น 1 ข้อความเท่าข้อความเปล่า
          </span>
        )}
      </div>

      {compose.kinds.length > 1 && (
        <div className="mb-4">
          {/* พรีวิวใหญ่ = ห้องแชทจำลองทั้งใบ · คอลัมน์ = จำนวนชนิดที่ช่องทางนี้ส่งได้ (LINE 4 · TikTok 2) */}
          <OptionCards<BroadcastContentKind>
            value={kind}
            onChange={onKindChange}
            disabled={disabled}
            previewSize="lg"
            columns={compose.kinds.length}
            options={compose.kinds.map(k => ({ id: k, ...KIND_CARDS[k] }))}
          />
        </div>
      )}

      <div className="space-y-4">
        {/* หัวข้อ — TikTok บังคับ (โปรโมชันวาดหัวข้อในเลย์เอาต์ของตัวเอง · โปสเตอร์ไม่มีหัวข้อ) */}
        {kind !== 'poster' && kind !== 'promo' && compose.titleMax && (
          <FormInput
            label="หัวข้อ"
            required
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            maxLength={compose.titleMax}
            disabled={disabled}
            placeholder="หัวข้อที่ลูกค้าเห็นก่อน"
            hint={`${title.length}/${compose.titleMax}`}
          />
        )}

        {/* โปรโมชัน = การ์ดใบเดียว: แบนเนอร์ซ้าย หัวข้อ+ข้อความขวา (เจ้าของกำหนด 10 ก.ย. 2026) */}
        {kind === 'promo' ? (
          <div className="grid md:grid-cols-[260px_minmax(0,1fr)] gap-4">
            {imageField}
            <div className="space-y-3">
              <FormInput
                label="หัวข้อ"
                required={!!compose.titleMax}
                value={title}
                onChange={e => onTitleChange(e.target.value)}
                maxLength={compose.titleMax ?? 40}
                disabled={disabled}
                placeholder="หัวข้อบนการ์ด"
                hint={`${title.length}/${compose.titleMax ?? 40}`}
              />
              {textField}
            </div>
          </div>
        ) : kind === 'poster' ? (
          // โปสเตอร์ = เลย์เอาต์เดียวกับประกาศ (ข้อความ แล้วตามด้วยรูป) ต่างตรงรูปกว้างเต็มจอและกดแล้วไปต่อได้
          // (ชิปในแถบล่างของกล่องรูป) — เจ้าของกำหนด 10 ก.ย. 2026
          <div className="space-y-3">
            <p className="subtitle-text">
              ส่งถึงลูกค้าเป็นข้อความแยกกัน เรียงตามลำดับนี้ · โปสเตอร์กว้างเต็มห้องแชทตามสัดส่วนรูป — ข้อความ ราคา ปุ่ม ที่อยากให้เห็นบนรูปต้องอยู่ในรูป
            </p>
            <MessageComposer
              label="1. ข้อความ (ไม่บังคับ)"
              value={text}
              onChange={onTextChange}
              maxLength={textMax}
              rows={3}
              placeholder="พิมพ์ข้อความที่จะส่งก่อนโปสเตอร์"
              disabled={disabled}
            />
            <MessageComposer
              label="2. โปสเตอร์ (รูปเต็มจอ)"
              emptyHint="แนะนำแนวตั้ง 4:5 เช่น 1080×1350 px (ระบบย่อเหลือ 819×1024 ตามเพดานของ LINE) · สูงได้ไม่เกิน 3 เท่าของความกว้าง"
              disabled={disabled}
              image={composerImage}
            />
            <ActionPicker label="กดรูปแล้ว" value={tapAction} onChange={onTapActionChange} {...pickerProps} />
          </div>
        ) : kind === 'announce' && compose.image ? (
          // ประกาศส่งถึงลูกค้าเป็น 2 ฟองแยกกัน (ข้อความ แล้วตามด้วยรูป) → ฟอร์มก็เป็น 2 กล่องแยกกัน
          // ในลำดับเดียวกัน — เคยรวมเป็นกล่องเดียวแล้วเจ้าของบอกคนจะเข้าใจผิดว่าเป็นฟองเดียว (10 ก.ย.)
          <div className="space-y-3">
            {/* บอกครั้งเดียวว่าเป็นคนละข้อความ — หัวกล่องเหลือแค่เลขลำดับ (เจ้าของเลือกจาก 4 แบบ 10 ก.ย.) */}
            <p className="subtitle-text">ส่งถึงลูกค้าเป็นข้อความแยกกัน เรียงตามลำดับนี้</p>
            <MessageComposer
              label="1. ข้อความ"
              value={text}
              onChange={onTextChange}
              maxLength={textMax}
              rows={4}
              placeholder="พิมพ์ข้อความที่จะส่งถึงลูกค้า"
              disabled={disabled}
            />
            <MessageComposer
              label="2. รูป (ไม่บังคับ)"
              emptyHint="ไม่แนบ = ส่งเฉพาะข้อ 1"
              disabled={disabled}
              image={composerImage}
            />
          </div>
        ) : kind === 'gallery' && compose.image ? (
          // รูปหลายใบเลื่อนดู — ข้อความนำหน้า แล้วรูปทุกใบอยู่ในแถวเดียว แต่ละใบมี "กดแล้วเกิดอะไร" ของตัวเอง
          <div className="space-y-3">
            <p className="subtitle-text">
              ส่งถึงลูกค้าเป็นข้อความแยกกัน เรียงตามลำดับนี้ · รูปทุกใบอยู่ในแถวเดียวเลื่อนดูได้ — แนะนำสัดส่วนเดียวกันทุกใบ (แนวตั้ง 4:5)
            </p>
            <MessageComposer
              label="1. ข้อความ (ไม่บังคับ)"
              value={text}
              onChange={onTextChange}
              maxLength={textMax}
              rows={3}
              placeholder="พิมพ์ข้อความที่จะส่งก่อนรูป"
              disabled={disabled}
            />
            <div>
              <p className="field-label mb-1">2. รูป (สูงสุด {compose.imagesMax} ใบ) — แต่ละใบกดแล้วไปต่อได้</p>
              <div className="space-y-2">
                {gallery.map((g, i) => (
                  <div key={g.id} className="rounded-lg border border-gray-200 dark:border-slate-600 p-3 flex gap-3 items-start">
                    <div className="w-40 flex-shrink-0">
                      <ImageDropzone
                        value={g.file}
                        onChange={f => onGalleryChange(gallery.map(x => x.id === g.id ? { ...x, file: f, ...(f ? {} : { existingUrl: null }) } : x))}
                        initialPreviewUrl={g.existingUrl}
                        disabled={disabled}
                        label="เลือกรูป"
                        hint="แนะนำ 4:5"
                        changeOnClick
                        maxWidthOrHeight={1024}
                        maxSizeMB={0.3}
                        classNames={{ previewImg: 'w-full h-auto rounded-lg object-cover' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <ActionPicker
                        label={`กดรูปที่ ${i + 1} แล้ว`}
                        value={g.action}
                        onChange={action => onGalleryChange(gallery.map(x => x.id === g.id ? { ...x, action } : x))}
                        {...pickerProps}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      icon={<Trash2 className="w-4 h-4" />}
                      aria-label={`เอารูปที่ ${i + 1} ออก`}
                      disabled={disabled}
                      onClick={() => onGalleryChange(gallery.filter(x => x.id !== g.id))}
                    />
                  </div>
                ))}
              </div>
              {gallery.length < compose.imagesMax && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  disabled={disabled}
                  className="mt-2"
                  onClick={() => onGalleryChange([...gallery, newGalleryDraft()])}
                >
                  เพิ่มรูป
                </Button>
              )}
            </div>
          </div>
        ) : kind === 'products' ? (
          // สินค้า — ข้อความนำหน้า (ไม่บังคับ) แล้วการ์ดสินค้าอยู่บล็อกถัดไป
          <MessageComposer
            label="1. ข้อความ (ไม่บังคับ)"
            value={text}
            onChange={onTextChange}
            maxLength={textMax}
            rows={3}
            placeholder="พิมพ์ข้อความที่จะส่งก่อนการ์ดสินค้า"
            disabled={disabled}
          />
        ) : (
          // ช่องทางที่แนบรูปไม่ได้ (TikTok) — เหลือแค่ข้อความ
          <>
            {textField}
            {imageField}
          </>
        )}

        {!compose.image && (
          <p className="subtitle-text">
            {platformLabel} รับเฉพาะข้อความล้วน (แนบรูปไม่ได้)
          </p>
        )}

        {/* ปุ่มกด — แต่ละปุ่ม: ป้าย + "กดแล้วเกิดอะไร" ชุดเดียวกับรูปโปสเตอร์ (ActionPicker) */}
        {kind === 'promo' && compose.buttonsMax > 0 && (
          <div>
            <p className="field-label mb-1">ปุ่มกด (สูงสุด {compose.buttonsMax})</p>
            <p className="subtitle-text mb-2">
              ปุ่มแรกคือปุ่มหลัก (สีทึบ) และรูปหัวการ์ดกดแล้วทำเหมือนปุ่มแรก
            </p>
            <div className="space-y-2">
              {buttons.map((b, i) => (
                <div key={i} className="rounded-lg border border-gray-200 dark:border-slate-600 p-3 space-y-3">
                  <div className="flex gap-2 items-start">
                    <div className="w-56 flex-shrink-0">
                      <FormInput
                        value={b.label}
                        maxLength={BUTTON_LABEL_MAX}
                        disabled={disabled}
                        placeholder={i === 0 ? 'เช่น สั่งเลย' : 'เช่น ดูรายละเอียด'}
                        aria-label={`ข้อความบนปุ่มที่ ${i + 1}`}
                        onChange={e => onButtonsChange(buttons.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      />
                    </div>
                    {buttons.length > 1 && (
                      <Button
                        variant="ghost"
                        icon={<Trash2 className="w-4 h-4" />}
                        aria-label="ลบปุ่ม"
                        disabled={disabled}
                        className="ml-auto"
                        onClick={() => onButtonsChange(buttons.filter((_, j) => j !== i))}
                      />
                    )}
                  </div>
                  <ActionPicker
                    value={b.action ?? EMPTY_ACTION}
                    onChange={action => onButtonsChange(buttons.map((x, j) => j === i ? { ...x, action } : x))}
                    {...pickerProps}
                  />
                </div>
              ))}
            </div>
            {buttons.length < compose.buttonsMax && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                disabled={disabled}
                className="mt-2"
                onClick={() => onButtonsChange([...buttons, { label: '', action: EMPTY_ACTION }])}
              >
                เพิ่มปุ่ม
              </Button>
            )}
          </div>
        )}

        {/* การ์ดสินค้า */}
        {kind === 'products' && (
          <div>
            <div className="mb-3">
              <OptionCards<'image' | 'detail'>
                label="รูปแบบการ์ด"
                value={cardStyle}
                onChange={onCardStyleChange}
                disabled={disabled}
                layout="horizontal"
                columns={2}
                options={cardStyleCards(cards[0]?.image_url ?? null)}
              />
            </div>
            <p className="field-label mb-1">2. สินค้า (สูงสุด {compose.productsMax} ชิ้น)</p>
            <p className="subtitle-text mb-2">
              ชื่อ รูป ราคา ดึงจากคลังให้เอง · ใบเดียวส่งเป็นการ์ดใหญ่เต็มจอ หลายใบเป็นแถวเลื่อนดู ·
              ปุ่ม &quot;สั่งเลย&quot; ไปหน้าสินค้าเมื่อร้านเปิดหน้าร้านออนไลน์ · ยังไม่เปิด = &quot;สนใจสินค้านี้&quot;
              ส่งข้อความเข้าแชท · ใส่ลิงก์เองได้ที่ช่องท้ายรายการ
            </p>
            {cards.length >= compose.productsMax ? (
              <p className="subtitle-text">
                ครบ {compose.productsMax} ชิ้นแล้ว — เอาออกก่อนถ้าจะเปลี่ยน
              </p>
            ) : (
              <ProductSearchInput
                products={productResults}
                loading={productLoading}
                onSearchChange={onProductSearch}
                onSelect={onAddProduct}
                isDisabled={p => cards.some(c => c.variation_id === p.id)}
              />
            )}
            {cards.length > 0 && (
              <ul className="mt-3 space-y-2">
                {cards.map((c, i) => (
                  <li
                    key={c.variation_id ?? i}
                    className="flex gap-3 items-center rounded-lg border border-gray-200 dark:border-slate-600 px-3 py-2"
                  >
                    <ProductImageThumb src={c.image_url} alt={c.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="body-text truncate">{c.name}</p>
                      <span className="flex items-center gap-1.5">
                        <span className="subtitle-text">
                          {c.price != null ? formatPrice(c.price) : 'ไม่มีราคา'}
                        </span>
                        {/* ป้ายนี้จะไปโผล่บนการ์ดที่ลูกค้าเห็นด้วย — โชว์ตรงนี้ให้รู้ตั้งแต่ตอนเลือก */}
                        {discountPercent(c) !== null && (
                          <Badge tone="orange" size="sm">ลด {discountPercent(c)}%</Badge>
                        )}
                      </span>
                    </div>
                    <div className="w-52 flex-shrink-0">
                      <FormInput
                        value={c.url ?? ''}
                        disabled={disabled}
                        placeholder="ลิงก์ (ไม่ใส่ก็ได้)"
                        onChange={e => onCardsChange(cards.map((x, j) => j === i ? { ...x, url: e.target.value || null } : x))}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      icon={<Trash2 className="w-4 h-4" />}
                      aria-label="เอาออก"
                      disabled={disabled}
                      onClick={() => onCardsChange(cards.filter((_, j) => j !== i))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ปุ่มตอบเร็ว — ช่องเดียวแบบพิมพ์แท็ก: Enter แล้วเป็นเม็ดยาในกล่องเดียวกัน เหมือนที่ลูกค้าเห็นท้ายห้องแชท */}
        {compose.quickReplyMax > 0 && (
          <ChipsInput
            label="ปุ่มตอบเร็ว (ไม่บังคับ)"
            description="ลูกค้ากดแล้วข้อความเข้าห้องแชททันที — ได้บทสนทนาให้แอดมินปิดการขายต่อ"
            value={quickReplies}
            onChange={onQuickRepliesChange}
            max={compose.quickReplyMax}
            maxLength={BUTTON_LABEL_MAX}
            placeholder="เช่น สนใจ / ขอรายละเอียด"
            disabled={disabled}
            removeLabel={q => `เอาปุ่ม ${q} ออก`}
          />
        )}
      </div>
    </Card>
  );
}
