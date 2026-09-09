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
import OptionCards from '@/components/ui/OptionCards';
import ImageDropzone from '@/components/ui/ImageDropzone';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { formatPrice } from '@/lib/utils/format';
import {
  BUTTON_LABEL_MAX,
  CARD_TEXT_MAX,
  discountPercent,
  type BroadcastButton,
  type BroadcastProductCard,
} from '@/lib/broadcast/content';
import type { BroadcastCompose, BroadcastContentKind } from '@/lib/broadcast/platforms';
import { Plus, Trash2 } from 'lucide-react';

/** ชื่อชนิดเนื้อหา — หน้าสร้างเอาไปสรุปในแผงขวาด้วย จึง export ออกไป */
export const KIND_LABELS: Record<BroadcastContentKind, string> = {
  announce: 'ประกาศ',
  poster: 'โปสเตอร์',
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
  poster: {
    label: KIND_LABELS.poster,
    description: 'รูปเต็มจอ กดไปลิงก์',
    preview: (
      // รูปเต็มกรอบ + หัวลูกศรมุมขวาล่าง = แตะแล้วออกไปที่ลิงก์
      <div className="w-full relative rounded border border-gray-300 dark:border-slate-500 overflow-hidden">
        <div className="h-10 bg-gray-200 dark:bg-slate-600" />
        <span className="absolute bottom-1.5 right-1.5 w-2 h-2 border-t-2 border-r-2 border-primary rotate-45" />
      </div>
    ),
  },
  promo: {
    label: KIND_LABELS.promo,
    description: 'หัวข้อ + ข้อความ + ปุ่ม',
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
    description: 'เลื่อนดู กดสั่งเลย',
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

/** รูปของ "ประกาศ" แสดงยังไง — วาดฟองแชทจริงให้เทียบ ไม่ใช่บรรยายเป็นคำ */
const IMAGE_STYLE_CARDS: { id: 'bubble' | 'rich'; label: string; description: string; preview: React.ReactNode }[] = [
  {
    id: 'bubble',
    label: 'รูปธรรมดา',
    description: 'ฟองรูปเหมือนส่งในแชท',
    preview: (
      <div className="w-full flex justify-end">
        <div className="rounded-lg bg-gray-300 dark:bg-slate-500 p-1">
          <div className="w-6 h-5 rounded bg-gray-100 dark:bg-slate-700" />
        </div>
      </div>
    ),
  },
  {
    id: 'rich',
    label: 'rich message',
    description: 'รูปเต็มจอ กดไปลิงก์ได้',
    preview: <div className="w-full h-10 rounded bg-gray-200 dark:bg-slate-600" />,
  },
];

/** การ์ดสินค้าแสดงยังไง */
const CARD_STYLE_CARDS: { id: 'image' | 'detail'; label: string; description: string; preview: React.ReactNode }[] = [
  {
    id: 'image',
    label: 'รูปเต็ม',
    description: 'รูป + ราคาลอย กดไปลิงก์',
    preview: (
      <div className="w-full flex justify-center">
        <div className="w-9 relative rounded border border-gray-300 dark:border-slate-500 overflow-hidden">
          <div className="w-9 h-9 bg-gray-200 dark:bg-slate-600" />
          <div className="absolute bottom-1 left-1 right-1 h-1.5 rounded-full bg-gray-500 dark:bg-slate-300" />
        </div>
      </div>
    ),
  },
  {
    id: 'detail',
    label: 'มีชื่อ + ปุ่ม',
    description: 'รูป + ชื่อ + ราคา + ปุ่มสั่งเลย',
    preview: (
      <div className="w-full flex justify-center">
        <div className="w-9 rounded border border-gray-300 dark:border-slate-500 overflow-hidden">
          <div className="h-5 bg-gray-200 dark:bg-slate-600" />
          <div className="p-0.5 space-y-0.5">
            <div className="h-1 rounded bg-gray-300 dark:bg-slate-500" />
            <div className="h-1 w-2/3 rounded bg-gray-300 dark:bg-slate-500" />
            <div className="h-1.5 rounded bg-primary/70" />
          </div>
        </div>
      </div>
    ),
  },
];

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
  /** ประกาศ: รูปเป็นฟองรูปธรรมดา หรือรูปเต็มความกว้างห้องแชทที่กดได้ */
  imageStyle: 'bubble' | 'rich';
  onImageStyleChange: (v: 'bubble' | 'rich') => void;
  /** ปลายทางเมื่อลูกค้าแตะรูป — โปสเตอร์บังคับ · ประกาศแบบรูปเต็มจอไม่บังคับ */
  linkUrl: string;
  onLinkUrlChange: (v: string) => void;
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
  imageFile, onImageFileChange, existingImageUrl,
  imageStyle, onImageStyleChange, linkUrl, onLinkUrlChange, cardStyle, onCardStyleChange,
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

  /** มีรูปให้ตัดสินใจแล้วหรือยัง — ยังไม่มีรูปก็ยังไม่ต้องถามว่าจะแสดงแบบไหน */
  const hasImage = !!imageFile || !!existingImageUrl;

  const imageLabel = kind === 'poster'
    ? 'รูปโปสเตอร์'
    : kind === 'promo' ? 'แบนเนอร์ (ไม่บังคับ)' : 'รูปภาพ (ไม่บังคับ)';

  const imageField = compose.image && kind !== 'products' && (
    <div>
      <p className="field-label mb-1">{imageLabel}</p>
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
      {(kind === 'promo' || kind === 'poster') && (
        <p className="subtitle-text mt-1">
          ส่งเป็นสัดส่วนตามรูปจริง (แนวตั้งได้ สูงสุด 3 เท่าของความกว้าง)
        </p>
      )}
    </div>
  );

  /** ปลายทางเมื่อลูกค้าแตะรูป — โปสเตอร์บังคับ (กดแล้วไม่ไปไหน = ซื้อต่อไม่ได้) */
  const linkField = (
    <FormInput
      label={kind === 'poster' ? 'กดรูปแล้วไปที่' : 'กดรูปแล้วไปที่ (ไม่บังคับ)'}
      required={kind === 'poster'}
      value={linkUrl}
      onChange={e => onLinkUrlChange(e.target.value)}
      disabled={disabled}
      placeholder="https://…"
    />
  );

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
          <OptionCards<BroadcastContentKind>
            value={kind}
            onChange={onKindChange}
            disabled={disabled}
            options={compose.kinds.map(k => ({ id: k, ...KIND_CARDS[k] }))}
          />
        </div>
      )}

      <div className="space-y-4">
        {/* หัวข้อ — TikTok บังคับ · LINE ใช้เป็นหัวการ์ดของโปรโมชัน (โปสเตอร์ไม่มีหัวข้อ) */}
        {kind !== 'poster' && (compose.titleMax || kind === 'promo') && (
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
        ) : kind === 'poster' ? (
          // โปสเตอร์ = รูปกับลิงก์เท่านั้น — ไม่มีช่องข้อความให้กรอกโดยตั้งใจ
          <>
            {imageField}
            <p className="section-desc">
              รูปทั้งใบเป็นโปสเตอร์ — ข้อความ ราคา ปุ่ม ต้องอยู่ในรูป · ส่งเต็มจอตามสัดส่วนรูป
            </p>
            {linkField}
          </>
        ) : (
          <>
            {textField}
            {imageField}
            {/* มีรูปแล้วค่อยถามว่าจะแสดงแบบไหน — ยังไม่มีรูปก็ไม่มีอะไรให้ตัดสินใจ */}
            {kind === 'announce' && compose.image && hasImage && (
              <>
                <OptionCards<'bubble' | 'rich'>
                  label="แสดงรูปแบบไหน"
                  value={imageStyle}
                  onChange={onImageStyleChange}
                  disabled={disabled}
                  options={IMAGE_STYLE_CARDS}
                />
                {imageStyle === 'rich' && linkField}
              </>
            )}
          </>
        )}

        {!compose.image && (
          <p className="subtitle-text">
            {platformLabel} รับเฉพาะข้อความล้วน (แนบรูปไม่ได้)
          </p>
        )}

        {/* ปุ่มกด */}
        {kind === 'promo' && compose.buttonsMax > 0 && (
          <div>
            <p className="field-label mb-1">ปุ่มกด (สูงสุด {compose.buttonsMax})</p>
            <p className="subtitle-text mb-2">
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
            <div className="mb-3">
              <OptionCards<'image' | 'detail'>
                label="รูปแบบการ์ด"
                value={cardStyle}
                onChange={onCardStyleChange}
                disabled={disabled}
                options={CARD_STYLE_CARDS}
              />
            </div>
            <p className="field-label mb-1">สินค้า (สูงสุด {compose.productsMax} ชิ้น)</p>
            <p className="subtitle-text mb-2">
              ชื่อ รูป ราคา ดึงจากคลังให้เอง · ปุ่ม &quot;สั่งเลย&quot; ไปหน้าสินค้าใน storefront
              ให้เองเมื่อร้านเปิดหน้าร้านออนไลน์ · ยังไม่เปิด = &quot;สนใจสินค้านี้&quot;
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

        {/* ปุ่มตอบเร็ว */}
        {compose.quickReplyMax > 0 && (
          <div>
            <p className="field-label mb-1">ปุ่มตอบเร็ว (ไม่บังคับ)</p>
            <p className="subtitle-text mb-2">
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
