// Path: lib/order-progress.ts
// สถานะออเดอร์แบบ "ถึงขั้นไหนแล้ว" สำหรับหน้าที่ลูกค้าเปิดดูเอง
// (หน้าคำสั่งซื้อในหน้าร้าน + บิลออนไลน์) — client-safe, ไม่มี dependency
//
// ทำไมต้องแยกเป็นไฟล์กลาง: สองหน้านี้คนละดีไซน์คนละ CSS แต่ต้องพูดตรงกันเป๊ะ
// ถ้าต่างคนต่าง map สถานะเอง วันหนึ่งลูกค้าจะเห็นบิลบอก "จัดส่งแล้ว" แต่หน้าร้าน
// ยังบอก "เตรียมของ" แล้วโทรมาถามร้าน
//
// ⚠️ แต่ละขั้นคิดสถานะของตัวเอง ไม่ใช่ไล่เป็นเส้นตรง — ออเดอร์เครดิต (w_credit)
// ส่งของก่อนแล้วค่อยเก็บเงิน ขั้น "ชำระเงิน" จึงยังค้างอยู่ได้ทั้งที่ส่งของแล้ว

export type StepState = 'done' | 'current' | 'todo';

export interface ProgressStep {
  key: 'placed' | 'paid' | 'packing' | 'shipping' | 'done';
  label: string;
  /** บรรทัดขยายใต้ชื่อขั้น — ใส่เฉพาะขั้นที่กำลังทำอยู่ */
  note?: string;
  state: StepState;
}

export interface OrderProgress {
  steps: ProgressStep[];
  /** ยกเลิก/หมดอายุ = ไม่ต้องโชว์ขั้นตอน โชว์เหตุผลอย่างเดียว */
  cancelled: boolean;
  cancelledLabel?: string;
}

interface Input {
  order_status: string;
  payment_status: string;
  is_cancelled?: boolean | null;
  is_expired?: boolean | null;
}

const SHIPPED = ['shipping', 'completed'];
const PACKED = ['processing', 'shipping', 'completed'];

export function getOrderProgress(order: Input): OrderProgress {
  if (order.is_cancelled || order.order_status === 'cancelled' || order.is_expired) {
    return {
      steps: [],
      cancelled: true,
      cancelledLabel: order.is_expired ? 'คำสั่งซื้อหมดอายุแล้ว' : 'คำสั่งซื้อถูกยกเลิกแล้ว',
    };
  }

  const paid = order.payment_status === 'paid';
  const verifying = order.payment_status === 'verifying';
  const packed = PACKED.includes(order.order_status);
  const shipped = SHIPPED.includes(order.order_status);
  const finished = order.order_status === 'completed';

  const steps: ProgressStep[] = [
    { key: 'placed', label: 'รับคำสั่งซื้อ', state: 'done' },
    {
      key: 'paid',
      label: 'ชำระเงิน',
      state: paid ? 'done' : 'current',
      // "รอตรวจสลิป" ต้องบอกให้ชัด ไม่งั้นลูกค้าที่โอนแล้วจะคิดว่าระบบไม่เห็นเงิน
      note: paid ? undefined : verifying ? 'รอตรวจสลิป' : 'รอชำระเงิน',
    },
    {
      key: 'packing',
      label: 'เตรียมของ',
      // ready_to_ship เกิดขึ้นทันทีที่ลูกค้าแจ้งโอน — เงินยังไม่ได้ยืนยัน ยังไม่มีใครเตรียมของ
      // ขั้นนี้จะ current ได้ก็ต่อเมื่อร้านยืนยันเงินแล้วเท่านั้น
      state: packed ? 'done' : (paid && order.order_status === 'ready_to_ship') ? 'current' : 'todo',
    },
    {
      key: 'shipping',
      label: 'จัดส่ง',
      state: finished ? 'done' : order.order_status === 'shipping' ? 'current' : 'todo',
    },
    { key: 'done', label: 'ส่งสำเร็จ', state: finished ? 'done' : 'todo' },
  ];

  return { steps, cancelled: false };
}
