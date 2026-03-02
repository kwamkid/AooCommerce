'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput, { SearchInputHandle } from '@/components/ui/SearchInput';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import {
  ShoppingCart,
  Plus,
  Loader2,
  Trash2,
  Edit2,
  ChevronRight,
  Link2,
  CheckCircle,
  X,
  ChevronDown,
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
  SHIPPING_CARRIERS,
} from './components/types';

// Tab components
import ReadyToShipTab from './components/ReadyToShipTab';
import ProcessingTab from './components/ProcessingTab';
import OrderCard from './components/OrderCard';
import ActionMenu, { ActionItem } from './components/ActionMenu';
import PaymentModal from './components/PaymentModal';
import TaxInvoiceModal from './components/TaxInvoiceModal';
import { generateOrderInvoicePdf } from '@/lib/order-invoice-pdf';
import { generatePackingPdf } from '@/lib/orders-packing-pdf';
import { generateShippingLabelPdf } from '@/lib/order-shipping-label-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import { markOrdersPrinted, updateLocalPrintStatus } from '@/lib/print-tracking';
import { isMarketplaceSource } from '@/lib/marketplace/types';
import { useCompany } from '@/lib/company-context';
import { getInvoiceMenuLabel } from '@/lib/invoice-utils';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import FormSelect from '@/components/ui/FormSelect';
import { useConfirmDialog } from '@/lib/useConfirmDialog';

// Sort options
const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'ล่าสุด' },
  { value: 'created_at:asc', label: 'เก่าสุด' },
  { value: 'delivery_date:asc', label: 'ส่งเร็วสุด' },
  { value: 'delivery_date:desc', label: 'ส่งช้าสุด' },
  { value: 'total_amount:desc', label: 'ยอดมากสุด' },
  { value: 'total_amount:asc', label: 'ยอดน้อยสุด' },
];

const VALID_TABS = ['all', 'new', 'ready_to_ship', 'processing', 'shipping', 'completed', 'cancelled'];

function getInitialTab(): string {
  if (typeof window === 'undefined') return 'all';
  const hash = window.location.hash.replace('#', '');
  return VALID_TABS.includes(hash) ? hash : 'all';
}

export default function OrdersPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;
  const { confirmDialog, confirm } = useConfirmDialog();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(getInitialTab);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [channelDropdownOptions, setChannelDropdownOptions] = useState<DropdownOption[]>([]);
  const [createdByFilter, setCreatedByFilter] = useState('all');
  const [createdByDropdownOptions, setCreatedByDropdownOptions] = useState<DropdownOption[]>([]);
  const [deliveryDateRange, setDeliveryDateRange] = useState<DateValueType>({
    startDate: null,
    endDate: null,
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  // Sort
  const [sortValue, setSortValue] = useState('created_at:desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const sortBy = sortValue.split(':')[0];
  const sortDir = sortValue.split(':')[1] as 'asc' | 'desc';

  // Status update modal
  const [statusUpdateModal, setStatusUpdateModal] = useState<{
    show: boolean;
    order: Order | null;
    nextStatus: string;
    statusType: 'order' | 'payment';
  }>({ show: false, order: null, nextStatus: '', statusType: 'order' });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Shipping details (for processing → shipping)
  const [shippingDetails, setShippingDetails] = useState({ carrier: '', trackingNumber: '' });

  // Payment modal (shared component)
  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);

  // Server-side pagination
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [toast, setToast] = useState('');

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
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');

  // Close lightbox on ESC
  useEffect(() => {
    if (!lightboxImage) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxImage(null); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [lightboxImage]);

  // Close modal on ESC
  useEffect(() => {
    if (!statusUpdateModal.show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' });
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [statusUpdateModal.show]);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSortDropdown) return;
    const handleClick = () => setShowSortDropdown(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showSortDropdown]);

  // Search on Enter (immediate)
  const handleSearchSubmit = useCallback(() => {
    setDebouncedSearch(searchTerm);
    setCurrentPage(1);
  }, [searchTerm]);

  // Auto-debounce search after 500ms of no typing
  useEffect(() => {
    if (!searchTerm) return; // clear is handled in onChange
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Sync hash with statusFilter
  useEffect(() => {
    const newHash = statusFilter === 'all' ? '' : `#${statusFilter}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${newHash}`);
    }
  }, [statusFilter]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash)) setStatusFilter(hash);
      else if (!hash) setStatusFilter('all');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentFilter, channelFilter, createdByFilter, orderTypeFilter, platformFilter, recordsPerPage]);

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
      params.set('limit', recordsPerPage.toString());
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);
      params.set('source', 'exclude_pos');
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
        setChannelDropdownOptions(result.channelOptions.map((ch: ChannelOption) => ({
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

  // Status flow helpers
  const getNextOrderStatus = (currentStatus: string): string | null => {
    const flow: Record<string, string> = { new: 'ready_to_ship', ready_to_ship: 'processing', processing: 'shipping', shipping: 'completed' };
    return flow[currentStatus] || null;
  };

  // Handle status click
  const handleOrderStatusClick = (order: Order) => {
    const nextStatus = getNextOrderStatus(order.order_status);
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

  // === PDF print handlers ===
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | undefined>();
  const [taxInvoiceModal, setTaxInvoiceModal] = useState<{ orderId: string; orderNumber: string; customerId?: string } | null>(null);

  const fetchOrderForPdf = async (orderId: string) => {
    const res = await apiFetch(`/api/orders/${orderId}`);
    if (!res.ok) throw new Error('Failed to fetch order');
    const result = await res.json();
    return result.order;
  };

  const handlePrintInvoice = async (orderId: string, paymentStatus?: string) => {
    setPdfLoading(true);
    const label = getInvoiceMenuLabel(paymentStatus || 'pending', vatRegistered);
    setPdfMessage(`กำลังสร้าง${label}...`);
    try {
      const orderData = await fetchOrderForPdf(orderId);
      const blob = await generateOrderInvoicePdf({ data: orderData });
      showPdfPreview(blob, label);
      markOrdersPrinted([orderId], 'invoice');
      updateLocalPrintStatus(setOrders, [orderId], 'invoice');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPdfLoading(false);
      setPdfMessage(undefined);
    }
  };

  const handlePrintPackingList = async (orderId: string) => {
    setPdfLoading(true);
    setPdfMessage('กำลังสร้างใบจัดของ...');
    try {
      const orderData = await fetchOrderForPdf(orderId);

      // Build order list (expand split parcels as separate entries)
      const ordersData: any[] = [];
      if (orderData.is_split && orderData.parcels?.length > 0) {
        for (const parcel of orderData.parcels) {
          const parcelItems = (parcel.items || []).map((pi: any) => {
            const fullItem = orderData.items?.find((i: any) => i.id === pi.order_item_id);
            return {
              product_name: pi.product_name || fullItem?.product_name || '',
              variation_label: pi.variation_label || fullItem?.variation_label || null,
              quantity: pi.quantity,
              image: pi.image || fullItem?.image || null,
              barcode: fullItem?.barcode || null,
              sku: fullItem?.sku || null,
              product_code: fullItem?.product_code || null,
            };
          });
          ordersData.push({
            ...orderData,
            items: parcelItems.length > 0 ? parcelItems : orderData.items,
            order_number: `${orderData.order_number} (กล่อง ${parcel.parcel_number}/${orderData.parcels.length})`,
          });
        }
      } else {
        ordersData.push(orderData);
      }

      const blob = await generatePackingPdf(ordersData);
      showPdfPreview(blob, 'ใบจัดของ');
      markOrdersPrinted([orderId], 'packing');
      updateLocalPrintStatus(setOrders, [orderId], 'packing');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPdfLoading(false);
      setPdfMessage(undefined);
    }
  };

  const handlePrintShippingLabel = async (orderId: string) => {
    setPdfLoading(true);
    setPdfMessage('กำลังสร้างใบปะหน้า...');
    try {
      const orderData = await fetchOrderForPdf(orderId);
      const blob = await generateShippingLabelPdf({ data: orderData });
      showPdfPreview(blob, 'ใบปะหน้า');
      markOrdersPrinted([orderId], 'label');
      updateLocalPrintStatus(setOrders, [orderId], 'label');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPdfLoading(false);
      setPdfMessage(undefined);
    }
  };

  const handlePrintShopeeLabel = async (orderId: string) => {
    setPdfLoading(true);
    setPdfMessage('กำลังสร้างใบปะหน้า Shopee...');
    try {
      const response = await apiFetch('/api/shopee/orders/shipping-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate Shopee label');
      }
      const blob = await response.blob();
      showPdfPreview(blob, 'ใบปะหน้า Shopee');
      markOrdersPrinted([orderId], 'label');
      updateLocalPrintStatus(setOrders, [orderId], 'label');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPdfLoading(false);
      setPdfMessage(undefined);
    }
  };

  // === Render Default Order Card (for tabs without special components) ===
  const renderDefaultCardActions = (order: Order) => {
    const isMarketplace = isMarketplaceSource(order.source);
    const primaryActions: React.ReactNode[] = [];
    const menuItems: ActionItem[] = [];

    // Primary: Payment action (manual, new tab, pending payment)
    if (statusFilter === 'new' && !isMarketplace && order.payment_status === 'pending') {
      primaryActions.push(
        <button
          key="pay"
          onClick={(e) => { e.stopPropagation(); handlePaymentStatusClick(order); }}
          className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1.5"
          title="บันทึกชำระ"
        >
          <CreditCard className="w-4 h-4" />
          <span className="hidden md:inline">บันทึกชำระ</span>
        </button>
      );
    }

    // Primary: Complete action (shipping tab)
    if (statusFilter === 'shipping' && !isMarketplace) {
      primaryActions.push(
        <button
          key="complete"
          onClick={(e) => { e.stopPropagation(); handleOrderStatusClick(order); }}
          className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1.5"
          title="สำเร็จ"
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
          onClick: (e) => { e.stopPropagation(); handlePrintShopeeLabel(order.id); },
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

    // === Section 2: เอกสารการเงิน ===
    const section2Start = menuItems.length;
    if (order.payment_status !== 'paid') {
      menuItems.push({
        key: 'invoice', label: 'ใบแจ้งหนี้', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id, order.payment_status); },
        className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
      });
    }
    if (order.payment_status === 'paid') {
      menuItems.push({
        key: 'receipt', label: 'ใบเสร็จรับเงิน', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id, order.payment_status); },
        className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
      });
    }
    if (vatRegistered && order.payment_status === 'paid' && order.tax_invoice_requested !== true) {
      menuItems.push({
        key: 'abbreviated-invoice', label: 'ใบกำกับอย่างย่อ', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id, order.payment_status); },
        className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
      });
      menuItems.push({
        key: 'full-invoice', label: 'ใบกำกับแบบเต็ม', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); setTaxInvoiceModal({ orderId: order.id, orderNumber: order.order_number, customerId: order.customer_id }); },
        className: 'p-1.5 text-gray-400 hover:text-emerald-600 transition-colors rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
      });
    }
    if (menuItems.length > section2Start && section2Start > 0) {
      menuItems[section2Start].dividerBefore = true;
    }

    // Quick action: Copy bill online link (always visible for non-marketplace orders)
    if (!isMarketplace) {
      primaryActions.push(
        <button
          key="copy-link"
          onClick={(e) => {
            e.stopPropagation();
            const billUrl = `${window.location.origin}/bills/${order.id}`;
            navigator.clipboard.writeText(billUrl).then(() => {
              setToast('คัดลอกลิงก์บิลออนไลน์แล้ว');
              setTimeout(() => setToast(''), 2500);
            });
          }}
          className="p-2 text-gray-500 hover:text-[#F4511E] rounded-lg transition-colors"
          title="คัดลอกลิงก์บิลออนไลน์"
        >
          <Link2 className="w-4 h-4" />
        </button>
      );
    }

    // === Section 3: อื่นๆ ===
    if (!order.source || order.source === 'manual') {
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
    if (!order.source || order.source === 'manual') {
      const section4Start = menuItems.length;
      if (!['cancelled', 'completed'].includes(order.order_status)) {
        menuItems.push({
          key: 'cancel', label: 'ยกเลิก', icon: <Trash2 className="w-4 h-4" />,
          onClick: (e) => {
            e.stopPropagation();
            setStatusUpdateModal({ show: true, order, nextStatus: 'cancelled', statusType: 'order' });
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
      return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 py-16 text-center">
          <ShoppingCart className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400">
            {searchTerm || statusFilter !== 'all' || paymentFilter !== 'all' || channelFilter !== 'all' || createdByFilter !== 'all' || deliveryDateRange?.startDate
              ? 'ไม่พบคำสั่งซื้อที่ค้นหา'
              : 'ยังไม่มีคำสั่งซื้อ'}
          </p>
        </div>
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
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-[#F4511E]" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">คำสั่งซื้อ</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOrders()}
              disabled={fetching}
              className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-white transition-colors disabled:opacity-50"
              title="รีเฟรช"
            >
              <RefreshCw className={`w-5 h-5 ${fetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => router.push('/orders/new')}
              className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              สร้าง<span className="hidden md:inline">คำสั่งซื้อ</span>
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        )}

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'ทั้งหมด', active: 'bg-indigo-600', inactive: 'bg-indigo-50 dark:bg-indigo-950/50', labelColor: 'text-indigo-600 dark:text-indigo-400', countColor: 'text-indigo-700 dark:text-indigo-300' },
            { key: 'new', label: 'ใหม่', active: 'bg-blue-600', inactive: 'bg-blue-50 dark:bg-blue-950/50', labelColor: 'text-blue-600 dark:text-blue-400', countColor: 'text-blue-700 dark:text-blue-300' },
            { key: 'ready_to_ship', label: 'รอกดรับ', active: 'bg-orange-500', inactive: 'bg-orange-50 dark:bg-orange-950/50', labelColor: 'text-orange-600 dark:text-orange-400', countColor: 'text-orange-700 dark:text-orange-300' },
            { key: 'processing', label: 'ที่ต้องจัดส่ง', active: 'bg-indigo-500', inactive: 'bg-indigo-50 dark:bg-indigo-950/50', labelColor: 'text-indigo-500 dark:text-indigo-400', countColor: 'text-indigo-700 dark:text-indigo-300' },
            { key: 'shipping', label: 'กำลังส่ง', active: 'bg-amber-500', inactive: 'bg-amber-50 dark:bg-amber-950/50', labelColor: 'text-amber-600 dark:text-amber-400', countColor: 'text-amber-700 dark:text-amber-300' },
            { key: 'completed', label: 'สำเร็จ', active: 'bg-emerald-600', inactive: 'bg-emerald-50 dark:bg-emerald-950/50', labelColor: 'text-emerald-600 dark:text-emerald-400', countColor: 'text-emerald-700 dark:text-emerald-300' },
            { key: 'cancelled', label: 'ยกเลิก', active: 'bg-gray-500', inactive: 'bg-gray-100 dark:bg-gray-800', labelColor: 'text-gray-500 dark:text-gray-400', countColor: 'text-gray-600 dark:text-gray-300' },
          ].map((s) => {
            const isActive = statusFilter === s.key;
            const count = statusCounts[s.key] || 0;
            return (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`flex-shrink-0 rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${
                  isActive ? `${s.active} text-white shadow-md` : `${s.inactive} hover:opacity-80`
                }`}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : s.labelColor}`}>{s.label}</div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : s.countColor}`}>{count}</div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="data-filter-card">
          {/* Search + Channel dropdown + ตัวกรอง — same row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onChange={(v) => { setSearchTerm(v); if (!v) { setDebouncedSearch(''); setCurrentPage(1); } }}
                onSubmit={handleSearchSubmit}
                placeholder="ค้นหาเลขที่, ชื่อลูกค้า..."
                className="py-2.5"
              />
            </div>
            {channelDropdownOptions.length > 0 && (
              <SearchableDropdown
                  value={channelFilter}
                  onChange={setChannelFilter}
                  options={channelDropdownOptions}
                  placeholder="ทั้งหมด"
                  searchPlaceholder="ค้นหาช่องทาง..."
                  defaultIcon={<Store className="w-4 h-4" />}
                  extraOptions={[
                    { id: 'none', label: 'เปิดบิลตรง', icon: <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0"><X className="w-3.5 h-3.5 text-gray-400 dark:text-slate-400" /></div> },
                  ]}
                />
            )}
            <button
              type="button"
              onClick={() => setShowAdvancedFilter(true)}
              className={`flex items-center gap-1.5 px-3 h-[42px] border rounded-lg text-sm transition-colors flex-shrink-0 ${
                (paymentFilter !== 'all' || createdByFilter !== 'all' || orderTypeFilter !== 'all' || deliveryDateRange?.startDate)
                  ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20 text-[#F4511E]'
                  : 'border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-400 dark:hover:border-slate-500'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">ตัวกรอง</span>
              {(() => {
                const count = [paymentFilter !== 'all', createdByFilter !== 'all', orderTypeFilter !== 'all', !!deliveryDateRange?.startDate].filter(Boolean).length;
                return count > 0 ? (
                  <span className="bg-[#F4511E] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{count}</span>
                ) : null;
              })()}
            </button>
          </div>

          {/* Platform filter chips */}
          <PlatformChipFilter
            value={platformFilter}
            onChange={setPlatformFilter}
            className="mt-2"
          />
        </div>

        {/* Advanced filter modal */}
        {showAdvancedFilter && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-[15vh]" onClick={() => setShowAdvancedFilter(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">ตัวกรองเพิ่มเติม</h3>
                <button onClick={() => setShowAdvancedFilter(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                {/* Payment status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">สถานะชำระ</label>
                  <FormSelect
                    value={paymentFilter}
                    onChange={setPaymentFilter}
                    options={[
                      { id: 'pending', label: 'รอชำระ' },
                      { id: 'verifying', label: 'รอตรวจสอบ' },
                      { id: 'paid', label: 'ชำระแล้ว' },
                    ]}
                    clearLabel="ทั้งหมด"
                    icon={<CreditCard className="w-4 h-4" />}
                    searchThreshold={99}
                  />
                </div>
                {/* Order type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">ประเภทบิล</label>
                  <FormSelect
                    value={orderTypeFilter}
                    onChange={setOrderTypeFilter}
                    options={[
                      { id: 'exchange', label: 'เปลี่ยนสินค้า' },
                      { id: 'normal', label: 'บิลปกติ' },
                    ]}
                    clearLabel="ทั้งหมด"
                    icon={<Repeat className="w-4 h-4" />}
                    searchThreshold={99}
                  />
                </div>
                {/* Created by */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">ผู้เปิดบิล</label>
                  {createdByDropdownOptions.length > 0 ? (
                    <SearchableDropdown
                      value={createdByFilter}
                      onChange={setCreatedByFilter}
                      options={createdByDropdownOptions}
                      placeholder="ทั้งหมด"
                      searchPlaceholder="ค้นหาชื่อ..."
                      defaultIcon={<User className="w-4 h-4" />}
                    />
                  ) : (
                    <FormSelect value="" onChange={() => {}} options={[]} placeholder="ทั้งหมด" disabled icon={<User className="w-4 h-4" />} searchThreshold={99} />
                  )}
                </div>
                {/* Delivery date */}
                {features.delivery_date.enabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">วันที่ส่ง</label>
                    <DateRangePicker
                      value={deliveryDateRange}
                      onChange={(val) => setDeliveryDateRange(val)}
                      placeholder="ทั้งหมด"
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                {(paymentFilter !== 'all' || createdByFilter !== 'all' || orderTypeFilter !== 'all' || deliveryDateRange?.startDate) ? (
                  <button
                    type="button"
                    onClick={() => { setPaymentFilter('all'); setCreatedByFilter('all'); setOrderTypeFilter('all'); setDeliveryDateRange({ startDate: null, endDate: null }); }}
                    className="text-sm text-gray-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    ล้างตัวกรอง
                  </button>
                ) : <div />}
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilter(false)}
                  className="px-4 py-2 bg-[#F4511E] text-white text-sm font-medium rounded-lg hover:bg-[#D63B0E] transition-colors"
                >
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
          </div>
        ) : (
        <>
          {/* Sort bar + count (hidden for processing tab — it has own pagination) */}
          {statusFilter !== 'processing' && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {totalOrders > 0 ? `${startIndex + 1}-${endIndex} จาก ${totalOrders} รายการ` : 'ไม่พบรายการ'}
              </p>
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSortDropdown(!showSortDropdown); }}
                  className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
                >
                  {SORT_OPTIONS.find(o => o.value === sortValue)?.label || 'เรียงตาม'}
                  <ChevronDown className="w-4 h-4" />
                </button>
                {showSortDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20 min-w-[140px]">
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setSortValue(opt.value); setShowSortDropdown(false); setCurrentPage(1); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                          sortValue === opt.value ? 'text-[#F4511E] font-medium' : 'text-gray-700 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order list — tab-specific or default */}
          {renderOrderList()}

          {/* Pagination (hidden for processing & ready_to_ship tabs — they have own pagination) */}
          {statusFilter !== 'processing' && statusFilter !== 'ready_to_ship' && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalOrders}
              startIdx={startIndex}
              endIdx={endIndex}
              recordsPerPage={recordsPerPage}
              setRecordsPerPage={setRecordsPerPage}
              setPage={setCurrentPage}
            />
          )}
        </>
        )}

        {/* Status Update Modal (order status only) */}
        {statusUpdateModal.show && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
          >
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  ยืนยันการเปลี่ยนสถานะคำสั่งซื้อ
                </h3>
                <button
                  onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-gray-700 dark:text-slate-300">
                  คำสั่งซื้อ: <span className="font-medium">{statusUpdateModal.order?.order_number}</span>
                </p>
                <p className="text-gray-700 dark:text-slate-300">
                  ลูกค้า: <span className="font-medium">{statusUpdateModal.order?.customer_name || statusUpdateModal.order?.delivery_name}</span>
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 dark:text-slate-400">เปลี่ยนจาก:</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_CONFIG[statusUpdateModal.order?.order_status || '']?.bg || ''} ${ORDER_STATUS_CONFIG[statusUpdateModal.order?.order_status || '']?.color || ''}`}>
                    {ORDER_STATUS_CONFIG[statusUpdateModal.order?.order_status || '']?.label || ''}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_CONFIG[statusUpdateModal.nextStatus]?.bg || ''} ${ORDER_STATUS_CONFIG[statusUpdateModal.nextStatus]?.color || ''}`}>
                    {ORDER_STATUS_CONFIG[statusUpdateModal.nextStatus]?.label || ''}
                  </span>
                </div>

                {/* Shipping Details Form (processing → shipping) */}
                {statusUpdateModal.nextStatus === 'shipping' && (
                  <div className="mt-6 pt-6 border-t dark:border-slate-700 space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-white">ข้อมูลจัดส่ง</h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">ขนส่ง</label>
                      <FormSelect
                        value={shippingDetails.carrier}
                        onChange={(val) => setShippingDetails({ ...shippingDetails, carrier: val })}
                        options={SHIPPING_CARRIERS.map(c => ({ id: c.value, label: c.label }))}
                        placeholder="-- เลือกขนส่ง --"
                        searchThreshold={99}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">เลขพัสดุ</label>
                      <input
                        type="text"
                        value={shippingDetails.trackingNumber}
                        onChange={(e) => setShippingDetails({ ...shippingDetails, trackingNumber: e.target.value })}
                        placeholder="กรอกเลขพัสดุ (ไม่บังคับ)"
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
                  disabled={updatingStatus}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmStatusUpdate}
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {updatingStatus ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <span>ยืนยัน</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

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
            onClose={() => setTaxInvoiceModal(null)}
            onSaved={async (updatedOrder) => {
              setTaxInvoiceModal(null);
              try {
                const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
                const orderData = await fetchOrderForPdf(updatedOrder.id as string);
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
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-fade-in">
          <CheckCircle className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
          onClick={() => setLightboxImage(null)}
          role="dialog"
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Product"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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
