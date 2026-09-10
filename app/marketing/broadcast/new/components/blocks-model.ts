// Path: app/marketing/broadcast/new/components/blocks-model.ts
//
// ข้อมูลของตัวแก้ไขเนื้อหาแบบบล็อก (ฝั่งหน้าจอ) + ตัวแปลงไป/กลับเนื้อหาชนิดกลาง `BroadcastContent`
//
// ตัวแก้ไขถือของที่ยังไม่ได้บันทึก (ไฟล์ที่ยังไม่อัป · object URL · เนื้อหาแยกต่อแท็บของการ์ด) แล้วแปลงเป็น
// `content.blocks` ด้วย `editorToContent()` ตัวเดียว — ตรวจ · แสดงตัวอย่าง · ส่ง ต่างกันแค่ "รูปอยู่ที่ไหน":
//   draftImage          ยังไม่อัป → ค่าแทน https (ให้ validate ตรวจได้ก่อนอัป)
//   previewImage        object URL ของไฟล์ (ตัวอย่างในแชทเห็นรูปก่อนอัป)
//   uploadedImage(map)  URL จริงหลังอัปตอนกดส่ง
// ⚠️ **ไม่มีอะไรขึ้น storage จนกว่าจะกดส่ง** — เลือกรูปแล้วแค่ย่อในเครื่อง (เจ้าของถาม 11 ก.ย. 2026)
//
// ใบเก่า (announce/poster/gallery/promo/products) กด "ส่งซ้ำ" แล้วแปลงเป็นบล็อกที่ `contentToEditor()`

import {
  ACTION_MESSAGE_MAX,
  BLOCKS_MAX,
  BLOCK_CARDS_MAX,
  BLOCK_CARD_TEXT_MAX,
  BLOCK_CARD_TITLE_MAX,
  CARD_BUTTONS_MAX,
  EMPTY_ACTION,
  buttonAction,
  isActionEmpty,
  posterAction,
  type BroadcastAction,
  type BroadcastBlock,
  type BroadcastBlockType,
  type BroadcastCard,
  type BroadcastCardRatio,
  type BroadcastContent,
  type BroadcastProductCard,
} from '@/lib/broadcast/content';
import { formatPrice } from '@/lib/utils/format';

export interface EditorCardButton {
  id: string;
  label: string;
  action: BroadcastAction;
}

/** เนื้อหาบนการ์ด 1 ชุด — แต่ละแท็บ (สินค้าในร้าน / ทำการ์ดเอง) มีชุดของตัวเอง สลับแท็บแล้วของเดิมไม่หาย */
export interface EditorCardFace {
  title: string;
  text: string;
  /** ปุ่มล่างการ์ด (ไม่บังคับ) — ปุ่มแรก = ปุ่มหลักสีเขียว */
  buttons: EditorCardButton[];
  /** กดที่ตัวการ์ด — ว่าง = ตัวการ์ดกดไม่ได้ (ปุ่มยังกดได้) */
  tapAction: BroadcastAction;
}

/** รูปที่ยังไม่ได้บันทึก — ไฟล์ที่เพิ่งเลือก (ยังไม่อัป) หรือรูปเดิมของใบที่คัดลอกมา */
export interface EditorImage {
  file: File | null;
  /** object URL ของ `file` — ตัวแก้ไขเป็นคนสร้าง/คืน */
  previewUrl: string | null;
  existingUrl: string | null;
}

export interface EditorCard extends EditorImage {
  id: string;
  /**
   * แท็บที่เลือก = การ์ดมาจากไหน (เดิมเป็นชิป "เขียนเอง / จากสินค้า" ที่เจ้าของอ่านแล้วงง 11 ก.ย. 2026)
   *  product = รูป ชื่อ ราคา มาจากสินค้าในร้าน — ไม่มีช่องอัปรูป · custom = อัปรูปและพิมพ์เอง
   */
  source: 'product' | 'custom';
  product: BroadcastProductCard | null;
  productFace: EditorCardFace;
  customFace: EditorCardFace;
}

/** ขนาดจริงของรูป — รูปเต็มจอบอกสัดส่วนให้ Flex (ไม่รู้ = ทรงเริ่มต้น โปสเตอร์แนวตั้งโดนครอบ) */
interface ImageSize {
  width: number | null;
  height: number | null;
}

export type EditorBlock =
  | { id: string; type: 'text'; text: string }
  | ({ id: string; type: 'image' } & EditorImage & ImageSize)
  | ({ id: string; type: 'rich'; action: BroadcastAction } & EditorImage & ImageSize)
  | { id: string; type: 'cards'; cards: EditorCard[]; selectedId: string; ratio: BroadcastCardRatio };

export type EditorImageBlock = Extract<EditorBlock, { type: 'image' | 'rich' }>;
export type EditorCardsBlock = Extract<EditorBlock, { type: 'cards' }>;

/** id ภายในตัวแก้ไข (key · จับคู่ตอนแก้/ลาก) — ไม่ถูกส่งออกไปกับเนื้อหา */
export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyFace(): EditorCardFace {
  return { title: '', text: '', buttons: [], tapAction: EMPTY_ACTION };
}

export function newCard(source: EditorCard['source'] = 'product'): EditorCard {
  return {
    id: newId(), source, product: null, productFace: emptyFace(), customFace: emptyFace(),
    file: null, previewUrl: null, existingUrl: null,
  };
}

/** เนื้อหาของแท็บที่เลือกอยู่ — ตัวอย่างแชทกับตัวแก้ไขอ่านจากนี่ที่เดียว */
export function faceOf(c: EditorCard): EditorCardFace {
  return c.source === 'product' ? c.productFace : c.customFace;
}

export function newBlock(type: BroadcastBlockType): EditorBlock {
  const id = newId();
  if (type === 'text') return { id, type, text: '' };
  const image = { file: null, previewUrl: null, existingUrl: null, width: null, height: null };
  if (type === 'image') return { id, type, ...image };
  if (type === 'rich') return { id, type, ...image, action: EMPTY_ACTION };
  const card = newCard();
  return { id, type: 'cards', cards: [card], selectedId: card.id, ratio: '1:1' };
}

/**
 * หน้าการ์ดตั้งต้นจากสินค้า — ชื่อ ราคา และปุ่มตามสถานะหน้าร้าน:
 * เปิดแล้ว = "สั่งเลย" ไปหน้าสินค้า · ยังไม่เปิด = "สนใจสินค้านี้" ส่งข้อความเข้าห้องแชท
 * (ตั้งปุ่มไปที่สินค้าไว้ตายตัวจะได้ปุ่มที่ส่งจริงไม่ได้) · กดตัวการ์ด = ทำเหมือนปุ่มแรก —
 * ลูกค้าส่วนใหญ่แตะที่รูปสินค้า ไม่ใช่ที่ปุ่ม
 */
export function faceFromProduct(product: BroadcastProductCard, storefrontOpen: boolean): EditorCardFace {
  const action: BroadcastAction = storefrontOpen
    ? { type: 'product', product }
    : { type: 'message', text: `สนใจ ${product.name}`.slice(0, ACTION_MESSAGE_MAX) };
  return {
    title: product.name.slice(0, BLOCK_CARD_TITLE_MAX),
    text: product.price != null ? formatPrice(product.price) : '',
    buttons: [{ id: newId(), label: storefrontOpen ? 'สั่งเลย' : 'สนใจสินค้านี้', action }],
    tapAction: action,
  };
}

/**
 * วัดขนาดรูป — จากไฟล์ที่เพิ่งเลือก หรือจาก URL ของใบที่คัดลอกมา
 * วัดไม่ได้ = null แล้วตัวส่งตกไปใช้ทรงเริ่มต้น
 */
export async function measureImageDims(source: File | string): Promise<{ width: number; height: number } | null> {
  if (typeof source !== 'string' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    } catch {
      // เบราว์เซอร์เก่าไม่มี createImageBitmap — ตกไปวิธีสำรองข้างล่าง
    }
  }
  return new Promise(resolve => {
    const src = typeof source === 'string' ? source : URL.createObjectURL(source);
    const objectUrl = typeof source === 'string' ? null : src;
    const img = new window.Image();
    const done = (dims: { width: number; height: number } | null) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(dims);
    };
    img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => done(null);
    img.src = src;
  });
}

/** เริ่มกรอกอะไรแล้วหรือยัง — ตัวอย่างในแผงขวาขึ้นเมื่อมีของให้ดู */
export function hasEditorContent(blocks: EditorBlock[]): boolean {
  return blocks.some(b => {
    if (b.type === 'text') return !!b.text.trim();
    if (b.type === 'image') return !!(b.file || b.existingUrl);
    if (b.type === 'rich') return !!(b.file || b.existingUrl) || !isActionEmpty(b.action);
    return b.cards.some(c => {
      const f = faceOf(c);
      return !!(c.product || c.file || c.existingUrl || f.title.trim() || f.text.trim());
    });
  });
}

/**
 * เรื่องที่ตัวตรวจกลางมองไม่เห็น — การ์ดแท็บ "สินค้าในร้าน" ที่ยังไม่เลือกสินค้าส่งออกไปเป็นการ์ดเปล่า
 * validate จึงบอกได้แค่ "ใส่รูปหรือข้อความ" ซึ่งไม่ตรงกับสิ่งที่ผู้ใช้เห็นบนแท็บนั้น
 */
export function editorBlocksError(blocks: EditorBlock[]): string | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'cards') continue;
    const j = b.cards.findIndex(c => c.source === 'product' && !c.product);
    if (j >= 0) return `บล็อก ${i + 1} การ์ดที่ ${j + 1}: เลือกสินค้า หรือเปลี่ยนเป็นแท็บ "ทำการ์ดเอง"`;
  }
  return null;
}

/** ไฟล์ที่ต้องอัปตอนกดส่ง — รูป/รูปเต็มจอ + รูปของการ์ดที่ทำเอง (การ์ดจากสินค้าใช้รูปสินค้า) */
export function editorFiles(blocks: EditorBlock[]): File[] {
  const files: File[] = [];
  for (const b of blocks) {
    if ((b.type === 'image' || b.type === 'rich') && b.file) files.push(b.file);
    if (b.type === 'cards') {
      for (const c of b.cards) if (c.source === 'custom' && c.file) files.push(c.file);
    }
  }
  return files;
}

/** คืน object URL ทั้งหมดของบล็อกที่กำลังจะเอาออก */
export function revokeEditorUrls(b: EditorBlock): void {
  if ((b.type === 'image' || b.type === 'rich') && b.previewUrl) URL.revokeObjectURL(b.previewUrl);
  if (b.type === 'cards') {
    for (const c of b.cards) if (c.previewUrl) URL.revokeObjectURL(c.previewUrl);
  }
}

// ── ไป: ตัวแก้ไข → เนื้อหาชนิดกลาง ───────────────────────────────────────────

/** URL แทนรูปที่ยังไม่อัป — ขึ้นต้น https ให้ตัวตรวจผ่าน · ห้ามหลุดไปถึง API (กดส่งแทนด้วย URL จริงเสมอ) */
const PENDING_UPLOAD_URL = 'https://pending.upload';

export type ImageResolver = (img: EditorImage) => string | null;
export const draftImage: ImageResolver = i => (i.file ? PENDING_UPLOAD_URL : i.existingUrl);
export const previewImage: ImageResolver = i => (i.file ? i.previewUrl : i.existingUrl);
export function uploadedImage(urls: Map<File, string>): ImageResolver {
  return i => (i.file ? urls.get(i.file) ?? null : i.existingUrl);
}

export function editorToContent(blocks: EditorBlock[], quickReplies: string[], image: ImageResolver): BroadcastContent {
  return {
    kind: 'blocks',
    text: '',
    blocks: blocks.map((b): BroadcastBlock => {
      if (b.type === 'text') return { type: 'text', text: b.text.trim() };
      if (b.type === 'image' || b.type === 'rich') {
        const img = { image_url: image(b) || '', image_width: b.width, image_height: b.height };
        return b.type === 'image' ? { type: 'image', ...img } : { type: 'rich', ...img, action: b.action };
      }
      return {
        type: 'cards',
        ratio: b.ratio,
        cards: b.cards.map((c): BroadcastCard => {
          const face = faceOf(c);
          const fromProduct = c.source === 'product';
          return {
            product: fromProduct ? c.product : null,
            image_url: fromProduct ? (c.product?.image_url ?? null) : image(c),
            title: face.title.trim(),
            text: face.text.trim(),
            // ปุ่มที่ยังไม่ได้แตะเลย (ป้ายว่าง + action ว่าง) ไม่ส่ง — ไม่งั้น validate ตีตกปุ่มที่เพิ่งกดเพิ่ม
            buttons: face.buttons
              .filter(btn => btn.label.trim() || !isActionEmpty(btn.action))
              .map(btn => ({ label: btn.label.trim(), action: btn.action })),
            tap_action: isActionEmpty(face.tapAction) ? null : face.tapAction,
          };
        }),
      };
    }),
    quick_replies: quickReplies,
  };
}

// ── กลับ: เนื้อหาของใบเก่า → ตัวแก้ไข (ส่งซ้ำ ?from=) ────────────────────────────

/**
 * ลิงก์หน้าสินค้าถูกเติมตอนส่งใบเดิม — ล้างทิ้งให้ API เติมใหม่ตอนส่ง
 * (API ไม่ทับลิงก์ที่มีอยู่แล้ว ลิงก์เก่าจะค้างถ้าร้านเปลี่ยนชื่อลิงก์หน้าร้านไปแล้ว)
 */
function freshProduct(p: BroadcastProductCard): BroadcastProductCard {
  return { ...p, url: null };
}
function freshAction(a: BroadcastAction | null | undefined): BroadcastAction {
  if (!a) return EMPTY_ACTION;
  return a.type === 'product' && a.product ? { type: 'product', product: freshProduct(a.product) } : a;
}

function imageFrom(url: string | null | undefined, w?: number | null, h?: number | null): EditorImage & ImageSize {
  return { file: null, previewUrl: null, existingUrl: url || null, width: w ?? null, height: h ?? null };
}

function cardsBlock(cards: EditorCard[]): EditorCardsBlock {
  return { id: newId(), type: 'cards', cards, selectedId: cards[0].id, ratio: '1:1' };
}

function cardToEditor(card: BroadcastCard): EditorCard {
  const face: EditorCardFace = {
    title: card.title || '',
    text: card.text || '',
    buttons: (card.buttons || []).map(b => ({ id: newId(), label: b.label || '', action: freshAction(b.action) })),
    tapAction: freshAction(card.tap_action),
  };
  if (card.product) return { ...newCard('product'), product: freshProduct(card.product), productFace: face };
  return { ...newCard('custom'), existingUrl: card.image_url, customFace: face };
}

function blockToEditor(b: BroadcastBlock): EditorBlock {
  if (b.type === 'text') return { id: newId(), type: 'text', text: b.text };
  if (b.type === 'image') return { id: newId(), type: 'image', ...imageFrom(b.image_url, b.image_width, b.image_height) };
  if (b.type === 'rich') {
    return { id: newId(), type: 'rich', ...imageFrom(b.image_url, b.image_width, b.image_height), action: freshAction(b.action) };
  }
  const cards = (b.cards || []).map(cardToEditor);
  return { ...cardsBlock(cards.length ? cards : [newCard()]), ratio: b.ratio === '3:4' ? '3:4' : '1:1' };
}

/**
 * ใบเก่าทุกชนิด → บล็อก (≤ BLOCKS_MAX)
 *  ประกาศ = ข้อความ (หัวข้อ+ข้อความ) + รูป (แบบ rich ของใบเก่า = รูปเต็มจอ) · โปสเตอร์ = ข้อความ + รูปเต็มจอ ·
 *  รูปหลายใบ = ข้อความ + การ์ดรูปล้วน · โปรโมชัน = การ์ดทำเองใบเดียว · การ์ดสินค้า = ข้อความ + การ์ดจากสินค้า
 */
export function contentToEditor(c: BroadcastContent): { blocks: EditorBlock[]; quickReplies: string[] } {
  const quickReplies = (c.quick_replies || []).map(q => q.trim()).filter(Boolean);
  const text = (c.text || '').trim();
  const blocks: EditorBlock[] = [];
  const pushText = (t: string) => { if (t) blocks.push({ id: newId(), type: 'text', text: t }); };
  const imageOfContent = () => imageFrom(c.image_url, c.image_width, c.image_height);

  switch (c.kind) {
    case 'blocks':
      for (const b of c.blocks || []) blocks.push(blockToEditor(b));
      break;
    case 'poster':
      pushText(text);
      if (c.image_url) blocks.push({ id: newId(), type: 'rich', ...imageOfContent(), action: freshAction(posterAction(c)) });
      break;
    case 'gallery': {
      pushText(text);
      const cards = (c.images || []).filter(i => i.image_url).slice(0, BLOCK_CARDS_MAX).map(img => ({
        ...newCard('custom'),
        existingUrl: img.image_url,
        customFace: { ...emptyFace(), tapAction: freshAction(img.action) },
      }));
      if (cards.length) blocks.push(cardsBlock(cards));
      break;
    }
    case 'promo': {
      const buttons = (c.buttons || []).slice(0, CARD_BUTTONS_MAX)
        .map(b => ({ id: newId(), label: b.label || '', action: freshAction(buttonAction(b)) }));
      blocks.push(cardsBlock([{
        ...newCard('custom'),
        existingUrl: c.image_url || null,
        customFace: {
          title: (c.title || '').trim().slice(0, BLOCK_CARD_TITLE_MAX),
          text: text.slice(0, BLOCK_CARD_TEXT_MAX),
          buttons,
          // ใบเก่าแตะรูปแล้วไปตามปุ่มแรก — การ์ดใหม่ทำเหมือนเดิม
          tapAction: buttons[0]?.action ?? EMPTY_ACTION,
        },
      }]));
      break;
    }
    case 'products': {
      pushText(text);
      // ลิงก์หน้าสินค้าถูกเติมตอนส่งใบเดิม — มี = ร้านเปิดหน้าร้านอยู่ตอนนั้น
      const cards = (c.products || []).slice(0, BLOCK_CARDS_MAX).map(p => ({
        ...newCard('product'),
        product: freshProduct(p),
        productFace: faceFromProduct(freshProduct(p), !!p.url),
      }));
      if (cards.length) blocks.push(cardsBlock(cards));
      break;
    }
    default: {
      // ประกาศ
      pushText([c.title, c.text].map(s => (s || '').trim()).filter(Boolean).join('\n'));
      if (c.image_url) {
        blocks.push(c.image_style === 'rich'
          ? { id: newId(), type: 'rich', ...imageOfContent(), action: freshAction(posterAction(c)) }
          : { id: newId(), type: 'image', ...imageOfContent() });
      }
    }
  }

  return { blocks: blocks.slice(0, BLOCKS_MAX), quickReplies };
}
