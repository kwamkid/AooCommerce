// Path: app/dev/design/broadcast-editor/page.tsx
//
// ต้นแบบ (prototype) ตัวแก้ไขบรอดแคสต์แบบ "บล็อก" — เจ้าของขอให้ทำบนระบบจริงแทนวาดภาพ
// (10 ก.ย. 2026) จะได้กดลองแล้วเคาะได้ทันที · **ค้นสินค้าและอ่านสถานะหน้าร้านจาก API จริงของบริษัท
// ที่ล็อกอินอยู่** (เคยใช้สินค้าจำลองแล้วเจ้าของเห็นสินค้าของร้านอื่นโผล่มา) · แต่ยังไม่บันทึก/ไม่ส่ง
//
// แนวคิด (= โมเดลของ LINE OA Manager): 1 ใบ = บล็อกได้สูงสุด 3 บล็อก เลือกชนิดต่อบล็อก
//   ข้อความ · รูป · รูปเต็มจอ (กดได้) · การ์ด (ใบเดียว = การ์ดใหญ่ · หลายใบ = แถวเลื่อน · ดึงจากสินค้าได้)
// ลากเรียงลำดับบล็อกได้ · การ์ดเป็นแถบแนวนอน กดทีละใบเพื่อแก้ (แบบแท็บของ LINE) และลากเรียงได้เหมือนกัน
// ปุ่มตอบเร็วอยู่ล่างสุด · ทุกจุดที่กดได้ใช้ ActionPicker ตัวเดียวกับหน้าจริง
//
// ⚠️ เมื่อเคาะแล้วให้ย้ายไปแทนหน้าสร้างจริง (ContentStep) พร้อมเปลี่ยน content จาก `kind` เป็น `blocks[]`
'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import OptionCards from '@/components/ui/OptionCards';
import ChipsInput from '@/components/ui/ChipsInput';
import MessageComposer from '@/components/ui/MessageComposer';
import ImageDropzone from '@/components/ui/ImageDropzone';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import AccountPicker, { type PickerAccount } from '@/components/ui/AccountPicker';
import LinePhonePreview, { type PhoneChatMessage } from '@/components/broadcast/LinePhonePreview';
import ActionPicker from '@/app/marketing/broadcast/new/components/ActionPicker';
import { KIND_MOCKS, MockChat, MockLine, MockPhoto } from '@/app/marketing/broadcast/new/components/KindMockups';
import { apiFetch } from '@/lib/api-client';
import { useServerSearch, type ServerSearchPage } from '@/lib/useServerSearch';
import { formatPrice } from '@/lib/utils/format';
import {
  ACTION_MESSAGE_MAX, BUTTON_LABEL_MAX, CARD_TEXT_MAX, CARD_TITLE_MAX, EMPTY_ACTION,
  type BroadcastAction, type BroadcastProductCard,
} from '@/lib/broadcast/content';
import {
  GalleryHorizontalEnd, GripVertical, Image as ImageIcon, MessageSquareText, Plus, RectangleVertical, Trash2,
} from 'lucide-react';

// ── โมเดลของต้นแบบ (ทรงเดียวกับที่จะเก็บลง content.blocks ในอนาคต) ────────────────

type BlockType = 'text' | 'image' | 'rich' | 'cards';

interface CardButton { id: string; label: string; action: BroadcastAction }

interface CardDraft {
  id: string;
  source: 'custom' | 'product';
  product: BroadcastProductCard | null;
  file: File | null;
  previewUrl: string | null;
  title: string;
  text: string;
  /** ปุ่มล่างการ์ด (ไม่บังคับ) — แต่ละปุ่มมี action ของตัวเอง */
  buttons: CardButton[];
  /** กดที่ตัวการ์ด (รูป/ข้อความ) — ส่งเป็น action ของ hero/body ใน Flex · มีปุ่มแล้วก็ยังใช้อยู่ */
  tapAction: BroadcastAction;
}

type Block =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; file: File | null; previewUrl: string | null }
  | { id: string; type: 'rich'; file: File | null; previewUrl: string | null; action: BroadcastAction }
  | { id: string; type: 'cards'; cards: CardDraft[]; selectedId: string };

/** LINE: 1 push ≤ 5 object แต่ ≤3 ยังนับ 1 ข้อความในโควตา (= จำนวนบล็อกของ OA Manager) */
const MAX_BLOCKS = 3;
const MAX_CARDS = 10;
const MAX_CARD_BUTTONS = 3;

const uid = () => Math.random().toString(36).slice(2, 10);

function newCard(): CardDraft {
  return {
    id: uid(), source: 'custom', product: null, file: null, previewUrl: null,
    title: '', text: '', buttons: [], tapAction: EMPTY_ACTION,
  };
}

function newBlock(type: BlockType): Block {
  const id = uid();
  if (type === 'text') return { id, type, text: '' };
  if (type === 'image') return { id, type, file: null, previewUrl: null };
  if (type === 'rich') return { id, type, file: null, previewUrl: null, action: EMPTY_ACTION };
  const card = newCard();
  return { id, type: 'cards', cards: [card], selectedId: card.id };
}

const BLOCK_LABELS: Record<BlockType, string> = {
  text: 'ข้อความ', image: 'รูป', rich: 'รูปเต็มจอ', cards: 'การ์ด',
};

/** ไอคอนประจำชนิดบล็อก — คู่กับชื่อบนหัวแถบของบล็อก (รูปเต็มจอ = กรอบแนวตั้ง · การ์ด = แถวเลื่อนแนวนอน) */
const BLOCK_ICONS: Record<BlockType, ReactNode> = {
  text: <MessageSquareText className="w-4 h-4" />,
  image: <ImageIcon className="w-4 h-4" />,
  rich: <RectangleVertical className="w-4 h-4" />,
  cards: <GalleryHorizontalEnd className="w-4 h-4" />,
};

/** ตัวเลือกชนิดบล็อก — มอคห้องแชทชุดเดียวกับการ์ดเลือกชนิดของหน้าจริง */
const BLOCK_OPTIONS = [
  {
    id: 'text' as const, label: BLOCK_LABELS.text, description: 'ข้อความในแชท',
    preview: (
      <MockChat>
        <div className="rounded-xl rounded-tl-sm bg-white p-1.5 space-y-1">
          <MockLine /><MockLine className="w-2/3" />
        </div>
      </MockChat>
    ),
  },
  {
    id: 'image' as const, label: BLOCK_LABELS.image, description: 'รูปในแชทตามปกติ',
    preview: <MockChat><MockPhoto className="w-7/12 h-14 rounded-xl" /></MockChat>,
  },
  { id: 'rich' as const, label: BLOCK_LABELS.rich, description: 'เต็มความกว้าง กดแล้วไปต่อได้', preview: KIND_MOCKS.poster },
  { id: 'cards' as const, label: BLOCK_LABELS.cards, description: 'ใบเดียว/หลายใบ ดึงจากสินค้าได้', preview: KIND_MOCKS.products },
];

// ── สินค้า — ค้นของจริงของบริษัทที่ล็อกอินอยู่ (ต้นแบบเคยใช้สินค้าจำลองแล้วขึ้นผิดร้าน 10 ก.ย. 2026) ──

async function fetchProductPage(q: string): Promise<ServerSearchPage<ProductSearchItem>> {
  const res = await apiFetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=40`);
  if (!res.ok) throw new Error('product search failed');
  const json = await res.json();
  const rows: ProductSearchItem[] = (json.items || []).map((r: Record<string, unknown>) => ({
    id: String(r.variation_id),
    product_id: String(r.product_id),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    image: (r.image_url as string) ?? null,
    variation_label: (r.variation_label as string) ?? undefined,
    default_price: Number(r.default_price) || 0,
    discount_price: Number(r.discount_price) || 0,
  }));
  return { rows, complete: json.complete !== false };
}

function productToCard(p: ProductSearchItem): BroadcastProductCard {
  const discounted = !!p.discount_price && p.discount_price > 0;
  return {
    product_id: p.product_id,
    variation_id: p.id,
    // ชื่อบนการ์ดต้องแยกตัวเลือกออกจากกัน ไม่งั้นได้การ์ดชื่อเดียวกันหลายใบ
    name: p.variation_label ? `${p.name} - ${p.variation_label}` : p.name,
    image_url: p.image ?? null,
    price: discounted ? (p.discount_price as number) : p.default_price ?? 0,
    compare_at_price: discounted ? p.default_price ?? null : null,
    url: null,
  };
}

/** ของที่ ActionPicker/ช่องค้นสินค้าทุกตัวในหน้านี้ใช้ร่วมกัน — หน้าเป็นคนถือผลค้นหา */
interface PickerProps {
  storefrontOpen: boolean;
  productResults: ProductSearchItem[];
  productLoading: boolean;
  onProductSearch: (q: string) => void;
  productToCard: (p: ProductSearchItem) => BroadcastProductCard;
}

// ── ตัวอย่างในแชท (วาดจากบล็อก) ────────────────────────────────────────────

const BUBBLE = 'w-fit max-w-full rounded-2xl rounded-tl-md px-3.5 py-2 bg-white text-gray-900 shadow-sm';
const BTN_PRIMARY = 'block bg-line text-white rounded-lg py-2 text-center subtitle-text font-medium';
const BTN_SECONDARY = 'block bg-gray-200 text-gray-800 rounded-lg py-2 text-center subtitle-text';

function cardImage(c: CardDraft): string | null {
  return c.previewUrl || c.product?.image_url || null;
}

function PreviewCard({ c, wide }: { c: CardDraft; wide: boolean }) {
  const img = cardImage(c);
  const hasBody = !!(c.title.trim() || c.text.trim() || c.buttons.length);
  return (
    <div className={`${wide ? 'w-full' : 'w-4/5'} flex-shrink-0 rounded-xl bg-white overflow-hidden shadow-sm ${hasBody ? 'border border-gray-200' : ''}`}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-gray-100 flex items-center justify-center text-gray-400">
          <ImageIcon className="w-8 h-8" />
        </div>
      )}
      {hasBody && (
        <div className="p-3">
          {c.title.trim() && <p className="body-text font-semibold text-gray-900 line-clamp-2">{c.title}</p>}
          {c.text.trim() && <p className="subtitle-text text-gray-600 mt-0.5 whitespace-pre-wrap">{c.text}</p>}
          {c.buttons.length > 0 && (
            <div className="space-y-2 mt-3">
              {c.buttons.map((b, i) => (
                <p key={b.id} className={i === 0 ? BTN_PRIMARY : BTN_SECONDARY}>{b.label.trim() || 'ปุ่ม'}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 1 บล็อก = 1 message object ที่ LINE ส่ง → 1 ก้อนในจอมือถือ
 * การ์ดกับรูปเต็มจอเป็นแบบกว้าง (ตกบรรทัดใต้รูปโปรไฟล์) · หัวห้องแชทใช้บัญชีแรกที่เลือก
 */
function BlocksPreview({ blocks, quickReplies, account }: {
  blocks: Block[]; quickReplies: string[]; account: PickerAccount | null;
}) {
  const messages: PhoneChatMessage[] = blocks.map(b => {
    if (b.type === 'text') {
      return {
        key: b.id,
        node: (
          <div className={BUBBLE}>
            <p className="subtitle-text whitespace-pre-wrap break-words">{b.text.trim() || 'ข้อความ'}</p>
          </div>
        ),
      };
    }
    if (b.type === 'image') {
      return {
        key: b.id,
        node: b.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.previewUrl} alt="" className="w-8/12 h-auto rounded-2xl shadow-sm" />
        ) : (
          <div className="w-8/12 h-28 rounded-2xl bg-gray-200 flex items-center justify-center text-gray-400">
            <ImageIcon className="w-6 h-6" />
          </div>
        ),
      };
    }
    if (b.type === 'rich') {
      // รูปเต็มจอไม่มีข้อความบนตัวมันเอง — อยากมีข้อความให้เพิ่มบล็อกข้อความแยก
      return {
        key: b.id,
        wide: true,
        node: b.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.previewUrl} alt="" className="block w-full h-auto rounded-lg" />
        ) : (
          <div className="w-full h-40 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400">
            <ImageIcon className="w-8 h-8" />
          </div>
        ),
      };
    }
    return {
      key: b.id,
      wide: true,
      node: (
        <div className="phone-mock-hscroll flex gap-2">
          {b.cards.map(c => <PreviewCard key={c.id} c={c} wide={b.cards.length === 1} />)}
        </div>
      ),
    };
  });

  return (
    <LinePhonePreview
      accountName={account?.name ?? null}
      accountPictureUrl={account?.picture_url ?? null}
      messages={messages}
      quickReplies={quickReplies}
    />
  );
}

// ── ตัวแก้ไขการ์ด: แถบแนวนอน (ลากเรียงได้) + แก้ทีละใบ ───────────────────────

function SortableCardTile({ c, index, selected, onSelect }: { c: CardDraft; index: number; selected: boolean; onSelect: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: c.id });
  const img = cardImage(c);
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
      <p className="helper-text mt-1 truncate text-center">{c.title.trim() || c.product?.name || `การ์ด ${index + 1}`}</p>
    </button>
  );
}

function CardsEditor({ block, onChange, picker }: {
  block: Extract<Block, { type: 'cards' }>;
  onChange: (b: Extract<Block, { type: 'cards' }>) => void;
  picker: PickerProps;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const selected = block.cards.find(c => c.id === block.selectedId) ?? block.cards[0];
  const selectedIndex = block.cards.findIndex(c => c.id === selected?.id);

  const patchCard = (id: string, patch: Partial<CardDraft>) =>
    onChange({ ...block, cards: block.cards.map(c => (c.id === id ? { ...c, ...patch } : c)) });
  const addCard = () => {
    if (block.cards.length >= MAX_CARDS) return;
    const c = newCard();
    onChange({ ...block, cards: [...block.cards, c], selectedId: c.id });
  };
  const removeCard = (id: string) => {
    const cards = block.cards.filter(c => c.id !== id);
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
  const pickProduct = (c: CardDraft, p: ProductSearchItem) => {
    const product = picker.productToCard(p);
    // ร้านเปิดหน้าร้านออนไลน์ = ปุ่มพาไปหน้าสินค้า · ยังไม่เปิด = ส่ง "สนใจ …" เข้าห้องแชท
    // (กติกาเดิมของการ์ดสินค้า — ตั้งปุ่มไปที่สินค้าไว้ตายตัวจะได้ปุ่มที่ส่งจริงไม่ได้)
    const button: CardButton = picker.storefrontOpen
      ? { id: uid(), label: 'สั่งเลย', action: { type: 'product', product } }
      : { id: uid(), label: 'สนใจสินค้านี้', action: { type: 'message', text: `สนใจ ${product.name}`.slice(0, ACTION_MESSAGE_MAX) } };
    patchCard(c.id, {
      source: 'product', product, title: product.name,
      text: product.price != null ? formatPrice(product.price) : '',
      buttons: [button],
      // กดที่ตัวการ์ด = ทำเหมือนปุ่มแรก — ลูกค้าส่วนใหญ่แตะที่รูปสินค้า ไม่ใช่ที่ปุ่ม
      tapAction: button.action,
    });
  };

  return (
    <div className="space-y-3">
      <p className="subtitle-text">
        {block.cards.length === 1 ? 'ใบเดียว = การ์ดใหญ่เต็มจอ' : `${block.cards.length} ใบ = แถวเลื่อนดู`} · กดการ์ดเพื่อแก้ · ลากเพื่อสลับลำดับ
      </p>
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
            {block.cards.length < MAX_CARDS && (
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

      {selected && (
        // การ์ดที่กำลังแก้ = การ์ดกลาง (.card — ขาว ขอบ เงา) บนพื้นจมของกล่องบล็อก ไม่ใช่กรอบที่พิมพ์สีเอง
        <Card padding="sm" className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="field-label">การ์ดที่ {selectedIndex + 1}</p>
            <FilterChips<'custom' | 'product'>
              value={selected.source}
              onChange={source => patchCard(selected.id, { source })}
              chips={[
                { id: 'custom', label: 'เขียนเอง', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
                { id: 'product', label: 'จากสินค้า', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, tooltip: 'ดึงรูป ชื่อ ราคา และปุ่มสั่งซื้อจากคลังให้' },
              ]}
            />
            {block.cards.length > 1 && (
              <Button
                variant="ghost"
                icon={<Trash2 className="w-4 h-4" />}
                aria-label="เอาการ์ดนี้ออก"
                className="ml-auto"
                onClick={() => removeCard(selected.id)}
              />
            )}
          </div>

          {selected.source === 'product' && !selected.product && (
            <ProductSearchInput
              products={picker.productResults}
              loading={picker.productLoading}
              onSearchChange={picker.onProductSearch}
              onSelect={p => pickProduct(selected, p)}
            />
          )}

          <div className="grid md:grid-cols-[180px_minmax(0,1fr)] gap-4">
            <div>
              <p className="field-label mb-1">รูป</p>
              <ImageDropzone
                value={selected.file}
                onChange={f => patchCard(selected.id, { file: f, previewUrl: f ? URL.createObjectURL(f) : null })}
                initialPreviewUrl={selected.product?.image_url ?? null}
                label="เลือกรูป"
                hint="รูปจัตุรัส 1:1"
                square
                changeOnClick
                // 1024 = เพดานรูปใน Flex (การ์ด) ของ LINE · 1040 ที่เห็นใน OA Manager เป็นของ Rich message
                // (imagemap) ซึ่งเป็น message คนละชนิด — เราส่งการ์ดเป็น Flex จึงยึด 1024
                maxWidthOrHeight={1024}
                maxSizeMB={0.3}
              />
            </div>
            <div className="space-y-3">
              <FormInput
                label="หัวข้อ (ไม่บังคับ)"
                value={selected.title}
                maxLength={CARD_TITLE_MAX}
                onChange={e => patchCard(selected.id, { title: e.target.value })}
                placeholder="ไม่ใส่ = การ์ดรูปล้วน"
                hint={`${selected.title.length}/${CARD_TITLE_MAX}`}
              />
              <FormTextarea
                label="ข้อความ (ไม่บังคับ)"
                value={selected.text}
                maxLength={CARD_TEXT_MAX}
                rows={2}
                onChange={e => patchCard(selected.id, { text: e.target.value })}
              />
            </div>
          </div>

          {/* กดที่ตัวการ์ดแล้วเกิดอะไร — อยู่ก่อนปุ่ม เพราะเป็นพฤติกรรมพื้นฐานของการ์ด ปุ่มเป็นของเสริมทีหลัง
              (เจ้าของขอ 11 ก.ย. 2026) · Flex ให้ตัวการ์ด (hero/body) กับปุ่มมี action ของตัวเองพร้อมกันได้ */}
          <ActionPicker
            label="กดการ์ดแล้ว"
            value={selected.tapAction}
            onChange={tapAction => patchCard(selected.id, { tapAction })}
            {...picker}
          />

          <div>
            <p className="field-label mb-1">ปุ่ม (ไม่บังคับ · สูงสุด {MAX_CARD_BUTTONS})</p>
            {/* ปุ่มละแถวเดียว: ป้าย + กลุ่มปุ่ม action + ช่องกรอกของ action + ถังขยะ */}
            <div className="divide-y divide-gray-200 dark:divide-slate-600">
              {selected.buttons.map((b, i) => (
                <div key={b.id} className="flex flex-wrap gap-2 items-start py-2 first:pt-0 last:pb-0">
                  <div className="w-40 flex-shrink-0">
                    <FormInput
                      value={b.label}
                      maxLength={BUTTON_LABEL_MAX}
                      placeholder={i === 0 ? 'เช่น สั่งเลย' : 'เช่น ดูรายละเอียด'}
                      aria-label={`ข้อความบนปุ่มที่ ${i + 1}`}
                      onChange={e => patchCard(selected.id, { buttons: selected.buttons.map(x => (x.id === b.id ? { ...x, label: e.target.value } : x)) })}
                    />
                  </div>
                  <div className="flex-1 min-w-72">
                    <ActionPicker
                      value={b.action}
                      onChange={action => patchCard(selected.id, { buttons: selected.buttons.map(x => (x.id === b.id ? { ...x, action } : x)) })}
                      {...picker}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    icon={<Trash2 className="w-4 h-4" />}
                    aria-label="ลบปุ่ม"
                    onClick={() => patchCard(selected.id, { buttons: selected.buttons.filter(x => x.id !== b.id) })}
                  />
                </div>
              ))}
            </div>
            {selected.buttons.length < MAX_CARD_BUTTONS && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                className="mt-2"
                onClick={() => patchCard(selected.id, { buttons: [...selected.buttons, { id: uid(), label: '', action: EMPTY_ACTION }] })}
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

function SortableBlock({ block, index, onChange, onRemove, picker }: {
  block: Block; index: number; onChange: (b: Block) => void; onRemove: () => void; picker: PickerProps;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: block.id });
  let editor: ReactNode;
  if (block.type === 'text') {
    editor = (
      <MessageComposer value={block.text} onChange={text => onChange({ ...block, text })} maxLength={5000} rows={3} placeholder="พิมพ์ข้อความที่จะส่งถึงลูกค้า" />
    );
  } else if (block.type === 'image') {
    editor = (
      <MessageComposer
        emptyHint="รูปในแชทตามปกติ"
        image={{ file: block.file, onChange: f => onChange({ ...block, file: f, previewUrl: f ? URL.createObjectURL(f) : null }), previewUrl: block.previewUrl, maxWidthOrHeight: 1024, maxSizeMB: 0.3 }}
      />
    );
  } else if (block.type === 'rich') {
    editor = (
      <div className="space-y-3">
        <MessageComposer
          emptyHint="แนะนำแนวตั้ง 4:5 · สูงสุด 1:3 (สูงได้ 3 เท่าของความกว้าง)"
          image={{ file: block.file, onChange: f => onChange({ ...block, file: f, previewUrl: f ? URL.createObjectURL(f) : null }), previewUrl: block.previewUrl, maxWidthOrHeight: 1024, maxSizeMB: 0.3 }}
        />
        <ActionPicker label="กดรูปแล้ว" value={block.action} onChange={action => onChange({ ...block, action })} {...picker} />
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
        {/* ชนิดของบล็อก = ไอคอน + ชื่อ ชิดขวาข้างถังขยะ (เจ้าของขอ 11 ก.ย. 2026 แทนป้าย pill)
            ตัวหนังสือขนาดเดียวกับ "บล็อก N" จึงอยู่แนวเดียวกัน */}
        <span className="ml-auto inline-flex items-center gap-1.5 subtitle-text font-medium text-gray-700 dark:text-slate-200">
          {BLOCK_ICONS[block.type]}
          {BLOCK_LABELS[block.type]}
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

// ── หน้า ─────────────────────────────────────────────────────────────────────

export default function BroadcastEditorPrototypePage() {
  const [blocks, setBlocks] = useState<Block[]>([newBlock('text')]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  /** ค้นสินค้าฝั่ง server ของบริษัทที่ล็อกอินอยู่ — ตัวเดียวกับที่หน้าสร้างจริงใช้ */
  const productSearch = useServerSearch<ProductSearchItem>({ fetch: fetchProductPage });
  /** ร้านเปิดหน้าร้านออนไลน์แล้วไหม — ชิป "ไปที่สินค้า" ใช้ได้เฉพาะตอนเปิดแล้ว */
  const [storefrontOpen, setStorefrontOpen] = useState(false);
  /**
   * บัญชี LINE ของบริษัทที่ล็อกอินอยู่ — ตัวอย่างใช้ชื่อ+รูปของบัญชีแรกที่เลือก
   * (เดิมพิมพ์ชื่อร้านไว้ตายตัวและไม่มีรูป ตัวอย่างจึงขึ้นตัวอักษร "A" แทนโลโก้ — เจ้าของท้วง 10 ก.ย. 2026)
   */
  const [accounts, setAccounts] = useState<PickerAccount[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storefront, chat] = await Promise.allSettled([
        apiFetch('/api/settings/storefront').then(r => (r.ok ? r.json() : null)),
        apiFetch('/api/chat-accounts').then(r => (r.ok ? r.json() : null)),
      ]);
      if (cancelled) return;
      // ถามไม่ได้ = ถือว่ายังไม่เปิด (ชิปจะปิดพร้อมบอกเหตุผล)
      if (storefront.status === 'fulfilled') {
        setStorefrontOpen(!!storefront.value?.storefront?.enabled && !!storefront.value?.slug);
      }
      if (chat.status === 'fulfilled') {
        // API คืน picture_url ที่ผ่าน resolveAccountPicture() มาแล้ว (รูป OA) — ตัวเดียวกับหน้าสร้างจริง
        const list: PickerAccount[] = (chat.value?.accounts || [])
          .filter((a: { is_active?: boolean; platform?: string }) => a.is_active && a.platform === 'line')
          .map((a: { id: string; account_name?: string; picture_url?: string | null }) => ({
            id: a.id,
            platform: 'line',
            name: a.account_name || 'LINE OA',
            picture_url: a.picture_url ?? null,
          }));
        setAccounts(list);
        setAccountIds(list[0] ? [list[0].id] : []);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  // เลือกหลายบัญชี = ตัวอย่างใช้บัญชีแรกตามลำดับรายการ (กติกาเดียวกับ selectedAccounts[0] ของหน้าสร้างจริง)
  const previewAccount = accounts.find(a => accountIds.includes(a.id)) ?? null;
  const picker: PickerProps = {
    storefrontOpen,
    productResults: productSearch.results,
    productLoading: productSearch.loading,
    onProductSearch: productSearch.search,
    productToCard,
  };
  // @dnd-kit สร้าง id ภายในต่างกันระหว่าง SSR/CSR — วาง DndContext หลัง mount เท่านั้น (เหตุผลเดียวกับ DataTable)
  // ใช้ useSyncExternalStore แทน setState ใน effect: server snapshot = false · client = true
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setBlocks(prev => {
      const from = prev.findIndex(b => b.id === active.id);
      const to = prev.findIndex(b => b.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };
  const replaceBlock = (next: Block) => setBlocks(prev => prev.map(b => (b.id === next.id ? next : b)));

  const list = (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <SortableBlock
          key={b.id}
          block={b}
          index={i}
          onChange={replaceBlock}
          onRemove={() => setBlocks(prev => prev.filter(x => x.id !== b.id))}
          picker={picker}
        />
      ))}
    </div>
  );

  return (
    <Layout>
      <Container size="6xl">
        <PageHeader
          backHref="/dev/design"
          title="ต้นแบบ: ตัวแก้ไขบรอดแคสต์แบบบล็อก"
          subtitle="เพิ่มบล็อกทีละชนิด ลากสลับลำดับได้ · การ์ดเป็นแถบแนวนอน กดทีละใบเพื่อแก้ · ค้นสินค้าจริงของร้านที่เปิดอยู่ · ยังไม่บันทึกอะไร"
        />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_372px] gap-4 items-start">
          <div className="space-y-4">
            <Card padding="md">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="heading-4">สิ่งที่จะส่ง</h2>
                <span className="section-desc text-right">
                  บล็อก {blocks.length}/{MAX_BLOCKS} · ส่งครั้งเดียวนับ 1 ข้อความในโควตา
                </span>
              </div>

              {mounted ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    {list}
                  </SortableContext>
                </DndContext>
              ) : list}

              {blocks.length < MAX_BLOCKS ? (
                <div className="mt-4">
                  <p className="field-label mb-1">+ เพิ่มบล็อก</p>
                  <OptionCards<BlockType | ''>
                    value=""
                    onChange={type => { if (type) setBlocks(prev => [...prev, newBlock(type)]); }}
                    previewSize="lg"
                    columns={4}
                    options={BLOCK_OPTIONS}
                  />
                </div>
              ) : (
                <p className="subtitle-text mt-4">ครบ {MAX_BLOCKS} บล็อกแล้ว — เอาบล็อกออกก่อนถ้าจะเปลี่ยน</p>
              )}
            </Card>

            <Card padding="md">
              <ChipsInput
                label="ปุ่มตอบเร็ว (ไม่บังคับ)"
                description="ลูกค้ากดแล้วข้อความเข้าห้องแชททันที — อยู่ท้ายสุดของทุกบล็อก"
                value={quickReplies}
                onChange={setQuickReplies}
                max={13}
                maxLength={BUTTON_LABEL_MAX}
                placeholder="เช่น สนใจ / ขอรายละเอียด"
                removeLabel={q => `เอาปุ่ม ${q} ออก`}
              />
            </Card>
          </div>

          <div className="xl:sticky xl:top-4">
            <Card padding="md">
              <p className="field-label mb-1">ส่งจากบัญชี</p>
              <AccountPicker
                accounts={accounts}
                value={accountIds}
                onChange={setAccountIds}
                placeholder="เลือกบัญชี LINE"
                emptyMessage="ยังไม่มีบัญชี LINE ที่เชื่อมต่อ"
              />
              {accountIds.length > 1 && previewAccount && (
                <p className="subtitle-text mt-1">เลือกหลายบัญชี — ตัวอย่างใช้ชื่อและรูปของ {previewAccount.name}</p>
              )}
              <p className="field-label mt-4 mb-2">ตัวอย่างในแชทของลูกค้า</p>
              <BlocksPreview blocks={blocks} quickReplies={quickReplies} account={previewAccount} />
            </Card>
          </div>
        </div>
      </Container>
    </Layout>
  );
}
