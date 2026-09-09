// Path: app/marketing/broadcast/new/components/ContentStep.tsx
//
// การ์ด "สิ่งที่จะส่ง" ของขั้นที่ 2 — เลือกชนิดเนื้อหา (ชนิดกลาง ไม่ใช่ศัพท์ของ LINE)
// แล้วกรอกตามชนิดนั้น · ลิมิตทุกตัวมาจาก `compose` (ค่าที่แคบที่สุดของช่องทางที่เลือก)
// ห้าม hardcode ซ้ำที่นี่
'use client';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import OptionCards from '@/components/ui/OptionCards';
import ImageDropzone from '@/components/ui/ImageDropzone';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { formatPrice } from '@/lib/utils/format';
import {
  BUTTON_LABEL_MAX,
  CARD_TEXT_MAX,
  type BroadcastButton,
  type BroadcastProductCard,
} from '@/lib/broadcast/content';
import type { BroadcastCompose, BroadcastContentKind } from '@/lib/broadcast/platforms';
import { Plus, Trash2 } from 'lucide-react';

/** ชื่อชนิดเนื้อหา — หน้าสร้างเอาไปสรุปในแผงขวาด้วย จึง export ออกไป */
export const KIND_LABELS: Record<BroadcastContentKind, string> = {
  announce: 'ประกาศ',
  promo: 'โปรโมชัน',
  products: 'การ์ดสินค้า',
};

/** การ์ดเลือกชนิดเนื้อหา — preview วาดรูปทรงจริงให้เห็นว่าลูกค้าจะได้อะไร */
const KIND_CARDS: Record<BroadcastContentKind, { label: string; description: string; preview: React.ReactNode }> = {
  announce: {
    label: KIND_LABELS.announce,
    description: 'ข้อความ + รูป',
    preview: (
      <div className="w-full space-y-1">
        <div className="h-1.5 rounded bg-gray-300 dark:bg-slate-500" />
        <div className="h-1.5 w-3/4 rounded bg-gray-300 dark:bg-slate-500" />
        <div className="h-5 rounded bg-gray-200 dark:bg-slate-600" />
      </div>
    ),
  },
  promo: {
    label: KIND_LABELS.promo,
    description: 'แบนเนอร์ + ปุ่มกด',
    preview: (
      <div className="w-full rounded border border-gray-300 dark:border-slate-500 overflow-hidden">
        <div className="h-4 bg-gray-200 dark:bg-slate-600" />
        <div className="p-1 space-y-1">
          <div className="h-1.5 w-2/3 rounded bg-gray-300 dark:bg-slate-500" />
          <div className="h-2.5 rounded bg-primary/70" />
        </div>
      </div>
    ),
  },
  products: {
    label: KIND_LABELS.products,
    description: 'เลื่อนดูได้ กดสั่งเลย',
    preview: (
      <div className="w-full flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex-1 rounded border border-gray-300 dark:border-slate-500 overflow-hidden">
            <div className="h-3.5 bg-gray-200 dark:bg-slate-600" />
            <div className="p-0.5"><div className="h-1.5 rounded bg-gray-300 dark:bg-slate-500" /></div>
          </div>
        ))}
      </div>
    ),
  },
};

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
  imageFile, onImageFileChange, existingImageUrl,
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

  const imageField = compose.image && kind !== 'products' && (
    <div>
      <p className="field-label mb-1">
        {kind === 'promo' ? 'แบนเนอร์ (ไม่บังคับ)' : 'รูปภาพ (ไม่บังคับ)'}
      </p>
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
      {kind === 'promo' && (
        <p className="helper-text text-gray-500 dark:text-slate-400 mt-1">
          ส่งเป็นสัดส่วนตามรูปจริง (แนวตั้งได้ สูงสุด 3 เท่าของความกว้าง)
        </p>
      )}
    </div>
  );

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="heading-4">สิ่งที่จะส่ง</h2>
        {showCreditNote && (
          <span className="helper-text text-gray-500 dark:text-slate-400 text-right">
            การ์ดที่มีรูป หัวข้อ และปุ่ม นับเป็น 1 ข้อความเท่าข้อความเปล่า
          </span>
        )}
      </div>

      {compose.kinds.length > 1 && (
        <div className="mb-4">
          <OptionCards<BroadcastContentKind>
            value={kind}
            onChange={onKindChange}
            disabled={disabled}
            options={compose.kinds.map(k => ({ id: k, ...KIND_CARDS[k] }))}
          />
        </div>
      )}

      <div className="space-y-4">
        {/* หัวข้อ — TikTok บังคับ · LINE ใช้เป็นหัวการ์ดของโปรโมชัน */}
        {(compose.titleMax || kind === 'promo') && (
          <FormInput
            label="หัวข้อ"
            required={!!compose.titleMax}
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            maxLength={compose.titleMax ?? 40}
            disabled={disabled}
            placeholder="หัวข้อที่ลูกค้าเห็นก่อน"
            hint={`${title.length}/${compose.titleMax ?? 40}`}
          />
        )}

        {/* โปรโมชันมีทั้งข้อความสั้นและแบนเนอร์ — วางคู่กันจะเห็นการ์ดทั้งใบในสายตาเดียว */}
        {kind === 'promo' ? (
          <div className="grid md:grid-cols-[minmax(0,1fr)_240px] gap-4">
            {textField}
            {imageField}
          </div>
        ) : (
          <>
            {textField}
            {imageField}
          </>
        )}

        {!compose.image && (
          <p className="helper-text text-gray-500 dark:text-slate-400">
            {platformLabel} รับเฉพาะข้อความล้วน (แนบรูปไม่ได้)
          </p>
        )}

        {/* ปุ่มกด */}
        {kind === 'promo' && compose.buttonsMax > 0 && (
          <div>
            <p className="field-label mb-1">ปุ่มกด (สูงสุด {compose.buttonsMax})</p>
            <p className="helper-text text-gray-500 dark:text-slate-400 mb-2">
              ใส่ลิงก์ปลายทางเอง เช่น หน้าสินค้า หน้าโปรฯ
            </p>
            <div className="space-y-2">
              {buttons.map((b, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="w-36 flex-shrink-0">
                    <FormInput
                      value={b.label}
                      maxLength={BUTTON_LABEL_MAX}
                      disabled={disabled}
                      placeholder="สั่งเลย"
                      onChange={e => onButtonsChange(buttons.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <FormInput
                      value={b.url}
                      disabled={disabled}
                      placeholder="https://..."
                      onChange={e => onButtonsChange(buttons.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                    />
                  </div>
                  {buttons.length > 1 && (
                    <Button
                      variant="ghost"
                      icon={<Trash2 className="w-4 h-4" />}
                      aria-label="ลบปุ่ม"
                      disabled={disabled}
                      onClick={() => onButtonsChange(buttons.filter((_, j) => j !== i))}
                    />
                  )}
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
                onClick={() => onButtonsChange([...buttons, { label: '', url: '' }])}
              >
                เพิ่มปุ่ม
              </Button>
            )}
          </div>
        )}

        {/* การ์ดสินค้า */}
        {kind === 'products' && (
          <div>
            <p className="field-label mb-1">สินค้า (สูงสุด {compose.productsMax} ชิ้น)</p>
            <p className="helper-text text-gray-500 dark:text-slate-400 mb-2">
              ชื่อ รูป ราคา ดึงจากคลังให้เอง · ไม่ใส่ลิงก์ = ปุ่มเป็น &quot;สนใจสินค้านี้&quot; ที่ลูกค้ากดแล้วทักเข้าห้องแชท
            </p>
            {cards.length >= compose.productsMax ? (
              <p className="helper-text text-gray-500 dark:text-slate-400">
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
                      <p className="body-text text-gray-900 dark:text-white truncate">{c.name}</p>
                      <p className="helper-text text-gray-500 dark:text-slate-400">
                        {c.price != null ? formatPrice(c.price) : 'ไม่มีราคา'}
                      </p>
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

        {/* ปุ่มตอบเร็ว */}
        {compose.quickReplyMax > 0 && (
          <div>
            <p className="field-label mb-1">ปุ่มตอบเร็ว (ไม่บังคับ)</p>
            <p className="helper-text text-gray-500 dark:text-slate-400 mb-2">
              ลูกค้ากดแล้วข้อความเข้าห้องแชททันที — ได้บทสนทนาให้แอดมินปิดการขายต่อ
            </p>
            {quickReplies.length > 0 && (
              <div className="space-y-2 mb-2">
                {quickReplies.map((q, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <FormInput
                        value={q}
                        maxLength={BUTTON_LABEL_MAX}
                        disabled={disabled}
                        placeholder="เช่น สนใจ / ขอรายละเอียด"
                        onChange={e => onQuickRepliesChange(quickReplies.map((x, j) => j === i ? e.target.value : x))}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      icon={<Trash2 className="w-4 h-4" />}
                      aria-label="ลบปุ่มตอบเร็ว"
                      disabled={disabled}
                      onClick={() => onQuickRepliesChange(quickReplies.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
              </div>
            )}
            {quickReplies.length < compose.quickReplyMax && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                disabled={disabled}
                onClick={() => onQuickRepliesChange([...quickReplies, ''])}
              >
                เพิ่มปุ่มตอบเร็ว
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
