'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import ImageLightbox from '@/components/ui/ImageLightbox';
import StatusTabs from '@/components/ui/StatusTabs';
import { LoadingCard, EmptyCard } from '@/components/ui/StateCard';
import Alert from '@/components/ui/Alert';
import MarketplaceQuotaPausedAlert from '@/components/ui/MarketplaceQuotaPausedAlert';
import FormInput from '@/components/ui/FormInput';
import SearchInput, { SearchInputHandle } from '@/components/ui/SearchInput';
import Tooltip from '@/components/ui/Tooltip';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Edit2,
  ChevronRight,
  Link2,
  X,
  Package,
  CreditCard,
  User,
  Store,
  Copy,
  Banknote,
  ClipboardList,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Repeat,
  FilterX,
  Mail,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import PlatformChipFilter from '@/app/components/PlatformChipFilter';
import SearchableDropdown, { DropdownOption } from '@/components/ui/SearchableDropdown';

// Shared types & helpers
import {
  Order,
  ChannelOption,
  CreatedByOption,
  ORDER_STATUS_CONFIG,
  PLATFORM_ICONS,
} from './components/types';
import { useCarriers } from '@/lib/carrier-lookup';

// Tab components
import ReadyToShipTab from './components/ReadyToShipTab';
import ProcessingTab from './components/ProcessingTab';
import OrderCard from './components/OrderCard';
import ActionMenu, { ActionItem } from './components/ActionMenu';
import PaymentModal from './components/PaymentModal';
import TaxInvoiceModal from './components/TaxInvoiceModal';
import { showPdfPreview, preOpenPrintWindow } from '@/lib/print-pdf';
import { markOrdersPrinted, updateLocalPrintStatus } from '@/lib/print-tracking';
import { isMarketplaceSource } from '@/lib/marketplace/types';
import { printAndTrack, type PrintType } from '@/components/ui/OrderPrintButtons';
import { useCompany } from '@/lib/company-context';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import FormSelect from '@/components/ui/FormSelect';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { getStatusBadgeTone } from '@/lib/status-tab-colors';
import { ORDER_STATUS_FLOW } from '@/lib/order-status';
import { isMarketplacePlatform } from '@/lib/marketplace-platforms';
import PageHeader from '@/components/ui/PageHeader';

// Sort options (id/label so FormSelect can consume directly)
const SORT_OPTIONS = [
  { id: 'created_at:desc', label: 'ล่าสุด' },
  { id: 'created_at:asc', label: 'เก่าสุด' },
  { id: 'delivery_date:asc', label: 'ส่งเร็วสุด' },
  { id: 'delivery_date:desc', label: 'ส่งช้าสุด' },
  { id: 'total_amount:desc', label: 'ยอดมากสุด' },
  { id: 'total_amount:asc', label: 'ยอดน้อยสุด' },
];

const VALID_TABS = ['all', 'new', 'ready_to_ship', 'processing', 'shipping', 'completed', 'cancelled'];

// Default values for URL params
const PARAM_DEFAULTS: Record<string, string> = {
  status: 'all',
  payment: 'all',
  channel: 'all',
  created_by: 'all',
  order_type: 'all',
  platform: 'all',
  sort: 'created_at:desc',
  q: '',
  page: '1',
  limit: '20',
};

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();
  const { features } = useFeatures();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;
  const { confirmDialog, confirm } = useConfirmDialog();
  const { active: activeCarriers } = useCarriers();
  const carrierOptions = activeCarriers.map(c => ({ id: c.code, label: c.name }));

  // === Derive filter values from URL search params ===
  const statusFilter = (() => {
    const v = searchParams.get('status') || 'all';
    return VALID_TABS.includes(v) ? v : 'all';
  })();
  const paymentFilter = searchParams.get('payment') || 'all';
  const channelFilter = searchParams.get('channel') || 'all';
  const createdByFilter = searchParams.get('created_by') || 'all';
  const orderTypeFilter = searchParams.get('order_type') || 'all';
  const platformFilter = searchParams.get('platform') || 'all';
  const sortValue = searchParams.get('sort') || 'created_at:desc';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const recordsPerPage = parseInt(searchParams.get('limit') || '20', 10);
  const debouncedSearch = searchParams.get('q') || '';

  const sortBy = sortValue.split(':')[0];
  const sortDir = sortValue.split(':')[1] as 'asc' | 'desc';

  // === Local search state for immediate input ===
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const debounceRef = useRef<NodeJS.Timeout>(null);

  // === Helper to update URL params ===
  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    let pageReset = false;
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'page') pageReset = true;
      if (v === PARAM_DEFAULTS[k] || v === '') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    }
    if (pageReset) params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/orders', { scroll: false });
  }, [searchParams, router]);

  // === Non-filter state ===
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [channelDropdownOptions, setChannelDropdownOptions] = useState<DropdownOption[]>([]);
  const [createdByDropdownOptions, setCreatedByDropdownOptions] = useState<DropdownOption[]>([]);
  const [deliveryDateRange, setDeliveryDateRange] = useState<DateValueType>({
    startDate: null,
    endDate: null,
  });

  // Status update modal
  const [statusUpdateModal, setStatusUpdateModal] = useState<{
    show: boolean;
    order: Order | null;
    nextStatus: string;
    statusType: 'order' | 'payment';
  }>({ show: false, order: null, nextStatus: '', statusType: 'order' });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Shipping details (for processing -> shipping)
  const [shippingDetails, setShippingDetails] = useState({ carrier: '', trackingNumber: '' });

  // Payment modal (shared component)
  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);

  // Server-side pagination
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Status counts
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ all: 0, new: 0, ready_to_ship: 0, processing: 0, shipping: 0, completed: 0, cancelled: 0 });
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [paymentCounts, setPaymentCounts] = useState<Record<string, number>>({ all: 0, pending: 0, verifying: 0, paid: 0, cancelled: 0 });

  // Carrier counts for ProcessingTab sub-tabs
  const [carrierCounts, setCarrierCounts] = useState<Record<string, number>>({});
  const [onHoldCount, setOnHoldCount] = useState(0);
  const [rtsOnHoldCount, setRtsOnHoldCount] = useState(0);
  const searchInputRef = useRef<SearchInputHandle>(null);
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

  // Close modal on ESC
  useEffect(() => {
    if (!statusUpdateModal.show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' });
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [statusUpdateModal.show]);

  // Search on Enter (immediate)
  const handleSearchSubmit = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setParams({ q: searchTerm });
  }, [searchTerm, setParams]);

  // Handle search input change — local state for immediate input, debounced URL update
  const handleSearchChange = useCallback((v: string) => {
    setSearchTerm(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v) {
      // Immediately clear search when input is emptied
      setParams({ q: '' });
    } else {
      debounceRef.current = setTimeout(() => {
        setParams({ q: v });
      }, 500);
    }
  }, [setParams]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Fetch orders
  const isAuthReady = !authLoading && !!userProfile;
  useEffect(() => {
    if (!isAuthReady) return;
    fetchOrders();
  }, [isAuthReady, currentPage, recordsPerPage, statusFilter, paymentFilter, channelFilter, createdByFilter, orderTypeFilter, platformFilter, debouncedSearch, sortBy, sortDir]);

  const fetchOrders = async () => {
    try {
      if (orders.length === 0) setLoading(true);
      setFetching(true);

      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      // แท็บ ready_to_ship/processing ลูก (Tab component) ดึง list ของตัวเอง —
      // fetch ของ parent ใช้แค่ counts + empty gate → ขอ 1 แถวพอ ไม่ต้องแบก payload เต็มหน้า
      const tabFetchesOwnList = statusFilter === 'ready_to_ship' || statusFilter === 'processing';
      params.set('limit', tabFetchesOwnList ? '1' : recordsPerPage.toString());
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);
      params.set('source', 'exclude_pos');
      params.set('flow_type', 'r_retail');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (paymentFilter !== 'all') params.set('payment_status', paymentFilter);
      if (createdByFilter !== 'all') params.set('created_by', createdByFilter);
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (orderTypeFilter !== 'all') params.set('order_type', orderTypeFilter);
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const response = await apiFetch(`/api/orders?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch orders');

      const result = await response.json();
      setOrders(result.orders || []);
      setTotalOrders(result.pagination?.total || 0);
      setTotalPages(result.pagination?.totalPages || 0);
      if (result.statusCounts) setStatusCounts(result.statusCounts);
      if (result.paymentCounts) setPaymentCounts(result.paymentCounts);
      if (result.carrierCounts) setCarrierCounts(result.carrierCounts);
      if (result.onHoldCount !== undefined) setOnHoldCount(result.onHoldCount);
      if (result.rtsOnHoldCount !== undefined) setRtsOnHoldCount(result.rtsOnHoldCount);
      if (result.channelOptions) {
        // ปิดฟีเจอร์ marketplace แล้วต้องไม่เห็นช่องทางที่ mirror มาจาก Shopee/Lazada/TikTok
        // (ช่องทางพวกนี้ยังอยู่ใน DB เพราะออเดอร์เก่าอ้างถึง แค่ไม่ต้องโชว์เป็นตัวเลือก)
        const visible = features.marketplace_sync
          ? result.channelOptions
          : result.channelOptions.filter((ch: ChannelOption) => !isMarketplacePlatform(ch.platform));
        // Sort by platform so dividers group correctly
        const sorted = [...visible].sort((a: ChannelOption, b: ChannelOption) => (a.platform || '').localeCompare(b.platform || ''));
        setChannelDropdownOptions(sorted.map((ch: ChannelOption) => ({
          id: ch.id,
          label: ch.name,
          icon: ch.picture_url || undefined,
          platformIcon: PLATFORM_ICONS[ch.platform] || undefined,
        })));
      }
      if (result.createdByOptions) {
        setCreatedByDropdownOptions(result.createdByOptions.map((u: CreatedByOption) => ({
          id: u.id,
          label: u.name,
        })));
      }
      // Notify sidebar to refresh ready_to_ship count
      window.dispatchEvent(new Event('orders-count-changed'));
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้');
    } finally {
      setLoading(false);
      setFetching(false);
      searchInputRef.current?.focus();
    }
  };

  // Status flow helpers — credit/consignment/dept_store skip ready_to_ship
  const getNextOrderStatus = (currentStatus: string, flowType?: string | null): string | null => {
    const isCreditFlow = ['w_credit', 'c_consign', 'd_statement'].includes(flowType || '');
    if (isCreditFlow) {
      const flow: Record<string, string> = { new: 'processing', processing: 'shipping', shipping: 'completed' };
      return flow[currentStatus] || null;
    }
    return ORDER_STATUS_FLOW[currentStatus] ?? null;
  };

  // Handle status click
  const handleOrderStatusClick = (order: Order) => {
    const nextStatus = getNextOrderStatus(order.order_status, order.flow_type);
    if (!nextStatus) return;
    setShippingDetails({ carrier: '', trackingNumber: '' });
    setStatusUpdateModal({ show: true, order, nextStatus, statusType: 'order' });
  };

  const handlePaymentStatusClick = (order: Order) => {
    if (order.payment_status !== 'pending') return;
    setPaymentModalOrder(order);
  };

  const confirmStatusUpdate = async () => {
    if (!statusUpdateModal.order) return;

    try {
      setUpdatingStatus(true);
      const updateData: any = { id: statusUpdateModal.order.id };
      updateData.order_status = statusUpdateModal.nextStatus;
      // Include tracking info when shipping
      if (statusUpdateModal.nextStatus === 'shipping') {
        if (shippingDetails.carrier) updateData.shipping_carrier = shippingDetails.carrier;
        if (shippingDetails.trackingNumber) updateData.tracking_number = shippingDetails.trackingNumber;
      }

      const response = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      if (!response.ok) throw new Error('Failed to update status');

      await fetchOrders();
      window.dispatchEvent(new Event('orders-count-changed'));
      setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' });
    } catch (error) {
      console.error('Error updating status:', error);
      showToast(error instanceof Error ? error.message : 'ไม่สามารถอัพเดทสถานะได้', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteOrder = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    const ok = await confirm({ title: `ต้องการลบคำสั่งซื้อ "${order.order_number}"?`, description: 'การลบจะเป็นการลบถาวร ไม่สามารถกู้คืนได้', variant: 'danger' }); if (!ok) return;

    try {
      const response = await apiFetch(`/api/orders?id=${order.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'ไม่สามารถลบคำสั่งซื้อได้');
      }
      fetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      showToast(error instanceof Error ? error.message : 'ไม่สามารถลบคำสั่งซื้อได้', 'error');
    }
  };

  // Client-side date filter
  const checkDateFilter = (order: Order): boolean => {
    if (!deliveryDateRange?.startDate && !deliveryDateRange?.endDate) return true;
    if (!order.delivery_date) return false;
    const deliveryDate = new Date(order.delivery_date);
    deliveryDate.setHours(0, 0, 0, 0);
    const startDate = deliveryDateRange.startDate ? new Date(String(deliveryDateRange.startDate)) : null;
    const endDate = deliveryDateRange.endDate ? new Date(String(deliveryDateRange.endDate)) : null;
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);
    if (startDate && endDate) return deliveryDate >= startDate && deliveryDate <= endDate;
    if (startDate) return deliveryDate >= startDate;
    if (endDate) return deliveryDate <= endDate;
    return true;
  };

  const displayedOrders = orders.filter(checkDateFilter);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + displayedOrders.length, totalOrders);

  // Check if any non-default filter is active
  const hasActiveFilters = searchTerm || statusFilter !== 'all' || paymentFilter !== 'all' || channelFilter !== 'all' || createdByFilter !== 'all' || orderTypeFilter !== 'all' || platformFilter !== 'all' || sortValue !== 'created_at:desc' || !!deliveryDateRange?.startDate;

  // === PDF print handlers ===
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | undefined>();
  const [taxInvoiceModal, setTaxInvoiceModal] = useState<{ orderId: string; orderNumber: string; customerId?: string; hasAbbrev?: boolean } | null>(null);

  /**
   * Unified print handler — delegates to shared printAndTrack()
   * Supports all print types including marketplace labels
   */
  const handlePrint = async (orderId: string, type: PrintType, opts?: { source?: string }) => {
    // Synchronously open mobile print tab from the click handler (iOS popup-safe).
    const printWindow = preOpenPrintWindow();
    setPdfLoading(true);
    try {
      await printAndTrack(orderId, type, {
        source: opts?.source,
        onProgress: (msg) => setPdfMessage(msg),
        printWindow,
      });
      // Update local print status for UI indicators
      const trackType = type === 'marketplace_label' ? 'label'
        : type === 'abbreviated' || type === 'tax' || type === 'dn' || type === 'all' ? 'invoice'
        : type as 'packing' | 'label';
      if (['invoice', 'packing', 'label'].includes(trackType)) {
        updateLocalPrintStatus(setOrders, [orderId], trackType as 'label' | 'packing' | 'invoice');
      }
    } catch (err) {
      printWindow?.close();
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPdfLoading(false);
      setPdfMessage(undefined);
    }
  };

  // Legacy handlers — delegate to unified handlePrint (used by menu items below)
  const handlePrintInvoice = (orderId: string) => handlePrint(orderId, 'abbreviated');
  const handlePrintAbbreviatedInvoice = (orderId: string) => handlePrint(orderId, 'abbreviated');
  const handlePrintFullTaxInvoice = (orderId: string) => handlePrint(orderId, 'tax');
  const handlePrintPackingList = (orderId: string) => handlePrint(orderId, 'packing');
  const handlePrintShippingLabel = (orderId: string) => handlePrint(orderId, 'label');
  const handlePrintShopeeLabel = (orderId: string, source?: string) => handlePrint(orderId, 'marketplace_label', { source: source || 'shopee' });

  // === Render Default Order Card (for tabs without special components) ===
  const renderDefaultCardActions = (order: Order) => {
    const isMarketplace = isMarketplaceSource(order.source);
    const primaryActions: React.ReactNode[] = [];
    const menuItems: ActionItem[] = [];

    // Primary: Payment action (manual, new tab, pending payment, flow A only)
    const isCreditFlowOrder = ['w_credit', 'c_consign', 'd_statement'].includes(order.flow_type || '');
    if (statusFilter === 'new' && !isMarketplace && order.payment_status === 'pending' && !isCreditFlowOrder) {
      primaryActions.push(
        <button
          key="pay"
          onClick={(e) => { e.stopPropagation(); handlePaymentStatusClick(order); }}
          className="btn-focus-action green"
          aria-label="บันทึกชำระ"
        >
          <CreditCard className="w-4 h-4" />
          <span className="hidden md:inline">บันทึกชำระ</span>
        </button>
      );
    }

    // Primary: Accept order (manual, new tab, credit flow — ship first pay later)
    if (statusFilter === 'new' && !isMarketplace && isCreditFlowOrder) {
      primaryActions.push(
        <button
          key="accept"
          onClick={(e) => { e.stopPropagation(); handleOrderStatusClick(order); }}
          className="btn-focus-action indigo"
          aria-label="รับออเดอร์"
        >
          <Package className="w-4 h-4" />
          <span className="hidden md:inline">รับออเดอร์</span>
        </button>
      );
    }

    // Primary: Complete action (shipping tab)
    if (statusFilter === 'shipping' && !isMarketplace) {
      primaryActions.push(
        <button
          key="complete"
          onClick={(e) => { e.stopPropagation(); handleOrderStatusClick(order); }}
          className="btn-focus-action green"
          aria-label="สำเร็จ"
        >
          <Package className="w-4 h-4" />
          <span className="hidden md:inline">สำเร็จ</span>
        </button>
      );
    }

    // === Section 1: เอกสารจัดส่ง ===
    if (['processing', 'shipping', 'completed'].includes(order.order_status)) {
      menuItems.push({
        key: 'packing', label: 'ใบจัดของ', icon: <ClipboardList className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintPackingList(order.id); },
        className: 'p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
      });
    }
    if (['processing', 'shipping'].includes(order.order_status)) {
      const sourceLabel = isMarketplace ? ` ${order.source === 'tiktok' ? 'TikTok Shop' : order.source === 'line_shopping' ? 'LINE Shopping' : order.source?.charAt(0).toUpperCase() + (order.source?.slice(1) || '')}` : '';
      if (isMarketplace) {
        menuItems.push({
          key: 'label', label: `ใบปะหน้า${sourceLabel}`, icon: <Printer className="w-4 h-4" />,
          onClick: (e) => { e.stopPropagation(); handlePrintShopeeLabel(order.id, order.source); },
          className: 'p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
        });
      } else {
        menuItems.push({
          key: 'label', label: 'ใบปะหน้า', icon: <Printer className="w-4 h-4" />,
          onClick: (e) => { e.stopPropagation(); handlePrintShippingLabel(order.id); },
          className: 'p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
        });
      }
    }

    // หน้าซองเอกสาร — เฉพาะบิลของขวัญที่ตั้งไว้ว่าเอกสารส่งไปรษณีย์ (ไม่ผูกกับสถานะ:
    // ร้านมักเตรียมซองตั้งแต่ก่อนแพ็ค)
    if (order.document_by_post) {
      menuItems.push({
        key: 'doc-envelope', label: 'ใบปะหน้าซองเอกสาร', icon: <Mail className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrint(order.id, 'doc_envelope'); },
        className: 'p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
      });
    }

    // === Section 2: เอกสารการเงิน ===
    const section2Start = menuItems.length;
    const docType = order.tax_invoice_doc_type;
    const hasFullTax = docType === 'tax';

    if (order.payment_status !== 'paid') {
      menuItems.push({
        key: 'invoice', label: 'ใบแจ้งหนี้', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id); },
        className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
      });
    } else if (vatRegistered) {
      // จด VAT + paid
      if (!hasFullTax) {
        // ยังไม่ออกแบบเต็ม → แสดง ABB + ออกใบกำกับแบบเต็ม
        menuItems.push({
          key: 'abbreviated-invoice', label: 'ใบกำกับอย่างย่อ', icon: <Banknote className="w-4 h-4" />,
          onClick: (e) => { e.stopPropagation(); handlePrintAbbreviatedInvoice(order.id); },
          className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
        });
        menuItems.push({
          key: 'full-invoice', label: <><span className="text-orange-500 font-semibold">ออก</span>ใบกำกับแบบเต็ม</>, icon: <Banknote className="w-4 h-4" />,
          onClick: async (e) => { e.stopPropagation(); const ok = await confirm({ title: 'ออกใบกำกับภาษีแบบเต็ม', description: 'หากออกใบกำกับแบบเต็มแล้ว ระบบจะยกเลิก (void) ใบกำกับภาษีอย่างย่อให้อัตโนมัติ', confirmLabel: 'ออกใบกำกับแบบเต็ม' }); if (!ok) return; setTaxInvoiceModal({ orderId: order.id, orderNumber: order.order_number, customerId: order.customer_id, hasAbbrev: docType === 'abbreviated' && !order.tax_invoice_voided_at }); },
          className: 'p-1.5 text-gray-400 hover:text-emerald-600 transition-colors rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
        });
      } else {
        // ออกแบบเต็มแล้ว → แสดงแค่ใบกำกับแบบเต็ม (ซ่อน ABB)
        menuItems.push({
          key: 'full-invoice', label: 'ใบกำกับแบบเต็ม', icon: <Banknote className="w-4 h-4" />,
          onClick: (e) => { e.stopPropagation(); handlePrintFullTaxInvoice(order.id); },
          className: 'p-1.5 text-gray-400 hover:text-emerald-600 transition-colors rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
        });
      }
    } else {
      // ไม่จด VAT + paid: ใบเสร็จรับเงินอย่างเดียว
      menuItems.push({
        key: 'receipt', label: 'ใบเสร็จรับเงิน', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id); },
        className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
      });
    }
    if (menuItems.length > section2Start && section2Start > 0) {
      menuItems[section2Start].dividerBefore = true;
    }

    // Quick action: Copy bill online link (always visible for non-marketplace orders)
    if (!isMarketplace) {
      primaryActions.push(
        <Tooltip key="copy-link" text="คัดลอกลิงก์บิลออนไลน์">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const billUrl = `${window.location.origin}/bills/${order.id}`;
              copy(billUrl, 'ลิงก์บิลออนไลน์');
            }}
            className="p-2 text-gray-500 hover:text-primary rounded-lg transition-colors"
            aria-label="คัดลอกลิงก์บิลออนไลน์"
          >
            <Link2 className="w-4 h-4" />
          </button>
        </Tooltip>
      );
    }

    // === Section 3: อื่นๆ ===
    if (!isMarketplace) {
      const section3Start = menuItems.length;
      if (order.order_status !== 'cancelled') {
        menuItems.push({
          key: 'edit', label: 'แก้ไข', icon: <Edit2 className="w-4 h-4" />,
          onClick: (e) => { e.stopPropagation(); router.push(`/orders/${order.id}/edit`); },
          className: 'p-1.5 text-blue-500 hover:text-blue-700 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
        });
      }
      if (!['ready_to_ship', 'processing', 'shipping'].includes(statusFilter)) {
        menuItems.push({
          key: 'duplicate', label: 'สั่งซ้ำ', icon: <Copy className="w-4 h-4" />,
          onClick: (e) => { e.stopPropagation(); router.push(`/orders/new?duplicate=${order.id}`); },
          className: 'p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
        });
      }
      if (section3Start > 0) menuItems[section3Start].dividerBefore = true;
    }

    // === Section 4: สถานะ ===
    if (!isMarketplace) {
      const section4Start = menuItems.length;
      if (!['cancelled', 'completed'].includes(order.order_status)) {
        menuItems.push({
          key: 'cancel', label: 'ยกเลิก', icon: <Trash2 className="w-4 h-4" />,
          onClick: async (e) => {
            e.stopPropagation();
            const ok = await confirm({ title: `ยกเลิกคำสั่งซื้อ "${order.order_number}"?`, description: 'ต้องการยกเลิกคำสั่งซื้อนี้หรือไม่', variant: 'danger' });
            if (!ok) return;
            try {
              const response = await apiFetch('/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: order.id, order_status: 'cancelled' })
              });
              if (!response.ok) throw new Error('Failed to cancel');
              await fetchOrders();
              window.dispatchEvent(new Event('orders-count-changed'));
              showToast('ยกเลิกคำสั่งซื้อสำเร็จ');
            } catch (error) {
              showToast(error instanceof Error ? error.message : 'ไม่สามารถยกเลิกได้', 'error');
            }
          },
          className: 'p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30',
          danger: true,
        });
      }
      if (order.order_status === 'cancelled' && (userProfile?.roles?.includes('owner') || userProfile?.roles?.includes('admin'))) {
        menuItems.push({
          key: 'del', label: 'ลบ', icon: <Trash2 className="w-4 h-4" />,
          onClick: (e) => handleDeleteOrder(e, order),
          className: 'p-1.5 text-red-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30',
          danger: true,
        });
      }
      if (menuItems.length > section4Start && section4Start > 0) {
        menuItems[section4Start].dividerBefore = true;
      }
    }

    return (
      <>
        {primaryActions}
        <ActionMenu items={menuItems} />
      </>
    );
  };

  const renderDefaultOrderCard = (order: Order) => (
    <OrderCard
      key={order.id}
      order={order}
      statusFilter={statusFilter}
      onImageClick={(url) => setLightboxImage(url)}
      showOrderStatus={statusFilter === 'all' || statusFilter === 'cancelled'}
      showPaymentStatus={order.order_status !== 'cancelled'}
      actions={renderDefaultCardActions(order)}
    />
  );

  // Decide which content to render based on active tab
  const renderOrderList = () => {
    // ProcessingTab manages its own data fetching & empty state
    if (statusFilter === 'processing') {
      return (
        <ProcessingTab
          carrierCounts={carrierCounts}
          onHoldCount={onHoldCount}
          search={debouncedSearch}
          channel={channelFilter}
          createdBy={createdByFilter}
          paymentFilter={paymentFilter}
          orderTypeFilter={orderTypeFilter}
          platformFilter={platformFilter}
          userProfile={userProfile}
          onRefresh={fetchOrders}
          onImageClick={(url) => setLightboxImage(url)}
          onStatusClick={handleOrderStatusClick}
          onPaymentClick={handlePaymentStatusClick}
          onDeleteOrder={handleDeleteOrder}
        />
      );
    }

    if (displayedOrders.length === 0) {
      const isFiltered = !!(searchTerm || statusFilter !== 'all' || paymentFilter !== 'all' || channelFilter !== 'all' || createdByFilter !== 'all' || deliveryDateRange?.startDate);
      return (
        <EmptyCard
          icon={<ShoppingCart className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          title={isFiltered ? 'ไม่พบคำสั่งซื้อที่ค้นหา' : 'ยังไม่มีคำสั่งซื้อ'}
        />
      );
    }

    // Tab-specific components
    if (statusFilter === 'ready_to_ship') {
      return (
        <ReadyToShipTab
          normalCount={(statusCounts.ready_to_ship || 0) - rtsOnHoldCount}
          onHoldCount={rtsOnHoldCount}
          search={debouncedSearch}
          channel={channelFilter}
          createdBy={createdByFilter}
          paymentFilter={paymentFilter}
          orderTypeFilter={orderTypeFilter}
          platformFilter={platformFilter}
          userProfile={userProfile}
          onRefresh={fetchOrders}
          onImageClick={(url) => setLightboxImage(url)}
          onPaymentClick={handlePaymentStatusClick}
          onStatusClick={handleOrderStatusClick}
          onDeleteOrder={handleDeleteOrder}
        />
      );
    }

    // Default: all / new / shipping / completed / cancelled tabs
    return (
      <div className="space-y-3">
        {displayedOrders.map(renderDefaultOrderCard)}
      </div>
    );
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          title="คำสั่งซื้อ"
          icon={<ShoppingCart />}
          actions={<>
            {/* box="inline-flex" — ปุ่มนี้ disabled ตอนกำลังโหลด ซึ่งไม่ยิง pointer event ต้องมีกล่องครอบถึงจะ hover ติด */}
            <Tooltip text="รีเฟรช" box="inline-flex">
              <button
                type="button"
                onClick={() => fetchOrders()}
                disabled={fetching}
                aria-label="รีเฟรช"
                className="text-gray-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${fetching ? 'animate-spin' : ''}`} />
              </button>
            </Tooltip>
            <Button
              variant="primary"
              icon={<Plus className="w-5 h-5" />}
              onClick={() => router.push('/orders/new')}
              onMouseEnter={() => {
                // Warm the page bundle and prime the API cache so a click
                // lands on an already-fetched form. apiFetch's 30s cache
                // catches the result so the form mount skips the round trip.
                router.prefetch('/orders/new');
                apiFetch('/api/orders/new/init').catch(() => {});
              }}
            >
              <span>สร้าง<span className="hidden md:inline">คำสั่งซื้อ</span></span>
            </Button>
          </>}
        />

        {/* Marketplace quota paused — บอกก่อนที่คนจะงงว่าออเดอร์หายไปไหน */}
        <MarketplaceQuotaPausedAlert />

        {/* Error */}
        {error && <Alert tone="danger">{error}</Alert>}

        {/* Status Tabs */}
        <StatusTabs
          activeKey={statusFilter}
          onSelect={(k) => setParams({ status: k })}
          tabs={[
            { key: 'all', label: 'ทั้งหมด', count: statusCounts.all || 0 },
            { key: 'new', label: 'ใหม่', count: statusCounts.new || 0 },
            { key: 'ready_to_ship', label: 'รอกดรับ', count: statusCounts.ready_to_ship || 0 },
            { key: 'processing', label: 'ที่ต้องจัดส่ง', count: statusCounts.processing || 0 },
            { key: 'shipping', label: 'กำลังส่ง', count: statusCounts.shipping || 0 },
            { key: 'completed', label: 'สำเร็จ', count: statusCounts.completed || 0 },
            { key: 'cancelled', label: 'ยกเลิก', count: statusCounts.cancelled || 0 },
          ]}
        />

        {/* Filters */}
        <div className="data-filter-card">
          {/* Desktop Row 1: Search + All Channel + ตัวกรอง */}
          {/* Mobile Row 1: Search + ตัวกรอง */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onChange={handleSearchChange}
                onSubmit={handleSearchSubmit}
                placeholder="ค้นหาเลขที่, ชื่อลูกค้า..."
                className="py-2.5"
              />
            </div>
            {/* Desktop only: All Channel in row 1 */}
            {channelDropdownOptions.length > 0 && (
              <div className="hidden sm:block">
                <SearchableDropdown
                  value={channelFilter}
                  onChange={(v) => setParams({ channel: v })}
                  options={channelDropdownOptions}
                  placeholder="ทุกช่องทาง"
                  searchPlaceholder="ค้นหาช่องทาง..."
                  allLabel="ทุกช่องทาง"
                  defaultIcon={<Store className="w-4 h-4" />}
                  extraOptions={[
                    { id: 'none', label: 'เปิดบิลตรง', icon: <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0"><X className="w-3.5 h-3.5 text-gray-400 dark:text-slate-400" /></div> },
                  ]}
                />
              </div>
            )}
            {(() => {
              const advCount = [paymentFilter !== 'all', createdByFilter !== 'all', orderTypeFilter !== 'all', !!deliveryDateRange?.startDate].filter(Boolean).length;
              return (
                <Button
                  variant="secondary"
                  onClick={() => setShowAdvancedFilter(true)}
                  icon={<SlidersHorizontal className="w-4 h-4" />}
                  className={advCount > 0 ? '!border-primary !bg-orange-50 dark:!bg-orange-900/20 !text-primary' : ''}
                >
                  <span className="hidden sm:inline">ตัวกรอง</span>
                  {advCount > 0 && (
                    <Badge tone="orange" size="sm" className="!bg-primary !text-white">
                      {advCount}
                    </Badge>
                  )}
                </Button>
              );
            })()}
            {/* Clear filters — icon only, far right */}
            {hasActiveFilters && (
              <Tooltip text="ล้างตัวกรอง">
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setDeliveryDateRange({ startDate: null, endDate: null });
                    router.replace('/orders', { scroll: false });
                  }}
                  aria-label="ล้างตัวกรอง"
                  className="text-gray-400 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
                >
                  <FilterX className="w-4 h-4" />
                </button>
              </Tooltip>
            )}
          </div>

          {/* Row 2 */}
          {/* Mobile: All Channel + Platform dropdown */}
          {/* Desktop: Platform chips */}
          <div className="flex items-center gap-2 mt-4">
            {/* Mobile only: All Channel in row 2 */}
            {channelDropdownOptions.length > 0 && (
              <div className="sm:hidden">
                <SearchableDropdown
                  value={channelFilter}
                  onChange={(v) => setParams({ channel: v })}
                  options={channelDropdownOptions}
                  placeholder="ทุกช่องทาง"
                  searchPlaceholder="ค้นหาช่องทาง..."
                  allLabel="ทุกช่องทาง"
                  defaultIcon={<Store className="w-4 h-4" />}
                  extraOptions={[
                    { id: 'none', label: 'เปิดบิลตรง', icon: <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0"><X className="w-3.5 h-3.5 text-gray-400 dark:text-slate-400" /></div> },
                  ]}
                />
              </div>
            )}
            <PlatformChipFilter
              value={platformFilter}
              onChange={(v) => setParams({ platform: v })}
            />
          </div>
        </div>

        {/* Advanced filter modal */}
        <Modal
          open={showAdvancedFilter}
          onClose={() => setShowAdvancedFilter(false)}
          title="ตัวกรองเพิ่มเติม"
          size="md"
          footer={
            <div className="px-5 py-4 flex items-center justify-between">
              {(paymentFilter !== 'all' || createdByFilter !== 'all' || orderTypeFilter !== 'all' || deliveryDateRange?.startDate) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDeliveryDateRange({ startDate: null, endDate: null });
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete('payment');
                    params.delete('created_by');
                    params.delete('order_type');
                    params.delete('page');
                    const qs = params.toString();
                    router.replace(qs ? `?${qs}` : '/orders', { scroll: false });
                  }}
                  className="!text-gray-500 dark:!text-slate-400 hover:!text-red-500 dark:hover:!text-red-400"
                >
                  ล้างตัวกรอง
                </Button>
              ) : <div />}
              <Button variant="primary" onClick={() => setShowAdvancedFilter(false)}>
                เสร็จสิ้น
              </Button>
            </div>
          }
        >
          <div className="px-5 py-4 space-y-4">
            {/* Payment status */}
            <div>
              <label className="field-label">สถานะชำระ</label>
              <FormSelect
                value={paymentFilter}
                onChange={(v) => setParams({ payment: v })}
                options={[
                  { id: 'pending', label: 'รอชำระ' },
                  { id: 'verifying', label: 'รอตรวจสอบ' },
                  { id: 'paid', label: 'ชำระแล้ว' },
                ]}
                placeholder="ทั้งหมด"
                clearLabel="ทั้งหมด"
                clearValue="all"
                icon={<CreditCard className="w-4 h-4" />}
                searchThreshold={99}
                portal
              />
            </div>
            {/* Order type */}
            <div>
              <label className="field-label">ประเภทบิล</label>
              <FormSelect
                value={orderTypeFilter}
                onChange={(v) => setParams({ order_type: v })}
                options={[
                  { id: 'exchange', label: 'เปลี่ยนสินค้า' },
                  { id: 'normal', label: 'บิลปกติ' },
                ]}
                placeholder="ทั้งหมด"
                clearLabel="ทั้งหมด"
                clearValue="all"
                icon={<Repeat className="w-4 h-4" />}
                searchThreshold={99}
                portal
              />
            </div>
            {/* Created by */}
            <div>
              <label className="field-label">ผู้เปิดบิล</label>
              {createdByDropdownOptions.length > 0 ? (
                <SearchableDropdown
                  value={createdByFilter}
                  onChange={(v) => setParams({ created_by: v })}
                  options={createdByDropdownOptions}
                  placeholder="ทั้งหมด"
                  searchPlaceholder="ค้นหาชื่อ..."
                  defaultIcon={<User className="w-4 h-4" />}
                />
              ) : (
                <FormSelect value="" onChange={() => {}} options={[]} placeholder="ทั้งหมด" disabled icon={<User className="w-4 h-4" />} searchThreshold={99} portal />
              )}
            </div>
            {/* Delivery date */}
            {features.delivery_date.enabled && (
              <div>
                <label className="field-label">วันที่ส่ง</label>
                <DateRangePicker
                  value={deliveryDateRange}
                  onChange={(val) => setDeliveryDateRange(val)}
                  placeholder="ทั้งหมด"
                />
              </div>
            )}
          </div>
        </Modal>

        {fetching ? (
          <LoadingCard compact />
        ) : (
        <>
          {/* Sort bar + count (hidden for processing tab -- it has own pagination) */}
          {statusFilter !== 'processing' && (
            <div className="flex items-center justify-between">
              <p className="subtitle-text">
                {totalOrders > 0 ? `${startIndex + 1}-${endIndex} จาก ${totalOrders} รายการ` : 'ไม่พบรายการ'}
              </p>
              <FormSelect
                value={sortValue}
                onChange={(v) => setParams({ sort: v })}
                options={SORT_OPTIONS}
                size="sm"
                searchThreshold={99}
              />
            </div>
          )}

          {/* Order list -- tab-specific or default */}
          {renderOrderList()}

          {/* Pagination (hidden for processing & ready_to_ship tabs -- they have own pagination) */}
          {statusFilter !== 'processing' && statusFilter !== 'ready_to_ship' && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalOrders}
              startIdx={startIndex}
              endIdx={endIndex}
              recordsPerPage={recordsPerPage}
              setRecordsPerPage={(v) => setParams({ limit: String(v) })}
              setPage={(p) => {
                // Page change should NOT reset page (it IS the page change)
                const params = new URLSearchParams(searchParams.toString());
                if (p === 1) {
                  params.delete('page');
                } else {
                  params.set('page', String(p));
                }
                const qs = params.toString();
                router.replace(qs ? `?${qs}` : '/orders', { scroll: false });
              }}
              onLimitChange={(limit) => {
                // setParams auto-deletes page when filter (non-page) changes,
                // which is exactly "reset to page 1". Single call = no stale closure.
                setParams({ limit: String(limit) });
              }}
            />
          )}
        </>
        )}

        {/* Status Update Modal (order status only) */}
        <Modal
          open={statusUpdateModal.show}
          onClose={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
          title="ยืนยันการเปลี่ยนสถานะคำสั่งซื้อ"
          size="lg"
          footer={
            <div className="px-5 py-4 flex gap-3 justify-end">
              <Button
                variant="secondary"
                disabled={updatingStatus}
                onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
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
          }
        >
          <div className="p-5 space-y-3">
            <p className="body-text">
              คำสั่งซื้อ: <span className="font-medium">{statusUpdateModal.order?.order_number}</span>
            </p>
            <p className="body-text">
              ลูกค้า: <span className="font-medium">{statusUpdateModal.order?.customer_name || statusUpdateModal.order?.delivery_name}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="subtitle-text">เปลี่ยนจาก:</span>
              <Badge tone={getStatusBadgeTone(statusUpdateModal.order?.order_status || '')} size="sm">
                {ORDER_STATUS_CONFIG[statusUpdateModal.order?.order_status || '']?.label || ''}
              </Badge>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <Badge tone={getStatusBadgeTone(statusUpdateModal.nextStatus)} size="sm">
                {ORDER_STATUS_CONFIG[statusUpdateModal.nextStatus]?.label || ''}
              </Badge>
            </div>

            {/* Shipping Details Form (processing -> shipping) */}
            {statusUpdateModal.nextStatus === 'shipping' && (
              <div className="mt-6 pt-6 border-t dark:border-slate-700 space-y-4">
                <h4 className="heading-4">ข้อมูลจัดส่ง</h4>
                <div>
                  <label className="field-label">ขนส่ง</label>
                  <FormSelect
                    value={shippingDetails.carrier}
                    onChange={(val) => setShippingDetails({ ...shippingDetails, carrier: val })}
                    options={carrierOptions}
                    placeholder="-- เลือกขนส่ง --"
                    searchThreshold={99}
                  />
                </div>
                <FormInput
                  label="เลขพัสดุ"
                  type="text"
                  value={shippingDetails.trackingNumber}
                  onChange={(e) => setShippingDetails({ ...shippingDetails, trackingNumber: e.target.value })}
                  placeholder="กรอกเลขพัสดุ (ไม่บังคับ)"
                />
              </div>
            )}
          </div>
        </Modal>

        {/* Payment Modal (shared component) */}
        <PaymentModal
          show={!!paymentModalOrder}
          orderId={paymentModalOrder?.id || ''}
          orderNumber={paymentModalOrder?.order_number || ''}
          totalAmount={paymentModalOrder?.total_amount || 0}
          defaultPaymentMethod={paymentModalOrder?.payment_method || 'cash'}
          onClose={() => setPaymentModalOrder(null)}
          onSuccess={() => { setPaymentModalOrder(null); fetchOrders(); }}
        />

        {/* Tax Invoice Modal */}
        {taxInvoiceModal && (
          <TaxInvoiceModal
            orderId={taxInvoiceModal.orderId}
            orderNumber={taxInvoiceModal.orderNumber}
            customerId={taxInvoiceModal.customerId}
            hasAbbrev={taxInvoiceModal.hasAbbrev}
            onClose={() => setTaxInvoiceModal(null)}
            onSaved={async (updatedOrder) => {
              setTaxInvoiceModal(null);
              try {
                const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
                const fetchRes = await apiFetch(`/api/orders/${updatedOrder.id}`);
                if (!fetchRes.ok) throw new Error('Failed to fetch order');
                const fetchData = await fetchRes.json();
                const orderData = fetchData.order;
                const blob = await generateFullInvoicePdf({
                  ...orderData,
                  tax_invoice_number: updatedOrder.tax_invoice_number,
                  tax_invoice_date: updatedOrder.tax_invoice_date,
                  tax_invoice_name: updatedOrder.tax_invoice_name,
                  tax_invoice_tax_id: updatedOrder.tax_invoice_tax_id,
                  tax_invoice_address: updatedOrder.tax_invoice_address,
                  tax_invoice_branch: updatedOrder.tax_invoice_branch,
                });
                showPdfPreview(blob, 'ใบกำกับแบบเต็ม/ใบเสร็จรับเงิน');
                markOrdersPrinted([updatedOrder.id as string], 'invoice');
                updateLocalPrintStatus(setOrders, [updatedOrder.id as string], 'invoice');
              } catch (err) {
                showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
              }
              fetchOrders();
            }}
          />
        )}
      </Container>

      <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} alt="Product" />

      {/* PDF Loading Overlay */}
      <LoadingOverlay
        isOpen={pdfLoading}
        title={pdfMessage || 'กำลังสร้าง PDF...'}
        showWarning={false}
      />
      {confirmDialog}
    </Layout>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    }>
      <OrdersPageContent />
    </Suspense>
  );
}
