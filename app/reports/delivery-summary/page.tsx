'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PaymentModal from '@/app/orders/components/PaymentModal';
import OrderCard from '@/app/orders/components/OrderCard';
import ActionMenu from '@/components/ui/ActionMenu';
import Tabs from '@/components/ui/Tabs';
import Tooltip from '@/components/ui/Tooltip';
import Badge from '@/components/ui/Badge';
import { printAndTrack } from '@/components/ui/OrderPrintButtons';
import type { Order } from '@/app/orders/components/types';
import { getImageUrl } from '@/lib/utils/image';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ORDER_STATUS_LABEL, getNextOrderStatus } from '@/lib/order-status';
import { LoadingCard, EmptyCard } from '@/components/ui/StateCard';
import { Stat } from '@/components/ui/Chart';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import StatusBadge from '@/components/ui/StatusBadge';
import { showPdfPreview, preOpenPrintWindow } from '@/lib/print-pdf';
import {
  Truck,
  MapPin,
  Phone,
  User,
  Package,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  StickyNote,
  GripVertical,
  FileText,
  ClipboardList,
  Printer,
  Loader2,
} from 'lucide-react';

// Interfaces
interface DeliveryProduct {
  productName: string;
  productCode: string;
  variationLabel: string | null;
  quantity: number;
  image: string | null;
}

interface ShippingAddress {
  id: string;
  addressName: string;
  contactPerson: string | null;
  phone: string | null;
  addressLine1: string;
  district: string | null;
  amphoe: string | null;
  province: string;
  postalCode: string | null;
  googleMapsLink: string | null;
}

interface Customer {
  id: string;
  customerCode: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
}

interface Delivery {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalAmount: number;
  orderNotes: string | null;
  internalNotes: string | null;
  customer: Customer;
  shippingAddress: ShippingAddress;
  deliveryNotes: string | null;
  products: DeliveryProduct[];
  totalBottles: number;
}

interface DateGroup {
  date: string;
  deliveries: Delivery[];
  dateTotals: {
    totalDeliveries: number;
    totalBottles: number;
  };
}

interface ProductSummary {
  productName: string;
  productCode: string;
  variationLabel: string | null;
  totalQuantity: number;
  image: string | null;
  barcode: string | null;
}

interface ReportData {
  startDate: string;
  endDate: string;
  byDate: DateGroup[];
  productSummary: ProductSummary[];
  totals: {
    totalDates: number;
    totalDeliveries: number;
    totalBottles: number;
  };
}

// Status badge components
function OrderStatusBadge({ status, clickable = false }: { status: string; clickable?: boolean }) {
  const statusConfig: Record<string, { label: string; color: string; hoverColor: string }> = {
    new: { label: 'ใหม่', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', hoverColor: 'hover:bg-blue-200 dark:hover:bg-blue-900/50' },
    shipping: { label: 'กำลังส่ง', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', hoverColor: 'hover:bg-yellow-200 dark:hover:bg-yellow-900/50' },
    completed: { label: 'สำเร็จ', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', hoverColor: '' },
    cancelled: { label: 'ยกเลิก', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', hoverColor: '' },
  };
  const config = statusConfig[status] || statusConfig.new;
  return (
    <StatusBadge status="delivery" colors={config.color} className={clickable ? `${config.hoverColor} cursor-pointer transition-colors` : ''}>
      {config.label}
      {clickable && <ChevronRight className="w-3 h-3" />}
    </StatusBadge>
  );
}

function PaymentStatusBadge({ status, clickable = false }: { status: string; clickable?: boolean }) {
  const statusConfig: Record<string, { label: string; color: string; hoverColor: string }> = {
    pending: { label: 'รอชำระ', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400', hoverColor: 'hover:bg-orange-200 dark:hover:bg-orange-900/50' },
    verifying: { label: 'รอตรวจสอบ', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', hoverColor: '' },
    paid: { label: 'ชำระแล้ว', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', hoverColor: '' },
  };
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <StatusBadge status="delivery" colors={config.color} className={clickable ? `${config.hoverColor} cursor-pointer transition-colors` : ''}>
      {config.label}
      {clickable && <ChevronRight className="w-3 h-3" />}
    </StatusBadge>
  );
}

// Sortable Delivery Card component
function SortableDeliveryCard({
  id,
  delivery,
  index,
  getUniqueNotes,
  getMapLink,
  formatAddress,
  getNextOrderStatus,
  getNextPaymentStatus,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  handleOrderStatusClick,
  handlePaymentStatusClick,
}: {
  id: string;
  delivery: Delivery;
  index: number;
  getUniqueNotes: (d: Delivery) => { text: string; type: 'delivery' | 'order' | 'internal' }[];
  getMapLink: (addr: ShippingAddress, customerName?: string) => string | null;
  formatAddress: (addr: ShippingAddress) => string;
  getNextOrderStatus: (s: string) => string | null;
  getNextPaymentStatus: (s: string) => string | null;
  getOrderStatusLabel: (s: string) => string;
  getPaymentStatusLabel: (s: string) => string;
  handleOrderStatusClick: (d: Delivery) => void;
  handlePaymentStatusClick: (d: Delivery) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  const uniqueNotes = getUniqueNotes(delivery);
  const mapLink = getMapLink(delivery.shippingAddress, delivery.customer.name);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-slate-800 rounded-lg border overflow-hidden mb-3 ${isDragging ? 'border-primary shadow-lg' : 'border-gray-200 dark:border-slate-700'}`}
    >
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Tooltip text="ลากเพื่อเรียงลำดับ">
          <button
            {...attributes}
            {...listeners}
            className="touch-none text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-grab active:cursor-grabbing p-1 -ml-1"
            aria-label="ลากเพื่อเรียงลำดับ"
          >
            <GripVertical className="w-5 h-5" />
          </button>
          </Tooltip>
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-base font-bold flex-shrink-0">
            {index + 1}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">{delivery.customer.name}</span>
            <span className="text-xs text-gray-500 dark:text-slate-400">({delivery.orderNumber})</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {getNextOrderStatus(delivery.orderStatus) ? (
            <Tooltip text={`คลิกเพื่อเปลี่ยนเป็น "${getOrderStatusLabel(getNextOrderStatus(delivery.orderStatus) || '')}"`}>
              <button onClick={() => handleOrderStatusClick(delivery)}>
                <OrderStatusBadge status={delivery.orderStatus} clickable />
              </button>
            </Tooltip>
          ) : (
            <OrderStatusBadge status={delivery.orderStatus} />
          )}
          {delivery.orderStatus !== 'cancelled' && (
            getNextPaymentStatus(delivery.paymentStatus) ? (
              <Tooltip text={`คลิกเพื่อเปลี่ยนเป็น "${getPaymentStatusLabel(getNextPaymentStatus(delivery.paymentStatus) || '')}"`}>
                <button onClick={() => handlePaymentStatusClick(delivery)}>
                  <PaymentStatusBadge status={delivery.paymentStatus} clickable />
                </button>
              </Tooltip>
            ) : (
              <PaymentStatusBadge status={delivery.paymentStatus} />
            )
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Column: Address, Contact, Notes */}
          <div className="space-y-3">
            <a
              href={mapLink || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-start gap-2 group ${mapLink ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className={`font-medium text-sm text-gray-900 dark:text-white ${mapLink ? 'group-hover:text-blue-600' : ''}`}>
                  {delivery.shippingAddress.addressName}
                </div>
                <div className={`text-sm text-gray-600 dark:text-slate-400 ${mapLink ? 'group-hover:text-blue-500' : ''}`}>
                  {formatAddress(delivery.shippingAddress)}
                </div>
              </div>
            </a>

            <div className="flex flex-wrap gap-4 text-sm">
              {(delivery.shippingAddress.contactPerson || delivery.customer.contactPerson) && (
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400">
                  <User className="w-3.5 h-3.5" />
                  {delivery.shippingAddress.contactPerson || delivery.customer.contactPerson}
                </div>
              )}
              {(delivery.shippingAddress.phone || delivery.customer.phone) && (
                <a
                  href={`tel:${delivery.shippingAddress.phone || delivery.customer.phone}`}
                  className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600 dark:text-blue-400"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {delivery.shippingAddress.phone || delivery.customer.phone}
                </a>
              )}
            </div>

            {uniqueNotes.length > 0 && (
              <div className="space-y-1">
                {uniqueNotes.map((note, nIndex) => (
                  <div key={nIndex} className="flex items-start gap-1.5 text-sm">
                    <StickyNote className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                      note.type === 'delivery' ? 'text-amber-500' :
                      note.type === 'internal' ? 'text-purple-400' : 'text-gray-400'
                    }`} />
                    <span className={
                      note.type === 'delivery' ? 'text-amber-700 dark:text-amber-400' :
                      note.type === 'internal' ? 'text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-slate-400'
                    }>
                      {note.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Products */}
          <div className="md:border-l md:border-gray-100 dark:md:border-slate-700 md:pl-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase mb-2">
              <Package className="w-3.5 h-3.5" />
              สินค้า
            </div>
            <div className="space-y-1.5">
              {delivery.products.map((product, pIndex) => (
                <div key={pIndex} className="flex items-center gap-2 text-sm">
                  <ProductImageThumb
                    src={product.image ? getImageUrl(product.image) : null}
                    alt={product.productName}
                    size="xs"
                  />
                  <span className="text-gray-700 dark:text-slate-300 flex-1">
                    {product.productName}
                    {product.variationLabel && <span className="text-gray-400 dark:text-slate-500 ml-1">{product.variationLabel}</span>}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">x {product.quantity}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">รวม: {delivery.totalBottles} ชิ้น</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeliverySummaryPage() {
  const router = useRouter();
  const { session, userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();

  const [activeTab, setActiveTab] = useState<'packing' | 'delivery'>('packing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showProductSummary, setShowProductSummary] = useState(false);
  // แท็บ "จัดของ" แสดงรายบิลเหมือนหน้าคำสั่งซื้อ → ดึงจาก /api/orders ชุดเดียวกัน
  // (RPC เดียวกัน = การ์ด/แบดจ์/ปุ่มพิมพ์เหมือนกันหมด ไม่ต้องแปลงข้อมูลเอง)
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

  // PDF generation state
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Status update modal
  const [statusUpdateModal, setStatusUpdateModal] = useState<{
    show: boolean;
    delivery: Delivery | null;
    nextStatus: string;
    statusType: 'order' | 'payment';
  }>({ show: false, delivery: null, nextStatus: '', statusType: 'order' });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Payment details state

  // Custom delivery ordering per date
  const [deliveryOrder, setDeliveryOrder] = useState<Map<string, string[]>>(new Map());

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Single date - default to today
  const getDefaultDate = (): DateValueType => {
    const today = new Date();
    return { startDate: today, endDate: today };
  };

  const [selectedDate, setSelectedDate] = useState<DateValueType>(getDefaultDate);

  const toDateString = (val: unknown): string => {
    if (!val) return '';
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(val);
    const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  };

  const deliveryDate = toDateString(selectedDate?.startDate);

  // Auth check
  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) {
      router.push('/login');
    }
  }, [userProfile, authLoading, router]);

  // Fetch report
  const fetchReport = async () => {
    if (!session?.access_token || !deliveryDate) return;

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ start_date: deliveryDate, end_date: deliveryDate });
      const response = await apiFetch(`/api/reports/delivery-summary?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถโหลดข้อมูลได้');
      setReportData(result.report);
    } catch (err) {
      console.error('Error fetching report:', err);
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  /** ออเดอร์ที่ต้องส่งวันนี้ — พารามิเตอร์เดียวกับหน้าคำสั่งซื้อ (ปลีก, ไม่เอา POS) */
  const fetchOrders = useCallback(async () => {
    if (!session?.access_token || !deliveryDate) return;
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams({
        delivery_date_start: deliveryDate,
        delivery_date_end: deliveryDate,
        flow_type: 'r_retail',
        source: 'exclude_pos',
        limit: '200',
        sort_by: 'created_at',
        sort_dir: 'asc',
      });
      const res = await apiFetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      const result = await res.json();
      setOrders(result.orders || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, [session?.access_token, deliveryDate]);

  /** พิมพ์เอกสารของบิลเดียว — ใช้ตัวกลางเดียวกับหน้าคำสั่งซื้อ (เด้ง print dialog + จดว่าพิมพ์แล้ว) */
  const printOne = async (orderId: string, type: 'packing' | 'label') => {
    setPrintingOrderId(orderId);
    const printWindow = preOpenPrintWindow();
    try {
      await printAndTrack(orderId, type, { printWindow });
      fetchOrders();
    } catch (err) {
      printWindow?.close();
      showToast(err instanceof Error ? err.message : 'พิมพ์ไม่สำเร็จ', 'error');
    } finally {
      setPrintingOrderId(null);
    }
  };

  const isAuthReady = !authLoading && !!session?.access_token;
  useEffect(() => {
    if (!isAuthReady || !deliveryDate) return;
    fetchReport();
    fetchOrders();
  }, [isAuthReady, deliveryDate]);

  // Initialize delivery order when reportData changes
  useEffect(() => {
    if (!reportData) return;
    const newOrder = new Map<string, string[]>();
    reportData.byDate.forEach(dateGroup => {
      const keys = dateGroup.deliveries.map(d => `${d.orderId}-${d.shippingAddress.id}`);
      newOrder.set(dateGroup.date, keys);
    });
    setDeliveryOrder(newOrder);
  }, [reportData]);

  // Get deliveries in custom order for a date group
  const getOrderedDeliveries = useCallback((dateGroup: DateGroup): Delivery[] => {
    const order = deliveryOrder.get(dateGroup.date);
    if (!order) return dateGroup.deliveries;

    const deliveryMap = new Map(
      dateGroup.deliveries.map(d => [`${d.orderId}-${d.shippingAddress.id}`, d])
    );
    return order
      .map(key => deliveryMap.get(key))
      .filter((d): d is Delivery => !!d);
  }, [deliveryOrder]);

  // Handle drag end for reordering
  const handleDragEnd = useCallback((date: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDeliveryOrder(prev => {
      const newMap = new Map(prev);
      const order = newMap.get(date);
      if (!order) return prev;

      const oldIndex = order.indexOf(active.id as string);
      const newIndex = order.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;

      newMap.set(date, arrayMove(order, oldIndex, newIndex));
      return newMap;
    });
  }, []);

  // Status flow: getNextOrderStatus จาก lib/order-status.ts (single source of truth)

  const getNextPaymentStatus = (status: string): string | null => {
    return status === 'pending' ? 'paid' : null;
  };

  const getOrderStatusLabel = (status: string): string => {
    const labels = ORDER_STATUS_LABEL;
    return labels[status] || status;
  };

  const getPaymentStatusLabel = (status: string): string => {
    const labels: Record<string, string> = { pending: 'รอชำระ', paid: 'ชำระแล้ว' };
    return labels[status] || status;
  };

  // Handle status clicks
  const handleOrderStatusClick = (delivery: Delivery) => {
    const nextStatus = getNextOrderStatus(delivery.orderStatus);
    if (!nextStatus) return;
    setStatusUpdateModal({ show: true, delivery, nextStatus, statusType: 'order' });
  };

  const handlePaymentStatusClick = (delivery: Delivery) => {
    const nextStatus = getNextPaymentStatus(delivery.paymentStatus);
    if (!nextStatus) return;
    setStatusUpdateModal({ show: true, delivery, nextStatus, statusType: 'payment' });
  };

  const isPaymentModal = statusUpdateModal.statusType === 'payment' && statusUpdateModal.nextStatus === 'paid';
  const closeStatusModal = () =>
    setStatusUpdateModal({ show: false, delivery: null, nextStatus: '', statusType: 'order' });

  // ยืนยันเปลี่ยนสถานะ — เหลือเฉพาะสถานะออเดอร์ / สถานะชำระที่ไม่ใช่ "จ่ายแล้ว"
  // (เคส "จ่ายแล้ว" ใช้ PaymentModal ตัวกลาง ซึ่งบันทึก payment_records ให้เอง)
  const confirmStatusUpdate = async () => {
    const delivery = statusUpdateModal.delivery;
    if (!delivery) return;

    try {
      setUpdatingStatus(true);

      const updateData: Record<string, unknown> = { id: delivery.orderId };
      if (statusUpdateModal.statusType === 'order') {
        updateData.order_status = statusUpdateModal.nextStatus;
      } else {
        updateData.payment_status = statusUpdateModal.nextStatus;
      }

      const response = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error('Failed to update status');

      await fetchReport();
      closeStatusModal();
    } catch (err) {
      console.error('Error updating status:', err);
      showToast(err instanceof Error ? err.message : 'ไม่สามารถอัพเดทสถานะได้', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Generate text for export (uses custom order)
  const generateDeliveryText = (): string => {
    if (!reportData || reportData.byDate.length === 0) return '';
    let text = '';

    reportData.byDate.forEach(dateGroup => {
      const dateStr = new Date(dateGroup.date).toLocaleDateString('th-TH', {
        weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
      });
      text += `📦 สรุปการจัดส่ง - ${dateStr}\n${'─'.repeat(30)}\n\n`;

      const orderedDeliveries = getOrderedDeliveries(dateGroup);
      orderedDeliveries.forEach((delivery, index) => {
        text += `${index + 1}. ${delivery.customer.name} (${delivery.orderNumber})\n`;

        const addr = delivery.shippingAddress;
        text += `   📍 ${addr.addressName}`;
        if (addr.addressLine1) text += ` - ${addr.addressLine1}`;
        if (addr.amphoe) text += `, ${addr.amphoe}`;
        if (addr.province) text += `, ${addr.province}`;
        if (addr.postalCode) text += ` ${addr.postalCode}`;
        text += '\n';

        const contact = addr.contactPerson || delivery.customer.contactPerson;
        const phone = addr.phone || delivery.customer.phone;
        if (contact || phone) {
          text += `   👤 ${contact || ''}${contact && phone ? ' ' : ''}${phone ? `📞 ${phone}` : ''}\n`;
        }

        if (addr.googleMapsLink) text += `   🗺️ ${addr.googleMapsLink}\n`;

        const notes = getUniqueNotes(delivery);
        notes.forEach(n => { text += `   📝 ${n.text}\n`; });

        text += '   สินค้า:\n';
        delivery.products.forEach(product => {
          const variationInfo = product.variationLabel ? ` ${product.variationLabel}` : '';
          text += `   - ${product.productName}${variationInfo} x ${product.quantity}\n`;
        });
        text += '\n';
      });

      text += `📊 รวม: ${dateGroup.dateTotals.totalDeliveries} จุดส่ง, ${dateGroup.dateTotals.totalBottles} ชิ้น\n\n`;
    });

    if (reportData.productSummary.length > 0) {
      text += `${'═'.repeat(30)}\n📋 สรุปสินค้าทั้งหมด:\n`;
      reportData.productSummary.forEach(product => {
        const variationInfo = product.variationLabel ? ` ${product.variationLabel}` : '';
        text += `   - ${product.productName}${variationInfo}: ${product.totalQuantity} ชิ้น\n`;
      });
    }

    return text;
  };

  // Get unique notes (deduplicate)
  const getUniqueNotes = (delivery: Delivery): { text: string; type: 'delivery' | 'order' | 'internal' }[] => {
    const notes: { text: string; type: 'delivery' | 'order' | 'internal' }[] = [];
    const seen = new Set<string>();

    if (delivery.deliveryNotes) {
      seen.add(delivery.deliveryNotes.trim());
      notes.push({ text: delivery.deliveryNotes, type: 'delivery' });
    }
    if (delivery.orderNotes && !seen.has(delivery.orderNotes.trim())) {
      seen.add(delivery.orderNotes.trim());
      notes.push({ text: delivery.orderNotes, type: 'order' });
    }
    if (delivery.internalNotes && !seen.has(delivery.internalNotes.trim())) {
      notes.push({ text: delivery.internalNotes, type: 'internal' });
    }

    return notes;
  };

  const handleCopyText = async () => {
    const text = generateDeliveryText();
    if (!text) return;
    try {
      await copy(text)
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };


  /**
   * พิมพ์ใบจัดของของวันนั้น — ใช้ตัวกลางตัวเดียวกับหน้าคำสั่งซื้อ
   * (`generatePackingPdf` ให้ **ใบหยิบของ** รวมทุกออเดอร์ + **ใบจัดของ** รายออเดอร์
   *  2 ใบต่อหน้า) เดิมหน้านี้ประกอบ pdfMake เองอีกชุด ทำให้ต้องแก้สองที่ทุกครั้ง
   *  และรูปสินค้าไม่ขึ้นเพราะ fetch ตรงโดน CORS (ตัวกลางมี /api/image-proxy ให้แล้ว)
   */
  const handleExportPackingPdf = async () => {
    const orderIds = (reportData?.byDate || []).flatMap(g => g.deliveries.map(d => d.orderId));
    if (orderIds.length === 0) return;

    setGeneratingPdf(true);
    // เปิดแท็บรอไว้ก่อน — Safari บนมือถือบล็อก window.open ที่ไม่ได้เกิดจากการกดปุ่มโดยตรง
    const printWindow = preOpenPrintWindow();
    try {
      const orders = [];
      for (const id of orderIds) {
        const res = await apiFetch(`/api/orders/${id}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.order) orders.push(data.order);
      }
      if (orders.length === 0) throw new Error('ไม่พบข้อมูลออเดอร์');

      const { generatePackingPdf } = await import('@/lib/orders-packing-pdf');
      const blob = await generatePackingPdf(orders);
      showPdfPreview(blob, `ใบจัดของ ${deliveryDate}`, printWindow);
    } catch (err) {
      console.error('Error generating PDF:', err);
      printWindow?.close();
      showToast(err instanceof Error ? err.message : 'ไม่สามารถสร้าง PDF ได้', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatAddress = (addr: ShippingAddress): string => {
    return [addr.addressLine1, addr.district, addr.amphoe, addr.province, addr.postalCode].filter(Boolean).join(', ');
  };

  const getMapLink = (addr: ShippingAddress, customerName?: string): string | null => {
    if (addr.googleMapsLink) return addr.googleMapsLink;
    const parts: string[] = [];
    if (customerName) parts.push(customerName);
    if (addr.addressName && addr.addressName !== 'ไม่ระบุ' && addr.addressName !== customerName) {
      parts.push(addr.addressName);
    }
    const query = parts.join(' ') || formatAddress(addr);
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  };

  if (authLoading) {
    return (
      <Layout>
        <LoadingCard />
      </Layout>
    );
  }

  if (!userProfile) return null;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <PageHeader
          icon={<Truck />}
          title="จัดของ & ส่ง"
          subtitle="เตรียมสินค้าและจัดส่งตามวันที่"
        />

        {/* Date Picker + Tab Switcher + Action Buttons */}
        <div className="data-filter-card">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Date Picker - first priority */}
            <div className="max-w-xs">
              <DateRangePicker
                value={selectedDate}
                onChange={(val) => setSelectedDate(val)}
                asSingle={true}
                useRange={false}
                showShortcuts={false}
                showFooter={false}
                placeholder="เลือกวันที่ส่ง"
              />
            </div>

            {/* Tabs — ใช้ <Tabs> ตัวกลาง (เดิมประกอบ pill switcher เอง) */}
            <Tabs
              className="border-b-0 flex-1"
              activeKey={activeTab}
              onSelect={(key) => setActiveTab(key as 'packing' | 'delivery')}
              tabs={[
                { key: 'packing', label: 'จัดของ', icon: <ClipboardList className="w-4 h-4" />, count: orders.length },
                { key: 'delivery', label: 'จัดส่ง', icon: <Truck className="w-4 h-4" />, count: reportData?.totals.totalDeliveries },
              ]}
            />

            {/* Action buttons - contextual per tab */}
            <div className="sm:ml-auto flex items-center gap-2">
              {activeTab === 'packing' ? (
                <Button
                  variant="primary"
                  size="sm"
                  loading={generatingPdf}
                  disabled={!reportData || reportData.productSummary.length === 0}
                  icon={<FileText className="w-4 h-4" />}
                  onClick={handleExportPackingPdf}
                >
                  {generatingPdf ? 'กำลังสร้าง PDF...' : 'Export PDF'}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyText}
                  disabled={!reportData || reportData.byDate.length === 0}
                  icon={copySuccess ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                >
                  {copySuccess ? 'คัดลอกแล้ว!' : 'สรุปการส่ง'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading && (
          <LoadingCard />
        )}

        {/* ===== TAB 1: จัดของ (Packing) ===== */}
        {!loading && reportData && activeTab === 'packing' && (
          <>
            {/* Summary Cards */}
            {reportData.totals.totalDeliveries > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Stat label="บิลที่ต้องจัด" value={reportData.totals.totalDeliveries} icon={<ClipboardList className="w-5 h-5" />} />
                <Stat label="ชนิดสินค้า" value={reportData.productSummary.length} icon={<Package className="w-5 h-5" />} />
                <Stat label="จำนวนรวม" value={`${reportData.totals.totalBottles.toLocaleString()} ชิ้น`} icon={<Truck className="w-5 h-5" />} />
              </div>
            )}

            {/* สรุปสินค้ารวมทั้งวัน (ใบหยิบของบนจอ) — พับเก็บได้ ของหลักคือรายบิลด้านล่าง */}
            {reportData.productSummary.length > 0 && (
              <Card padding="none">
                <button
                  onClick={() => setShowProductSummary(!showProductSummary)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" />
                    <span className="font-medium text-gray-900 dark:text-white">สรุปสินค้าที่ต้องหยิบทั้งวัน</span>
                    <span className="text-sm text-gray-500 dark:text-slate-400">
                      ({reportData.productSummary.length} รายการ / {reportData.totals.totalBottles.toLocaleString()} ชิ้น)
                    </span>
                  </div>
                  {showProductSummary ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </button>
                {showProductSummary && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-slate-700">
                    <div className="space-y-2 mt-3">
                      {reportData.productSummary.map((product, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <ProductImageThumb
                            src={product.image ? getImageUrl(product.image) : null}
                            alt={product.productName}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 dark:text-white truncate">
                              {product.productName}{product.variationLabel ? ` - ${product.variationLabel}` : ''}
                            </div>
                            <div className="helper-text text-gray-400 font-mono">{product.productCode}</div>
                          </div>
                          <Badge tone="orange" size="md">{product.totalQuantity} ชิ้น</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* รายบิล — การ์ดเดียวกับหน้าคำสั่งซื้อ แท็บ "ที่ต้องจัดส่ง" */}
            {ordersLoading ? (
              <LoadingCard />
            ) : orders.length === 0 ? (
              <EmptyCard
                icon={<Package className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
                title="ไม่มีบิลที่ต้องจัดในวันที่เลือก"
              />
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    statusFilter="processing"
                    showOrderStatus
                    showPaymentStatus
                    actions={
                      <>
                        <button
                          onClick={() => printOne(order.id, 'packing')}
                          disabled={printingOrderId === order.id}
                          className="btn-focus-action indigo"
                        >
                          {printingOrderId === order.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <ClipboardList className="w-4 h-4" />}
                          ใบจัดของ
                        </button>
                        <ActionMenu
                          items={[
                            {
                              key: 'label', label: 'ใบปะหน้า', icon: <Printer className="w-4 h-4" />,
                              onClick: () => printOne(order.id, 'label'),
                            },
                            {
                              key: 'open', label: 'เปิดคำสั่งซื้อ', icon: <ChevronRight className="w-4 h-4" />,
                              onClick: () => router.push(`/orders/${order.id}`),
                            },
                          ]}
                        />
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== TAB 2: จัดส่ง (Delivery) ===== */}
        {!loading && reportData && activeTab === 'delivery' && (
          <>
            {/* Summary Cards */}
            {reportData.totals.totalDeliveries > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Stat label="จุดส่ง" value={reportData.totals.totalDeliveries} icon={<MapPin className="w-5 h-5" />} />
                <Stat label="จำนวนรวม" value={`${reportData.totals.totalBottles.toLocaleString()} ชิ้น`} icon={<ClipboardList className="w-5 h-5" />} />
                <Stat label="ชนิดสินค้า" value={reportData.productSummary.length} icon={<Package className="w-5 h-5" />} />
              </div>
            )}

            {/* Delivery List by Date */}
            {reportData.byDate.length === 0 ? (
              <EmptyCard
                icon={<Truck className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
                title="ไม่มีรายการจัดส่งในช่วงวันที่เลือก"
              />
            ) : (
              reportData.byDate.map(dateGroup => {
                const orderedDeliveries = getOrderedDeliveries(dateGroup);
                const sortableIds = orderedDeliveries.map(d => `${d.orderId}-${d.shippingAddress.id}`);

                return (
                  <div key={dateGroup.date} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {new Date(dateGroup.date).toLocaleDateString('th-TH', {
                          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </h2>
                      <span className="text-sm text-gray-500 dark:text-slate-400">
                        {dateGroup.dateTotals.totalDeliveries} จุดส่ง / {dateGroup.dateTotals.totalBottles} ชิ้น
                      </span>
                    </div>

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd(dateGroup.date)}
                    >
                      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                        {orderedDeliveries.map((delivery, index) => (
                          <SortableDeliveryCard
                            key={`${delivery.orderId}-${delivery.shippingAddress.id}`}
                            id={`${delivery.orderId}-${delivery.shippingAddress.id}`}
                            delivery={delivery}
                            index={index}
                            getUniqueNotes={getUniqueNotes}
                            getMapLink={getMapLink}
                            formatAddress={formatAddress}
                            getNextOrderStatus={getNextOrderStatus}
                            getNextPaymentStatus={getNextPaymentStatus}
                            getOrderStatusLabel={getOrderStatusLabel}
                            getPaymentStatusLabel={getPaymentStatusLabel}
                            handleOrderStatusClick={handleOrderStatusClick}
                            handlePaymentStatusClick={handlePaymentStatusClick}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </div>
                );
              })
            )}

            {/* Product Summary - Collapsible */}
            {reportData.productSummary.length > 0 && (
              <Card padding="none">
                <button
                  onClick={() => setShowProductSummary(!showProductSummary)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" />
                    <span className="font-medium text-gray-900 dark:text-white">สรุปสินค้าทั้งหมด</span>
                    <span className="text-sm text-gray-500 dark:text-slate-400">({reportData.productSummary.length} รายการ)</span>
                  </div>
                  {showProductSummary ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                {showProductSummary && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-slate-700">
                    <div className="space-y-2 mt-3">
                      {reportData.productSummary.map((product, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <ProductImageThumb
                            src={product.image ? getImageUrl(product.image) : null}
                            alt={product.productName}
                            size="xs"
                          />
                          <span className="text-gray-900 dark:text-white flex-1">
                            {product.productName}
                            {product.variationLabel && <span className="text-gray-400 dark:text-slate-500 ml-1">{product.variationLabel}</span>}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">{product.totalQuantity}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end mt-3 pt-2 border-t border-gray-200 dark:border-slate-700">
                      <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                        รวมทั้งหมด: {reportData.totals.totalBottles.toLocaleString()} ชิ้น
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </>
        )}

        {/* บันทึกชำระเงิน — ใช้ PaymentModal ตัวกลาง (แนบสลิปได้ + ใช้ตัวเลือกวัน/เวลาของระบบ)
            เดิมหน้านี้ประกอบฟอร์มเอง ใช้ <input type="date"/"time"> ดิบ และแนบสลิปไม่ได้ */}
        {isPaymentModal && statusUpdateModal.delivery && (
          <PaymentModal
            show
            orderId={statusUpdateModal.delivery.orderId}
            orderNumber={statusUpdateModal.delivery.orderNumber}
            totalAmount={statusUpdateModal.delivery.totalAmount}
            defaultPaymentMethod={statusUpdateModal.delivery.paymentMethod || 'cash'}
            onClose={closeStatusModal}
            onSuccess={() => { closeStatusModal(); fetchReport(); }}
          />
        )}

        {/* Status Update Confirmation Modal */}
        {statusUpdateModal.show && !isPaymentModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setStatusUpdateModal({ show: false, delivery: null, nextStatus: '', statusType: 'order' })}
          >
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                ยืนยันการเปลี่ยน{statusUpdateModal.statusType === 'order' ? 'สถานะคำสั่งซื้อ' : 'สถานะการชำระเงิน'}
              </h3>

              <div className="mb-6 space-y-3">
                <p className="text-gray-700 dark:text-slate-300">
                  คำสั่งซื้อ: <span className="font-medium">{statusUpdateModal.delivery?.orderNumber}</span>
                </p>
                <p className="text-gray-700 dark:text-slate-300">
                  ลูกค้า: <span className="font-medium">{statusUpdateModal.delivery?.customer.name}</span>
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 dark:text-slate-400">เปลี่ยนจาก:</span>
                  {statusUpdateModal.statusType === 'order' ? (
                    <>
                      <OrderStatusBadge status={statusUpdateModal.delivery?.orderStatus || ''} />
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <OrderStatusBadge status={statusUpdateModal.nextStatus} />
                    </>
                  ) : (
                    <>
                      <PaymentStatusBadge status={statusUpdateModal.delivery?.paymentStatus || ''} />
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <PaymentStatusBadge status={statusUpdateModal.nextStatus} />
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => setStatusUpdateModal({ show: false, delivery: null, nextStatus: '', statusType: 'order' })}
                  disabled={updatingStatus}
                >
                  ยกเลิก
                </Button>
                <Button
                  variant="primary"
                  loading={updatingStatus}
                  onClick={confirmStatusUpdate}
                >
                  {updatingStatus ? 'กำลังบันทึก...' : 'ยืนยัน'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
