// Path: app/marketing/broadcast/new/components/BlocksEditor.tsx
//
// ตัวแก้ไขเนื้อหาบรอดแคสต์แบบบล็อก (= โมเดลของ LINE OA Manager) — ขั้น "ส่งอะไร" ของหน้าสร้าง
//
// 1 ใบ = บล็อกได้สูงสุด 3 บล็อก เลือกชนิดต่อบล็อก: ข้อความ · รูป · รูปเต็มจอ (กดได้) · การ์ด
// (ใบเดียว = การ์ดใหญ่ · หลายใบ = แถวเลื่อน · ดึงจากสินค้าได้) · ลากเรียงลำดับบล็อกได้ · การ์ดเป็นแถบแนวนอน
// กดทีละใบเพื่อแก้และลากเรียงได้ · ปุ่มตอบเร็วอยู่ท้ายทุกบล็อก · ทุกจุดที่กดได้ใช้ ActionPicker ตัวเดียว
// การ์ด: แท็บ "สินค้าในร้าน" (รูป/ชื่อ/ราคาจากสินค้า ไม่มีช่องอัปรูป) / "ทำการ์ดเอง" — แต่ละแท็บเก็บเนื้อหาของตัวเอง
//   สัดส่วนรูป 1:1 หรือ 3:4 (แบบ Shopee) ใช้ทั้งแถว · ช่องป้ายปุ่มวาดสีเดียวกับของจริง (ปุ่มแรกเขียว ที่เหลือเทา)
//
// หน้าเป็นเจ้าของ state (`blocks` + setter แบบ functional) — ตัวแก้ไขดูแล object URL ของรูปที่เลือก
// (สร้างตอนเลือก · คืนตอนเปลี่ยน/เอาออก) และวัดขนาดรูปเต็มจอเอง · ข้อมูล/ตัวแปลงอยู่ blocks-model.ts
// หน้าลองใน /dev/design/broadcast-editor ใช้ตัวนี้ตัวเดียวกัน
'use client';

import { useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import ActionMenu from '@/components/ui/ActionMenu';
import ChipsInput from '@/components/ui/ChipsInput';
import MessageComposer from '@/components/ui/MessageComposer';
import ImageDropzone from '@/components/ui/ImageDropzone';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { CARD_RATIO_CLASS } from '@/components/broadcast/BroadcastPreview';
import { thumbUrl } from '@/lib/image-thumb';
import { LINE_TEXT_MAX } from '@/lib/line/constants';
import {
  BLOCKS_MAX, BLOCK_CARDS_MAX, BLOCK_CARD_TEXT_MAX, BLOCK_CARD_TITLE_MAX, BLOCK_TYPE_LABELS, BUTTON_LABEL_MAX,
  CARD_BUTTONS_MAX, EMPTY_ACTION,
  type BroadcastBlockType, type BroadcastCardRatio, type BroadcastProductCard,
} from '@/lib/broadcast/content';
import {
  GalleryHorizontalEnd, GripVertical, Image as ImageIcon, MessageSquareText, Package, PenLine, Plus,
  RectangleVertical, Square, Trash2,
} from 'lucide-react';
import ActionPicker from './ActionPicker';
import {
  faceFromProduct, faceOf, measureImageDims, newBlock, newCard, newId, revokeEditorUrls,
  type EditorBlock, type EditorCard, type EditorCardFace, type EditorCardsBlock, type EditorImageBlock,
} from './blocks-model';

/** ของที่ ActionPicker/ช่องค้นสินค้าทุกตัวในตัวแก้ไขใช้ร่วมกัน — หน้าเป็นคนถือผลค้นหา */
export interface BlocksPickerProps {
  storefrontOpen: boolean;
  productResults: ProductSearchItem[];
  productLoading: boolean;
  onProductSearch: (q: string) => void;
  productToCard: (p: ProductSearchItem) => BroadcastProductCard;
}

interface BlocksEditorProps {
  blocks: EditorBlock[];
  onBlocksChange: Dispatch<SetStateAction<EditorBlock[]>>;
  quickReplies: string[];
  onQuickRepliesChange: (value: string[]) => void;
  /** 0 = ช่องทางนี้ไม่มีปุ่มตอบเร็ว → ไม่วาดช่อง */
  quickReplyMax: number;
  picker: BlocksPickerProps;
  /** "ส่งครั้งเดียวนับ 1 ข้อความในโควตา" — เรื่องของ LINE */
  showCreditNote?: boolean;
  disabled?: boolean;
}

/** ไอคอนประจำชนิดบล็อก — คู่กับชื่อบนหัวแถบของบล็อก (รูปเต็มจอ = กรอบแนวตั้ง · การ์ด = แถวเลื่อนแนวนอน) */
const BLOCK_ICONS: Record<BroadcastBlockType, ReactNode> = {
  text: <MessageSquareText className="w-4 h-4" />,
  image: <ImageIcon className="w-4 h-4" />,
  rich: <RectangleVertical className="w-4 h-4" />,
  cards: <GalleryHorizontalEnd className="w-4 h-4" />,
};

/**
 * รายการในเมนู "+ เพิ่มบล็อก" — ไอคอน + ชื่อ + คำอธิบายสั้น (เดิมเป็นการ์ดมอคห้องแชท 4 ใบเต็มแถว
 * เจ้าของขอเปลี่ยนเป็นป๊อปอัปแบบไอคอน 11 ก.ย. 2026) · ไอคอนชุดเดียวกับหัวแถบของบล็อก
 */
const BLOCK_TYPES: BroadcastBlockType[] = ['text', 'image', 'rich', 'cards'];
const BLOCK_DESCRIPTIONS: Record<BroadcastBlockType, string> = {
  text: 'ข้อความในแชท',
  image: 'รูปในแชทตามปกติ',
  rich: 'เต็มความกว้าง กดแล้วไปต่อได้',
  cards: 'ใบเดียว/หลายใบ ดึงจากสินค้าได้',
};

/** รูปที่ส่งจริงย่อไม่เกิน 1024 px — เพดานรูปใน Flex ของ LINE (1040 ใน OA Manager เป็นของ imagemap คนละชนิด) */
const IMAGE_MAX_PX = 1024;
const IMAGE_MAX_MB = 0.3;

const subscribeNoop = () => () => {};

/** รูปจิ๋วของการ์ดบนแถบ — แท็บสินค้าใช้รูปสินค้า (ย่อ) · แท็บทำเองใช้รูปที่เลือก/รูปเดิม */
function cardThumb(c: EditorCard): string | null {
  if (c.source === 'product') return c.product?.image_url ? thumbUrl(c.product.image_url, 160) || null : null;
  return c.previewUrl ?? c.existingUrl;
}

// ── ตัวแก้ไขการ์ด: แถบแนวนอน (ลากเรียงได้) + แก้ทีละใบ ───────────────────────

function SortableCardTile({ c, index, selected, onSelect }: {
  c: EditorCard; index: number; selected: boolean; onSelect: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: c.id });
  const img = cardThumb(c);
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : undefined }}
      className={`w-24 flex-shrink-0 rounded-lg p-1.5 text-left choice-card cursor-grab ${selected ? 'choice-card-active ring-1 ring-primary' : ''}`}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="w-full h-16 object-cover rounded" />
      ) : (
        <div className="w-full h-16 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-400">
          <ImageIcon className="w-5 h-5" />
        </div>
      )}
      <p className="helper-text mt-1 truncate text-center">{faceOf(c).title.trim() || c.product?.name || `การ์ด ${index + 1}`}</p>
    </button>
  );
}

function CardsEditor({ block, onChange, picker }: {
  block: EditorCardsBlock;
  onChange: (b: EditorCardsBlock) => void;
  picker: BlocksPickerProps;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const selected = block.cards.find(c => c.id === block.selectedId) ?? block.cards[0];
  const selectedIndex = block.cards.findIndex(c => c.id === selected?.id);

  const patchCard = (id: string, patch: Partial<EditorCard>) =>
    onChange({ ...block, cards: block.cards.map(c => (c.id === id ? { ...c, ...patch } : c)) });
  const addCard = () => {
    if (block.cards.length >= BLOCK_CARDS_MAX) return;
    const c = newCard();
    onChange({ ...block, cards: [...block.cards, c], selectedId: c.id });
  };
  const removeCard = (card: EditorCard) => {
    if (card.previewUrl) URL.revokeObjectURL(card.previewUrl);
    const cards = block.cards.filter(c => c.id !== card.id);
    onChange({ ...block, cards, selectedId: cards[0]?.id ?? '' });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = block.cards.findIndex(c => c.id === active.id);
    const to = block.cards.findIndex(c => c.id === over.id);
    if (from < 0 || to < 0) return;
    onChange({ ...block, cards: arrayMove(block.cards, from, to) });
  };
  /** แก้เนื้อหาของแท็บที่การ์ดใบนั้นเลือกอยู่ — อีกแท็บไม่โดนแตะ */
  const patchFace = (c: EditorCard, patch: Partial<EditorCardFace>) =>
    patchCard(c.id, c.source === 'product'
      ? { productFace: { ...c.productFace, ...patch } }
      : { customFace: { ...c.customFace, ...patch } });
  const pickProduct = (c: EditorCard, p: ProductSearchItem) => {
    const product = picker.productToCard(p);
    patchCard(c.id, { product, productFace: faceFromProduct(product, picker.storefrontOpen) });
  };
  /** เลือกรูปใหม่ = คืน object URL เดิม · เอารูปออก = เอารูปเดิมของใบที่คัดลอกมาออกด้วย */
  const setCardFile = (c: EditorCard, file: File | null) => {
    if (c.previewUrl) URL.revokeObjectURL(c.previewUrl);
    patchCard(c.id, { file, previewUrl: file ? URL.createObjectURL(file) : null, existingUrl: null });
  };
  const face = selected ? faceOf(selected) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="subtitle-text">
          {block.cards.length === 1 ? 'ใบเดียว = การ์ดใหญ่เต็มจอ' : `${block.cards.length} ใบ = แถวเลื่อนดู`} · กดการ์ดเพื่อแก้ · ลากเพื่อสลับลำดับ
        </p>
        {/* สัดส่วนรูปใช้ชุดเดียวทั้งแถว — การ์ดในแถวเลื่อนสูงเท่ากันทุกใบ */}
        <FilterChips<BroadcastCardRatio>
          variant="segmented"
          value={block.ratio}
          onChange={ratio => onChange({ ...block, ratio })}
          chips={[
            { id: '1:1', label: 'จัตุรัส 1:1', icon: <Square className="w-4 h-4" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE, tooltip: 'รูปทุกใบในแถวเป็นจัตุรัส' },
            { id: '3:4', label: 'แนวตั้ง 3:4', icon: <RectangleVertical className="w-4 h-4" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE, tooltip: 'รูปแนวตั้งแบบรูปสินค้าบน Shopee — ใช้กับทุกใบในแถว' },
          ]}
        />
      </div>
      {/* แถบการ์ดแนวนอน — ลากเรียงได้ */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={block.cards.map(c => c.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {block.cards.map((c, i) => (
              <SortableCardTile
                key={c.id}
                c={c}
                index={i}
                selected={c.id === selected?.id}
                onSelect={() => onChange({ ...block, selectedId: c.id })}
              />
            ))}
            {block.cards.length < BLOCK_CARDS_MAX && (
              <button
                type="button"
                onClick={addCard}
                className="w-24 flex-shrink-0 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 text-gray-500 hover:border-primary hover:text-primary transition-colors flex flex-col items-center justify-center gap-1 helper-text"
              >
                <Plus className="w-5 h-5" />
                เพิ่มการ์ด
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {selected && face && (
        // การ์ดที่กำลังแก้ = การ์ดกลาง (.card — ขาว ขอบ เงา) บนพื้นจมของกล่องบล็อก
        <Card padding="sm" className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="field-label">การ์ดที่ {selectedIndex + 1}</p>
            {block.cards.length > 1 && (
              <Button
                variant="ghost"
                icon={<Trash2 className="w-4 h-4" />}
                aria-label="เอาการ์ดนี้ออก"
                className="ml-auto"
                onClick={() => removeCard(selected)}
              />
            )}
          </div>

          {/* การ์ดมาจากไหน = แท็บ — แต่ละแท็บเก็บรูป/ข้อความ/ปุ่มของตัวเอง สลับไปมาแล้วของเดิมไม่หาย */}
          <Tabs
            size="sm"
            activeKey={selected.source}
            onSelect={key => patchCard(selected.id, { source: key === 'custom' ? 'custom' : 'product' })}
            tabs={[
              { key: 'product', label: 'สินค้าในร้าน', icon: <Package className="w-4 h-4" /> },
              { key: 'custom', label: 'ทำการ์ดเอง', icon: <PenLine className="w-4 h-4" /> },
            ]}
          />
          <p className="subtitle-text">
            {selected.source === 'product'
              ? 'รูป ชื่อ ราคา และปุ่มสั่งซื้อ ดึงจากสินค้าให้ — แก้ข้อความบนการ์ดได้'
              : 'อัปรูปและพิมพ์ข้อความเอง — ใช้กับโปรโมชัน ประกาศ หรือเรื่องที่ไม่ใช่สินค้าชิ้นเดียว'}
          </p>

          {selected.source === 'product' && !selected.product ? (
            <ProductSearchInput
              products={picker.productResults}
              loading={picker.productLoading}
              onSearchChange={picker.onProductSearch}
              onSelect={p => pickProduct(selected, p)}
            />
          ) : (
            <div className="grid md:grid-cols-[180px_minmax(0,1fr)] gap-4">
              <div>
                <p className="field-label mb-1">รูป</p>
                {selected.source === 'product' && selected.product ? (
                  <>
                    {/* รูปตามสินค้าเสมอ ไม่มีช่องอัป — ครอปตามสัดส่วนที่เลือกของแถว */}
                    <div className={`w-full ${CARD_RATIO_CLASS[block.ratio]} rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-400`}>
                      {selected.product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbUrl(selected.product.image_url, 320)} alt={selected.product.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-8 h-8" />
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      className="mt-2"
                      onClick={() => patchCard(selected.id, { product: null })}
                    >
                      เปลี่ยนสินค้า
                    </Button>
                  </>
                ) : (
                  <ImageDropzone
                    // สลับการ์ด/สลับแท็บกลับมา = ช่องเกิดใหม่ของการ์ดใบนั้น — รูปที่เลือกไว้ส่งให้โชว์ต่อ
                    key={selected.id}
                    value={selected.file}
                    onChange={f => setCardFile(selected, f)}
                    initialPreviewUrl={selected.previewUrl ?? selected.existingUrl}
                    label="เลือกรูป"
                    hint={block.ratio === '3:4' ? 'รูปแนวตั้ง 3:4' : 'รูปจัตุรัส 1:1'}
                    aspect={block.ratio}
                    changeOnClick
                    maxWidthOrHeight={IMAGE_MAX_PX}
                    maxSizeMB={IMAGE_MAX_MB}
                  />
                )}
              </div>
              <div className="space-y-3">
                <FormInput
                  label="หัวข้อ (ไม่บังคับ)"
                  value={face.title}
                  maxLength={BLOCK_CARD_TITLE_MAX}
                  onChange={e => patchFace(selected, { title: e.target.value })}
                  placeholder="ไม่ใส่ = การ์ดรูปล้วน"
                  hint={`${face.title.length}/${BLOCK_CARD_TITLE_MAX}`}
                />
                <FormTextarea
                  label="ข้อความ (ไม่บังคับ)"
                  value={face.text}
                  maxLength={BLOCK_CARD_TEXT_MAX}
                  rows={2}
                  onChange={e => patchFace(selected, { text: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* กดที่ตัวการ์ดแล้วเกิดอะไร — อยู่ก่อนปุ่ม เพราะเป็นพฤติกรรมพื้นฐานของการ์ด ปุ่มเป็นของเสริมทีหลัง
              (เจ้าของขอ 11 ก.ย. 2026) · Flex ให้ตัวการ์ดกับปุ่มมี action ของตัวเองพร้อมกันได้ */}
          <ActionPicker
            label="เมื่อลูกค้ากดการ์ด (ไม่บังคับ)"
            value={face.tapAction}
            onChange={tapAction => patchFace(selected, { tapAction })}
            {...picker}
          />

          <div>
            <p className="field-label">ปุ่ม (ไม่บังคับ · สูงสุด {CARD_BUTTONS_MAX})</p>
            <p className="subtitle-text mb-2">ปุ่มแรกเป็นปุ่มหลักสีเขียว ปุ่มถัดไปสีเทา — ตามที่ลูกค้าเห็นจริง</p>
            {/* ปุ่มละแถว: ป้าย (สีเดียวกับปุ่มจริง) + ชนิด action แบบป้ายสั้น + ช่องกรอกของ action + ถังขยะ */}
            <div className="divide-y divide-gray-200 dark:divide-slate-600">
              {face.buttons.map((b, i) => (
                <div key={b.id} className="flex flex-wrap gap-2 items-start py-2 first:pt-0 last:pb-0">
                  <div className="w-44 flex-shrink-0">
                    <FormInput
                      value={b.label}
                      maxLength={BUTTON_LABEL_MAX}
                      placeholder={i === 0 ? 'เช่น สั่งเลย' : 'เช่น ดูรายละเอียด'}
                      aria-label={`ข้อความบนปุ่มที่ ${i + 1}`}
                      className={i === 0 ? 'line-btn-field' : 'line-btn-field-secondary'}
                      onChange={e => patchFace(selected, { buttons: face.buttons.map(x => (x.id === b.id ? { ...x, label: e.target.value } : x)) })}
                    />
                  </div>
                  <div className="flex-1 min-w-64">
                    <ActionPicker
                      value={b.action}
                      onChange={action => patchFace(selected, { buttons: face.buttons.map(x => (x.id === b.id ? { ...x, action } : x)) })}
                      {...picker}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    icon={<Trash2 className="w-4 h-4" />}
                    aria-label="ลบปุ่ม"
                    onClick={() => patchFace(selected, { buttons: face.buttons.filter(x => x.id !== b.id) })}
                  />
                </div>
              ))}
            </div>
            {face.buttons.length < CARD_BUTTONS_MAX && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                className="mt-2"
                onClick={() => patchFace(selected, { buttons: [...face.buttons, { id: newId(), label: '', action: EMPTY_ACTION }] })}
              >
                เพิ่มปุ่ม
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── บล็อกหนึ่งอันในรายการ (ลากเรียงได้) ─────────────────────────────────────────

function SortableBlock({ block, index, onChange, onImageChange, onRemove, picker }: {
  block: EditorBlock;
  index: number;
  onChange: (b: EditorBlock) => void;
  onImageChange: (b: EditorImageBlock, file: File | null) => void;
  onRemove: () => void;
  picker: BlocksPickerProps;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: block.id });
  let editor: ReactNode;
  if (block.type === 'text') {
    editor = (
      <MessageComposer
        value={block.text}
        onChange={text => onChange({ ...block, text })}
        maxLength={LINE_TEXT_MAX}
        rows={3}
        placeholder="พิมพ์ข้อความที่จะส่งถึงลูกค้า"
      />
    );
  } else if (block.type === 'image' || block.type === 'rich') {
    const composer = (
      <MessageComposer
        emptyHint={block.type === 'image'
          ? 'รูปในแชทตามปกติ'
          : 'แนะนำแนวตั้ง 4:5 · สูงสุด 1:3 (สูงได้ 3 เท่าของความกว้าง)'}
        image={{
          file: block.file,
          onChange: f => onImageChange(block, f),
          previewUrl: block.previewUrl ?? block.existingUrl,
          maxWidthOrHeight: IMAGE_MAX_PX,
          maxSizeMB: IMAGE_MAX_MB,
        }}
      />
    );
    editor = block.type === 'image' ? composer : (
      // สองคอลัมน์: รูปซ้าย · "เมื่อลูกค้ากดรูป" ขวา — แถวเดียวเต็มกว้างเหลือที่ว่างเยอะ (เจ้าของขอ 11 ก.ย. 2026)
      // ป้ายเดิม "กดรูปแล้ว" อ่านห้วน ไม่รู้ว่าใครกด (เจ้าของขอเปลี่ยน 11 ก.ย. 2026)
      <div className="grid md:grid-cols-2 gap-4 items-start">
        {composer}
        <ActionPicker label="เมื่อลูกค้ากดรูป" value={block.action} onChange={action => onChange({ ...block, action })} {...picker} />
      </div>
    );
  } else {
    editor = <CardsEditor block={block} onChange={onChange} picker={picker} />;
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined }}
      // `.inner-panel` = กล่องซ้อนบนการ์ดขาว (สีอยู่ใน globals.css ที่เดียว)
      className="inner-panel"
    >
      <div className="inner-panel-head">
        <button
          type="button"
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-grab touch-none"
          aria-label="ลากเพื่อสลับลำดับ"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="subtitle-text">บล็อก {index + 1}</span>
        {/* ชนิดของบล็อก = ไอคอน + ชื่อ ชิดขวาข้างถังขยะ · ขนาดเดียวกับ "บล็อก N" จึงอยู่แนวเดียวกัน */}
        <span className="ml-auto inline-flex items-center gap-1.5 subtitle-text font-medium text-gray-700 dark:text-slate-200">
          {BLOCK_ICONS[block.type]}
          {BLOCK_TYPE_LABELS[block.type]}
        </span>
        <Button
          variant="ghost"
          icon={<Trash2 className="w-4 h-4" />}
          aria-label="เอาบล็อกนี้ออก"
          onClick={onRemove}
        />
      </div>
      <div className="inner-panel-body">{editor}</div>
    </div>
  );
}

// ── ตัวแก้ไข ───────────────────────────────────────────────────────────────────

export default function BlocksEditor({
  blocks, onBlocksChange, quickReplies, onQuickRepliesChange, quickReplyMax, picker, showCreditNote, disabled,
}: BlocksEditorProps) {
  // @dnd-kit สร้าง id ภายในต่างกันระหว่าง SSR/CSR — วาง DndContext หลัง mount เท่านั้น (เหตุผลเดียวกับ DataTable)
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const replaceBlock = (next: EditorBlock) => onBlocksChange(prev => prev.map(b => (b.id === next.id ? next : b)));
  const removeBlock = (block: EditorBlock) => {
    revokeEditorUrls(block);
    onBlocksChange(prev => prev.filter(b => b.id !== block.id));
  };
  /** เลือกรูปใหม่ = คืน object URL เดิม แล้ววัดขนาดใหม่ (รูปเต็มจอส่งสัดส่วนตามรูปจริง) */
  const setBlockImage = (block: EditorImageBlock, file: File | null) => {
    if (block.previewUrl) URL.revokeObjectURL(block.previewUrl);
    replaceBlock({
      ...block, file, previewUrl: file ? URL.createObjectURL(file) : null, existingUrl: null, width: null, height: null,
    });
    if (!file) return;
    measureImageDims(file).then(dims => {
      if (!dims) return;
      onBlocksChange(prev => prev.map(b => (
        b.id === block.id && (b.type === 'image' || b.type === 'rich') && b.file === file ? { ...b, ...dims } : b
      )));
    });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onBlocksChange(prev => {
      const from = prev.findIndex(b => b.id === active.id);
      const to = prev.findIndex(b => b.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };

  const list = (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <SortableBlock
          key={b.id}
          block={b}
          index={i}
          onChange={replaceBlock}
          onImageChange={setBlockImage}
          onRemove={() => removeBlock(b)}
          picker={picker}
        />
      ))}
    </div>
  );

  return (
    // fieldset ปิดทุกช่อง/ปุ่มข้างในทีเดียวระหว่างกำลังส่ง
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <Card padding="md">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="heading-4">สิ่งที่จะส่ง</h2>
          <span className="section-desc text-right">
            บล็อก {blocks.length}/{BLOCKS_MAX}{showCreditNote ? ' · ส่งครั้งเดียวนับ 1 ข้อความในโควตา' : ''}
          </span>
        </div>

        {mounted ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              {list}
            </SortableContext>
          </DndContext>
        ) : list}

        <div className={blocks.length > 0 ? 'mt-4' : ''}>
          {blocks.length < BLOCKS_MAX ? (
            // ป๊อปอัปเลือกชนิด — เปิดขึ้น/ลงตามที่ว่างของจอ · ชิดซ้ายของปุ่ม (ชิดขวาแล้วล้นขอบซ้ายจอมือถือ)
            <ActionMenu
              placement="auto"
              align="start"
              triggerClassName="btn btn-md btn-secondary"
              trigger={<span className="inline-flex items-center gap-2"><Plus className="w-4 h-4" />เพิ่มบล็อก</span>}
              items={BLOCK_TYPES.map(type => ({
                key: type,
                label: BLOCK_TYPE_LABELS[type],
                description: BLOCK_DESCRIPTIONS[type],
                icon: BLOCK_ICONS[type],
                onClick: () => onBlocksChange(prev => [...prev, newBlock(type)]),
              }))}
            />
          ) : (
            <p className="subtitle-text">ครบ {BLOCKS_MAX} บล็อกแล้ว — เอาบล็อกออกก่อนถ้าจะเปลี่ยน</p>
          )}
        </div>
      </Card>

      {quickReplyMax > 0 && (
        <Card padding="md">
          <ChipsInput
            label="ปุ่มตอบเร็ว (ไม่บังคับ)"
            description="ลูกค้ากดแล้วข้อความเข้าห้องแชททันที — อยู่ท้ายสุดของทุกบล็อก"
            value={quickReplies}
            onChange={onQuickRepliesChange}
            max={quickReplyMax}
            maxLength={BUTTON_LABEL_MAX}
            placeholder="เช่น สนใจ / ขอรายละเอียด"
            removeLabel={q => `เอาปุ่ม ${q} ออก`}
          />
        </Card>
      )}
    </fieldset>
  );
}
