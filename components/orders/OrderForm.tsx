'use client';

import { useState, useEffect, useRef, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { useCompany } from '@/lib/company-context';
import { apiFetch } from '@/lib/api-client';
import { parseThaiAddress } from '@/lib/address-parser';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import ItemsTable, { type TableItem as OrderTableItem } from '@/components/ui/ItemsTable';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import FormSelect from '@/components/ui/FormSelect';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import { isMarketplaceSource } from '@/lib/marketplace/types';
import {
  Plus,
  Loader2,
  MapPin,
  X,
  Save,
  Copy,
  ChevronDown,
  CheckCircle,
  Send,
  Warehouse,
  Settings,
  Clock
} from 'lucide-react';

// Interfaces
interface Customer {
  id: string;
  customer_code: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
}

interface ShippingAddress {
  id: string;
  address_name: string;
  contact_person?: string;
  phone?: string;
  address_line1: string;
  district?: string;
  amphoe?: string;
  province: string;
  postal_code?: string;
  is_default: boolean;
  created_at: string;
}

interface Product {
  id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string;
  variation_label?: string;
  product_type: 'simple' | 'variation';
  sku?: string;
  default_price: number;
  discount_price?: number;
  stock: number;
}

interface BranchProduct {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label?: string;
  product_type?: 'simple' | 'variation';
  sku?: string;
  image?: string;
  quantity: number;
  unit_price: number;
  discount_value: number;
  discount_type: 'percent' | 'amount';
}

interface BranchOrder {
  shipping_address_id: string;
  address_name: string;
  delivery_notes: string;
  shipping_fee: number;
  products: BranchProduct[];
}

interface InitialOrderData {
  customer_id: string;
  delivery_date?: string;
  notes?: string;
  internal_notes?: string;
  discount_amount?: number;
  branches: BranchOrder[];
}

interface OrderFormProps {
  // Pre-selected customer (e.g., from LINE Chat)
  preselectedCustomerId?: string;
  // Initial order data for copying from previous order
  initialOrderData?: InitialOrderData;
  // Edit existing order by ID
  editOrderId?: string;
  // Pre-loaded order data from parent to avoid duplicate fetch
  preloadedOrder?: any;
  // Callback when order is created/updated successfully
  onSuccess?: (orderId: string, customerId?: string, deliveryInfo?: { name?: string; phone?: string; email?: string }) => void;
  // Callback when cancelled
  onCancel?: () => void;
  // Embedded mode (no back button, different styling)
  embedded?: boolean;
  // Callback to send bill to customer via LINE Chat (only from LINE Chat new order)
  onSendBillToChat?: (orderId: string, orderNumber: string, billUrl: string) => void;
  // Print mode: 'order' = order slip, 'packing' = packing list, null = normal view
  printMode?: 'order' | 'packing' | null;
  // Portal target for warehouse picker (renders into parent header)
  warehousePortalRef?: RefObject<HTMLDivElement | null>;
  // Portal target for header actions (copy order button)
  headerActionsRef?: RefObject<HTMLDivElement | null>;
  // Order source (e.g., 'line', 'facebook') and channel name
  source?: string;
  sourceName?: string;
  // Exchange data — items to return from original order (CN created atomically on save)
  exchangeData?: {
    from_order_id: string;
    items: { order_item_id: string; quantity: number }[];
    reason: string;
  };
  // Credit amount from returned items (for displaying price difference)
  exchangeCreditAmount?: number;
}

export default function OrderForm({
  preselectedCustomerId,
  initialOrderData,
  editOrderId,
  preloadedOrder,
  onSuccess,
  onCancel,
  embedded = false,
  onSendBillToChat,
  printMode = null,
  warehousePortalRef,
  headerActionsRef,
  source,
  sourceName,
  exchangeData,
  exchangeCreditAmount,
}: OrderFormProps) {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features, billExpiryDays } = useFeatures();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;

  // State
  const [loading, setLoading] = useState(!!editOrderId);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addressConflict, setAddressConflict] = useState<{ mode: 'update' | 'new' | null; addressName: string } | null>(null);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedOrderId, setSavedOrderId] = useState('');
  const [savedOrderNumber, setSavedOrderNumber] = useState('');
  const [billLinkCopied, setBillLinkCopied] = useState(false);

  // Edit mode
  const [editOrderNumber, setEditOrderNumber] = useState('');
  const [editOrderStatus, setEditOrderStatus] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [editOrderSource, setEditOrderSource] = useState('manual');
  const [storedExchangeCredit, setStoredExchangeCredit] = useState(0);
  const isEditMode = !!editOrderId;
  const isReadOnly = isEditMode && (editOrderSource === 'shopee' || editOrderStatus !== 'new' || editPaymentStatus !== 'pending');

  // Customer selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

  // Shipping addresses
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([]);

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Customer pricing
  const [customerPrices, setCustomerPrices] = useState<Record<string, { unit_price: number; discount_percent: number }>>({});

  // Branch Orders (single branch, kept for API compatibility)
  const [branchOrders, setBranchOrders] = useState<BranchOrder[]>([]);

  // Order details
  const [deliveryDateValue, setDeliveryDateValue] = useState<DateValueType>({
    startDate: null,
    endDate: null,
  });
  const deliveryDate = deliveryDateValue?.startDate
    ? new Date(deliveryDateValue.startDate).toISOString().split('T')[0]
    : '';
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('amount');
  const [taxInvoiceRequested, setTaxInvoiceRequested] = useState(false);
  const [taxName, setTaxName] = useState('');
  const [taxTaxId, setTaxTaxId] = useState('');
  const [taxBranch, setTaxBranch] = useState('สำนักงานใหญ่');
  const [taxAddress, setTaxAddress] = useState('');

  // Bill expiry advance settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [expiryMode, setExpiryMode] = useState<'default' | 'custom' | 'none'>('default');
  const [customExpiryDays, setCustomExpiryDays] = useState(7);

  // Delivery info (for new customer / no customer / selected address)
  const [deliveryName, setDeliveryName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDistrict, setDeliveryDistrict] = useState('');
  const [deliveryAmphoe, setDeliveryAmphoe] = useState('');
  const [deliveryProvince, setDeliveryProvince] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryEmail, setDeliveryEmail] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');

  // Stock & Warehouse
  const [stockEnabled, setStockEnabled] = useState(false);
  const [allowOversell, setAllowOversell] = useState(true);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string; is_default: boolean }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [inventoryMap, setInventoryMap] = useState<Record<string, { quantity: number; reserved_quantity: number; available: number }>>({});


  // Copy from latest order
  const [loadingLatestOrder, setLoadingLatestOrder] = useState(false);

  // Refs
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const deliveryDateRef = useRef<HTMLDivElement>(null);
  const productsSectionRef = useRef<HTMLDivElement>(null);
  const deliverySectionRef = useRef<HTMLDivElement>(null);
  const summarySectionRef = useRef<HTMLDivElement>(null);
  const [wideEnough, setWideEnough] = useState(false);
  const [summaryWide, setSummaryWide] = useState(false);

  // Watch container width for responsive 2-column layout
  useEffect(() => {
    const el = deliverySectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWideEnough(entry.contentRect.width >= 480);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // Watch summary section width for side-by-side vs stacked layout
  const hasProducts = branchOrders.length > 0 && branchOrders[0]?.products.length > 0;
  useEffect(() => {
    const el = summarySectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSummaryWide(entry.contentRect.width >= 560);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasProducts]);

  // Initialize default branch (product-first flow for all modes)
  // This allows product section to show immediately without selecting a customer
  useEffect(() => {
    if (!isEditMode && !initialOrderData && branchOrders.length === 0) {
      setBranchOrders([{
        shipping_address_id: '',
        address_name: 'รายการสินค้า',
        delivery_notes: '',
        shipping_fee: 0,
        products: [],
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch customers, products, and warehouse config (once)
  // For marketplace orders (edit mode), skip customers/products — they're read-only
  useFetchOnce(() => {
    const isMarketplace = isMarketplaceSource(preloadedOrder?.source);
    if (!isMarketplace) {
      fetchCustomers();
      fetchProducts();
    } else {
      setLoadingProducts(false);
    }
    fetchWarehouses();
  }, !authLoading && !!userProfile);

  // Auto-select preselected customer
  useEffect(() => {
    if (preselectedCustomerId && customers.length > 0 && !selectedCustomer) {
      const customer = customers.find(c => c.id === preselectedCustomerId);
      if (customer) {
        handleSelectCustomer(customer);
      }
    }
  }, [preselectedCustomerId, customers]);

  // Initialize from copied order data
  const initialDataApplied = useRef(false);
  useEffect(() => {
    if (!initialOrderData || initialDataApplied.current) return;
    // Don't apply if no meaningful data (branches empty = data not ready yet)
    if (initialOrderData.branches.length === 0 && !initialOrderData.customer_id) return;
    // Wait for customers/products to load (only if we have a customer to match)
    if (initialOrderData.customer_id && customers.length === 0) return;
    if (initialOrderData.branches.some(b => b.products.length > 0) && products.length === 0) return;

    initialDataApplied.current = true;

    // Set customer if available
    if (initialOrderData.customer_id) {
      const customer = customers.find(c => c.id === initialOrderData.customer_id);
      if (customer) {
        setSelectedCustomer(customer);
        setCustomerSearch(customer.name);
        // Fetch addresses and auto-select default
        (async () => {
          try {
            const addrResponse = await apiFetch(`/api/shipping-addresses?customer_id=${customer.id}`);
            if (addrResponse.ok) {
              const addrResult = await addrResponse.json();
              const addresses = addrResult.addresses || [];
              setShippingAddresses(addresses);
              if (addresses.length > 0) {
                const defaultAddr = addresses.find((a: ShippingAddress) => a.is_default) || addresses[0];
                setSelectedAddressId(defaultAddr.id);
                setDeliveryName(defaultAddr.contact_person || customer.name);
                setDeliveryPhone(defaultAddr.phone || customer.phone || '');
                setDeliveryEmail(customer.email || '');
                setDeliveryAddress(defaultAddr.address_line1 || '');
                setDeliveryDistrict(defaultAddr.district || '');
                setDeliveryAmphoe(defaultAddr.amphoe || '');
                setDeliveryProvince(defaultAddr.province || '');
                setDeliveryPostalCode(defaultAddr.postal_code || '');
              }
            }
          } catch (error) {
            console.error('Error fetching shipping addresses:', error);
          }
          try {
            const response = await apiFetch(`/api/customer-prices?customer_id=${customer.id}`);
            if (response.ok) {
              const result = await response.json();
              setCustomerPrices(result.prices || {});
            }
          } catch (error) {
            console.error('Error fetching customer prices:', error);
          }
        })();
        // Pre-fill tax invoice fields
        (async () => {
          try {
            const res = await apiFetch(`/api/customers/${customer.id}`);
            if (res.ok) {
              const data = await res.json();
              const c = data.customer || data;
              if (c.tax_company_name) setTaxName(c.tax_company_name);
              if (c.tax_id) setTaxTaxId(c.tax_id);
              if (c.tax_branch) setTaxBranch(c.tax_branch);
              const addrParts = [c.billing_address, c.billing_district, c.billing_amphoe, c.billing_province, c.billing_postal_code].filter(Boolean).join(' ');
              if (addrParts) setTaxAddress(addrParts);
            }
          } catch {
            // Ignore tax pre-fill errors
          }
        })();
      }
    }

    // Set products from initial data (flatten all branches into one, enrich with product images)
    if (initialOrderData.branches.length > 0) {
      const allProducts = initialOrderData.branches.flatMap(branch =>
        branch.products.map(p => {
          const match = products.find(pr => pr.id === p.variation_id);
          return { ...p, image: match?.image || p.image };
        })
      );
      const firstBranch = initialOrderData.branches[0];
      setBranchOrders([{
        shipping_address_id: firstBranch.shipping_address_id || '',
        address_name: 'รายการสินค้า',
        delivery_notes: firstBranch.delivery_notes || '',
        shipping_fee: initialOrderData.branches.reduce((sum, b) => sum + (b.shipping_fee || 0), 0),
        products: allProducts,
      }]);
    } else if (branchOrders.length === 0) {
      // Exchange or customer-only init: create default empty branch so product section shows
      setBranchOrders([{
        shipping_address_id: '',
        address_name: 'รายการสินค้า',
        delivery_notes: '',
        shipping_fee: 0,
        products: [],
      }]);
    }

    // Set other fields
    if (initialOrderData.delivery_date) {
      setDeliveryDateValue({
        startDate: new Date(initialOrderData.delivery_date),
        endDate: new Date(initialOrderData.delivery_date)
      });
    }
    if (initialOrderData.notes) setNotes(initialOrderData.notes);
    if (initialOrderData.internal_notes) setInternalNotes(initialOrderData.internal_notes);
    if (initialOrderData.discount_amount) setOrderDiscount(initialOrderData.discount_amount);
  }, [initialOrderData, customers, products]);

  // Load existing order for editing
  useEffect(() => {
    if (!editOrderId || authLoading || !userProfile) return;

    const loadOrder = async () => {
      try {
        setLoading(true);

        // Use preloaded order data if available (avoids duplicate fetch)
        let order;
        if (preloadedOrder) {
          order = preloadedOrder;
        } else {
          const response = await apiFetch(`/api/orders?id=${editOrderId}`);
          if (!response.ok) throw new Error('Failed to fetch order');
          const result = await response.json();
          order = result.order;
        }
        if (!order) throw new Error('Order not found');

        setEditOrderNumber(order.order_number);
        setEditOrderStatus(order.order_status);
        setEditPaymentStatus(order.payment_status || 'pending');
        setEditOrderSource(order.source || 'manual');

        // Set customer
        if (order.customer) {
          setSelectedCustomer(order.customer);
          setCustomerSearch(order.customer.name);
        }

        // Set delivery date
        if (order.delivery_date) {
          setDeliveryDateValue({
            startDate: new Date(order.delivery_date),
            endDate: new Date(order.delivery_date)
          });
        }

        // Set delivery info
        if (order.delivery_name) setDeliveryName(order.delivery_name);
        if (order.delivery_phone) setDeliveryPhone(order.delivery_phone);
        if (order.delivery_address) setDeliveryAddress(order.delivery_address);
        if (order.delivery_district) setDeliveryDistrict(order.delivery_district);
        if (order.delivery_amphoe) setDeliveryAmphoe(order.delivery_amphoe);
        if (order.delivery_province) setDeliveryProvince(order.delivery_province);
        if (order.delivery_postal_code) setDeliveryPostalCode(order.delivery_postal_code);
        if (order.delivery_email) setDeliveryEmail(order.delivery_email);
        if (order.shipping_address_id) setSelectedAddressId(order.shipping_address_id);

        // Set notes and discount
        if (order.notes) setNotes(order.notes);
        if (order.internal_notes) setInternalNotes(order.internal_notes);
        if (order.discount_amount) setOrderDiscount(order.discount_amount);
        if (order.order_discount_type) setOrderDiscountType(order.order_discount_type);
        if (order.exchange_credit) setStoredExchangeCredit(Number(order.exchange_credit));

        if (order.tax_invoice_requested) {
          setTaxInvoiceRequested(true);
          if (order.tax_invoice_name) setTaxName(order.tax_invoice_name);
          if (order.tax_invoice_tax_id) setTaxTaxId(order.tax_invoice_tax_id);
          if (order.tax_invoice_branch) setTaxBranch(order.tax_invoice_branch);
          if (order.tax_invoice_address) setTaxAddress(order.tax_invoice_address);
        }

        // For marketplace orders, skip unnecessary fetches (read-only)
        const isMarketplace = isMarketplaceSource(order.source);

        if (order.customer?.id && !isMarketplace) {
          const addrResponse = await apiFetch(`/api/shipping-addresses?customer_id=${order.customer.id}`);
          if (addrResponse.ok) {
            const addrResult = await addrResponse.json();
            setShippingAddresses(addrResult.addresses || []);
          }

          // Fetch customer prices (only for manual orders)
          const priceResponse = await apiFetch(`/api/customer-prices?customer_id=${order.customer.id}`);
          if (priceResponse.ok) {
            const priceResult = await priceResponse.json();
            setCustomerPrices(priceResult.prices || {});
          }
        }

        // Fetch products (only for manual orders — needed for product search)
        if (!isMarketplace) {
          await fetchProducts();
        }

        // Convert order items to single branch
        const loadedProducts: BranchProduct[] = [];
        let loadedShippingFee = 0;

        for (const item of order.items || []) {
          const shipments = item.shipments || [];
          const qty = shipments.length > 0 ? shipments[0].quantity : item.quantity;
          if (shipments.length > 0 && loadedShippingFee === 0) {
            loadedShippingFee = shipments[0].shipping_fee || 0;
          }
          if (!loadedProducts.find(p => p.variation_id === item.variation_id)) {
            loadedProducts.push({
              variation_id: item.variation_id,
              product_id: item.product_id,
              product_code: item.product_code,
              product_name: item.product_name,
              variation_label: item.variation_label,
              image: item.image,
              quantity: qty,
              unit_price: item.unit_price,
              discount_value: item.discount_type === 'amount' ? (item.discount_amount || 0) : (item.discount_percent || 0),
              discount_type: item.discount_type || 'percent'
            });
          }
        }

        setBranchOrders([{
          shipping_address_id: order.shipping_address_id || '',
          address_name: 'รายการสินค้า',
          delivery_notes: '',
          shipping_fee: loadedShippingFee,
          products: loadedProducts,
        }]);
      } catch (error) {
        console.error('Error loading order:', error);
        showToast('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [editOrderId, authLoading, userProfile]);

  const fetchCustomers = async () => {
    try {
      const response = await apiFetch('/api/customers?active=true');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to fetch customers');

      const sortedCustomers = (result.customers || [])
        .filter((c: Customer & { is_active?: boolean }) => c.is_active !== false)
        .sort((a: Customer, b: Customer) => a.name.localeCompare(b.name));
      setCustomers(sortedCustomers);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true);
      const productsResponse = await apiFetch('/api/products');

      if (!productsResponse.ok) throw new Error('Failed to fetch products');

      const result = await productsResponse.json();
      const fetchedProducts = result.products || [];

      const flatProducts: Product[] = [];
      fetchedProducts.forEach((sp: any) => {
        if (sp.product_type === 'simple') {
          const variation_id = sp.variations && sp.variations.length > 0 ? sp.variations[0].variation_id : null;
          flatProducts.push({
            id: variation_id || sp.product_id,
            product_id: sp.product_id,
            code: sp.code,
            name: sp.name,
            image: sp.main_image_url || sp.image,
            variation_label: sp.simple_variation_label,
            product_type: 'simple',
            sku: sp.simple_sku,
            default_price: sp.simple_default_price || 0,
            discount_price: sp.simple_discount_price || 0,
            stock: sp.simple_stock || 0
          });
        } else {
          (sp.variations || []).forEach((v: any) => {
            flatProducts.push({
              id: v.variation_id,
              product_id: sp.product_id,
              code: `${sp.code}-${v.variation_label}`,
              name: sp.name,
              image: v.image_url || sp.main_image_url || sp.image,
              variation_label: v.variation_label,
              product_type: 'variation',
              sku: v.sku,
              default_price: v.default_price || 0,
              discount_price: v.discount_price || 0,
              stock: v.stock || 0
            });
          });
        }
      });
      setProducts(flatProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await apiFetch('/api/warehouses');
      if (!response.ok) return;
      const result = await response.json();
      const { warehouses: wh, stockConfig } = result;
      if (stockConfig?.stockEnabled) {
        setStockEnabled(true);
        setAllowOversell(stockConfig.allowOversell !== false);
        setWarehouses(wh || []);
        const defaultWh = (wh || []).find((w: any) => w.is_default);
        if (defaultWh && !selectedWarehouseId) {
          setSelectedWarehouseId(defaultWh.id);
          fetchInventoryForWarehouse(defaultWh.id);
        }
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const fetchInventoryForWarehouse = async (warehouseId: string) => {
    if (!warehouseId) return;
    try {
      const response = await apiFetch(`/api/inventory?warehouse_id=${warehouseId}&limit=9999`);
      if (!response.ok) return;
      const result = await response.json();
      const map: Record<string, { quantity: number; reserved_quantity: number; available: number }> = {};
      for (const item of result.items || []) {
        map[item.variation_id] = {
          quantity: item.quantity,
          reserved_quantity: item.reserved_quantity,
          available: item.available,
        };
      }
      setInventoryMap(map);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setShippingAddresses([]);
    // Reset delivery info — will be filled when user picks an address
    setDeliveryName('');
    setDeliveryPhone('');
    setDeliveryAddress('');
    setDeliveryDistrict('');
    setDeliveryAmphoe('');
    setDeliveryProvince('');
    setDeliveryPostalCode('');
    setDeliveryEmail('');
    setSelectedAddressId('');

    // Keep existing products, just reset shipping address
    const existingShippingFee = branchOrders[0]?.shipping_fee || 0;
    setBranchOrders([{
      ...branchOrders[0],
      shipping_address_id: '',
      shipping_fee: existingShippingFee,
    }]);

    // Fetch shipping addresses
    try {
      const addrResponse = await apiFetch(`/api/shipping-addresses?customer_id=${customer.id}`);
      if (addrResponse.ok) {
        const addrResult = await addrResponse.json();
        const addresses = addrResult.addresses || [];
        setShippingAddresses(addresses);
        if (addresses.length > 0) {
          const defaultAddr = addresses.find((a: ShippingAddress) => a.is_default) || addresses[0];
          setSelectedAddressId(defaultAddr.id);
          setDeliveryName(defaultAddr.contact_person || customer.name);
          setDeliveryPhone(defaultAddr.phone || customer.phone || '');
          setDeliveryEmail(customer.email || '');
          setDeliveryAddress(defaultAddr.address_line1 || '');
          setDeliveryDistrict(defaultAddr.district || '');
          setDeliveryAmphoe(defaultAddr.amphoe || '');
          setDeliveryProvince(defaultAddr.province || '');
          setDeliveryPostalCode(defaultAddr.postal_code || '');
        }
      }
    } catch (error) {
      console.error('Error fetching shipping addresses:', error);
    }

    try {
      const response = await apiFetch(`/api/customer-prices?customer_id=${customer.id}`);
      if (response.ok) {
        const result = await response.json();
        setCustomerPrices(result.prices || {});
      }
    } catch (error) {
      console.error('Error fetching customer prices:', error);
    }

    // Pre-fill tax invoice fields from customer
    try {
      const res = await apiFetch(`/api/customers/${customer.id}`);
      if (res.ok) {
        const data = await res.json();
        const c = data.customer || data;
        if (c.tax_company_name) setTaxName(c.tax_company_name);
        if (c.tax_id) setTaxTaxId(c.tax_id);
        if (c.tax_branch) setTaxBranch(c.tax_branch);
        const addrParts = [c.billing_address, c.billing_district, c.billing_amphoe, c.billing_province, c.billing_postal_code].filter(Boolean).join(' ');
        if (addrParts) setTaxAddress(addrParts);
      }
    } catch {
      // Ignore tax pre-fill errors
    }
  };

  // Copy from latest order
  const handleCopyLatestOrder = async () => {
    if (!selectedCustomer) return;

    try {
      setLoadingLatestOrder(true);
      // Fetch latest order for this customer
      const response = await apiFetch(`/api/orders?customer_id=${selectedCustomer.id}&limit=1`);

      if (!response.ok) throw new Error('Failed to fetch orders');

      const result = await response.json();
      const orders = result.orders || [];

      if (orders.length === 0) {
        showToast('ลูกค้านี้ยังไม่มีคำสั่งซื้อเก่า', 'error');
        return;
      }

      const latestOrder = orders[0];

      // Fetch full order details
      const detailResponse = await apiFetch(`/api/orders?id=${latestOrder.id}`);

      if (!detailResponse.ok) throw new Error('Failed to fetch order details');

      const detailResult = await detailResponse.json();
      const order = detailResult.order;

      if (!order) throw new Error('Order not found');

      // Flatten all items into single branch
      const copiedProducts: BranchProduct[] = [];
      let copiedShippingFee = 0;

      for (const item of order.items || []) {
        const shipments = item.shipments || [];
        const qty = shipments.length > 0 ? shipments[0].quantity : item.quantity;
        if (shipments.length > 0 && copiedShippingFee === 0) {
          copiedShippingFee = shipments[0].shipping_fee || 0;
        }
        if (!copiedProducts.find(p => p.variation_id === item.variation_id)) {
          copiedProducts.push({
            variation_id: item.variation_id,
            product_id: item.product_id,
            product_code: item.product_code,
            product_name: item.product_name,
            variation_label: item.variation_label,
            image: item.image,
            quantity: qty,
            unit_price: item.unit_price,
            discount_value: item.discount_type === 'amount' ? (item.discount_amount || 0) : (item.discount_percent || 0),
            discount_type: item.discount_type || 'percent'
          });
        }
      }

      if (copiedProducts.length === 0) {
        showToast('ไม่พบข้อมูลสินค้าใน Order เก่า', 'error');
        return;
      }

      setBranchOrders([{
        shipping_address_id: '',
        address_name: 'รายการสินค้า',
        delivery_notes: '',
        shipping_fee: copiedShippingFee,
        products: copiedProducts,
      }]);

      // Copy delivery info
      if (order.delivery_name) setDeliveryName(order.delivery_name);
      if (order.delivery_phone) setDeliveryPhone(order.delivery_phone);
      if (order.delivery_address) setDeliveryAddress(order.delivery_address);
      if (order.delivery_district) setDeliveryDistrict(order.delivery_district);
      if (order.delivery_amphoe) setDeliveryAmphoe(order.delivery_amphoe);
      if (order.delivery_province) setDeliveryProvince(order.delivery_province);
      if (order.delivery_postal_code) setDeliveryPostalCode(order.delivery_postal_code);
      if (order.delivery_email) setDeliveryEmail(order.delivery_email);
      if (order.shipping_address_id) setSelectedAddressId(order.shipping_address_id);

      // Set other fields
      if (order.notes) setNotes(order.notes);
      if (order.internal_notes) setInternalNotes(order.internal_notes);
      if (order.discount_amount) setOrderDiscount(order.discount_amount);
      if (order.order_discount_type) setOrderDiscountType(order.order_discount_type);

      showToast(`คัดลอกจาก ${latestOrder.order_number} สำเร็จ`);

    } catch (error) {
      console.error('Error copying order:', error);
      showToast('ไม่สามารถคัดลอกคำสั่งซื้อได้', 'error');
    } finally {
      setLoadingLatestOrder(false);
    }
  };

  // Product management
  const handleAddProductToBranch = (product: Product) => {
    // Stock validation when oversell is not allowed
    if (!allowOversell && stockEnabled && selectedWarehouseId) {
      const inv = inventoryMap[product.id];
      const available = inv ? inv.available : 0;
      const currentQty = branchOrders[0]?.products.filter(p => p.variation_id === product.id).reduce((s, p) => s + p.quantity, 0) || 0;

      if (available <= 0 || currentQty >= available) {
        showToast('สินค้านี้ stock หมด ไม่สามารถเพิ่มได้', 'error');
        return;
      }
    }

    const existingProductIndex = branchOrders[0]?.products.findIndex(
      p => p.variation_id === product.id
    ) ?? -1;

    const newBranchOrders = [...branchOrders];

    if (existingProductIndex !== -1) {
      // Duplicate → increment quantity (barcode scan behavior)
      if (!allowOversell && stockEnabled && selectedWarehouseId) {
        const inv = inventoryMap[product.id];
        const available = inv ? inv.available : 0;
        const currentQty = branchOrders[0]?.products.filter(p => p.variation_id === product.id).reduce((s, p) => s + p.quantity, 0) || 0;
        if (currentQty >= available) {
          showToast(`สินค้านี้เหลือ stock ${available} ไม่สามารถเพิ่มได้อีก`, 'error');
          return;
        }
      }
      newBranchOrders[0].products[existingProductIndex].quantity += 1;
      setBranchOrders(newBranchOrders);
    } else {
      let unit_price = 0;
      let discount_value = 0;
      const customerLastPrice = customerPrices[product.id];
      if (customerLastPrice) {
        unit_price = customerLastPrice.unit_price;
        discount_value = customerLastPrice.discount_percent;
      } else if (product.discount_price && product.discount_price > 0) {
        unit_price = product.discount_price;
      } else {
        unit_price = product.default_price;
      }

      const newProduct: BranchProduct = {
        variation_id: product.id,
        product_id: product.product_id,
        product_code: product.code,
        product_name: product.name,
        variation_label: product.variation_label,
        product_type: product.product_type,
        sku: product.sku,
        image: product.image,
        quantity: 1,
        unit_price,
        discount_value,
        discount_type: 'percent'
      };

      newBranchOrders[0].products.push(newProduct);
      setBranchOrders(newBranchOrders);
    }
  };

  const handleRemoveProduct = (productIndex: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[0].products = newBranchOrders[0].products.filter((_, i) => i !== productIndex);
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductQuantity = (productIndex: number, quantity: number) => {
    let finalQty = Math.max(1, quantity);

    if (!allowOversell && stockEnabled && selectedWarehouseId) {
      const variationId = branchOrders[0].products[productIndex].variation_id;
      const inv = inventoryMap[variationId];
      const available = inv ? inv.available : 0;
      const otherQty = branchOrders[0].products.reduce((s, p, pi) =>
        pi === productIndex ? s : (p.variation_id === variationId ? s + p.quantity : s), 0);
      const maxAllowed = Math.max(1, available - otherQty);
      if (finalQty > maxAllowed) {
        finalQty = maxAllowed;
        showToast(`stock เหลือ ${available} จำกัดจำนวนที่ ${maxAllowed}`, 'error');
      }
    }

    const newBranchOrders = [...branchOrders];
    newBranchOrders[0].products[productIndex].quantity = finalQty;
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductPrice = (productIndex: number, price: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[0].products[productIndex].unit_price = Math.max(0, price);
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductDiscount = (productIndex: number, value: number) => {
    const newBranchOrders = [...branchOrders];
    const product = newBranchOrders[0].products[productIndex];
    if (product.discount_type === 'percent') {
      product.discount_value = Math.max(0, Math.min(100, value));
    } else {
      product.discount_value = Math.max(0, value);
    }
    setBranchOrders(newBranchOrders);
  };

  const handleToggleProductDiscountType = (productIndex: number) => {
    const newBranchOrders = [...branchOrders];
    const product = newBranchOrders[0].products[productIndex];
    product.discount_type = product.discount_type === 'percent' ? 'amount' : 'percent';
    product.discount_value = 0;
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateShippingFee = (fee: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[0].shipping_fee = Math.max(0, fee);
    setBranchOrders(newBranchOrders);
  };

  // Calculate totals
  const calculateProductSubtotal = (product: BranchProduct) => product.quantity * product.unit_price;
  const calculateProductDiscount = (product: BranchProduct) => {
    if (product.discount_type === 'percent') {
      return calculateProductSubtotal(product) * (product.discount_value / 100);
    }
    return product.discount_value;
  };
  const calculateProductTotal = (product: BranchProduct) => calculateProductSubtotal(product) - calculateProductDiscount(product);
  const calculateBranchTotal = (branch: BranchOrder) => branch.products.reduce((sum, p) => sum + calculateProductTotal(p), 0);

  const itemsTotal = branchOrders.reduce((sum, branch) => sum + calculateBranchTotal(branch), 0);
  const totalShippingFee = branchOrders.reduce((sum, branch) => sum + (branch.shipping_fee || 0), 0);
  const calculateOrderDiscount = () => {
    if (orderDiscountType === 'percent') {
      return itemsTotal * (orderDiscount / 100);
    }
    return orderDiscount;
  };
  const totalWithVAT = itemsTotal - calculateOrderDiscount() + totalShippingFee;
  const subtotal = vatRegistered ? Math.round((totalWithVAT / 1.07) * 100) / 100 : totalWithVAT;
  const vat = vatRegistered ? totalWithVAT - subtotal : 0;
  const total = totalWithVAT;

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Inline validation
    const errors: Record<string, string> = {};
    // Customer is optional for all modes
    if (features.delivery_date.enabled && features.delivery_date.required && !deliveryDate) {
      errors.deliveryDate = 'กรุณาเลือกวันที่ส่งของ';
    }
    if (deliveryPhone.trim() && !/^(0[0-9]{8,9}|[0-9]{9,10})$/.test(deliveryPhone.trim())) {
      errors.deliveryPhone = 'เบอร์โทรไม่ถูกต้อง';
    }
    if (deliveryEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryEmail.trim())) {
      errors.deliveryEmail = 'อีเมลไม่ถูกต้อง';
    }
    // Check that at least one product exists
    if (branchOrders.length === 0 || !branchOrders[0]?.products.length) {
      errors.branches = 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      // Scroll to first error
      if (errors.customer) {
        customerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (errors.deliveryDate) {
        deliveryDateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (errors.branches) {
        productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Check if delivery address differs from selected shipping_address (non-edit, has customer)
    if (!isEditMode && selectedCustomer && selectedAddressId && selectedAddressId !== 'new') {
      const selectedAddr = shippingAddresses.find(a => a.id === selectedAddressId);
      if (selectedAddr) {
        const differs = (
          (deliveryAddress || '') !== (selectedAddr.address_line1 || '') ||
          (deliveryDistrict || '') !== (selectedAddr.district || '') ||
          (deliveryAmphoe || '') !== (selectedAddr.amphoe || '') ||
          (deliveryProvince || '') !== (selectedAddr.province || '') ||
          (deliveryPostalCode || '') !== (selectedAddr.postal_code || '')
        );
        if (differs && deliveryAddress.trim()) {
          setAddressConflict({ mode: null, addressName: selectedAddr.address_name });
          return; // Wait for user choice
        }
      }
    }

    doSave('auto');
  };

  const doSave = async (addressAction: 'update' | 'new' | 'auto') => {
    try {
      setSaving(true);
      setAddressConflict(null);

      const branch = branchOrders[0];
      const addrId = selectedAddressId && selectedAddressId !== 'new' ? selectedAddressId : branch?.shipping_address_id;

      const items = (branch?.products || []).map(product => ({
        variation_id: product.variation_id,
        product_id: product.product_id,
        product_code: product.product_code,
        product_name: product.product_name,
        variation_label: product.variation_label,
        quantity: product.quantity,
        unit_price: product.unit_price,
        discount_value: product.discount_value,
        discount_type: product.discount_type,
        // Only include shipments when customer is selected AND has a valid shipping address
        shipments: selectedCustomer && addrId ? [{
          shipping_address_id: addrId,
          quantity: product.quantity,
          shipping_fee: branch.shipping_fee || 0
        }] : []
      }));

      // Determine primary shipping_address_id
      const primaryAddressId = selectedCustomer ? (addrId || undefined) : undefined;

      // Auto-populate delivery snapshot from selected address if delivery fields are empty
      let snapshotName = deliveryName;
      let snapshotPhone = deliveryPhone;
      let snapshotAddress = deliveryAddress;
      let snapshotDistrict = deliveryDistrict;
      let snapshotAmphoe = deliveryAmphoe;
      let snapshotProvince = deliveryProvince;
      let snapshotPostalCode = deliveryPostalCode;
      let snapshotEmail = deliveryEmail;

      if (selectedCustomer && !deliveryName && primaryAddressId) {
        const addr = shippingAddresses.find(a => a.id === primaryAddressId);
        if (addr) {
          snapshotName = addr.contact_person || selectedCustomer.name;
          snapshotPhone = addr.phone || selectedCustomer.phone || '';
          snapshotAddress = addr.address_line1 || '';
          snapshotDistrict = addr.district || '';
          snapshotAmphoe = addr.amphoe || '';
          snapshotProvince = addr.province || '';
          snapshotPostalCode = addr.postal_code || '';
          snapshotEmail = selectedCustomer.email || '';
        }
      }

      const orderData: any = {
        ...(selectedCustomer ? { customer_id: selectedCustomer.id } : {}),
        ...(primaryAddressId ? { shipping_address_id: primaryAddressId } : {}),
        delivery_date: deliveryDate || undefined,
        discount_amount: calculateOrderDiscount(),
        order_discount_type: orderDiscountType,
        notes: notes || undefined,
        internal_notes: internalNotes || undefined,
        tax_invoice_requested: taxInvoiceRequested || undefined,
        ...(taxInvoiceRequested ? {
          tax_invoice_name: taxName.trim() || undefined,
          tax_invoice_tax_id: taxTaxId.trim() || undefined,
          tax_invoice_branch: taxBranch.trim() || undefined,
          tax_invoice_address: taxAddress.trim() || undefined,
        } : {}),
        items,
        ...(stockEnabled && selectedWarehouseId ? { warehouse_id: selectedWarehouseId } : {}),
        // Non-customer: send shipping fee directly
        ...(!selectedCustomer ? { shipping_fee: branch?.shipping_fee || 0 } : {}),
        // Delivery info snapshot (both customer & non-customer)
        ...(snapshotName ? {
          delivery_name: snapshotName,
          delivery_phone: snapshotPhone || undefined,
          delivery_address: snapshotAddress || undefined,
          delivery_district: snapshotDistrict || undefined,
          delivery_amphoe: snapshotAmphoe || undefined,
          delivery_province: snapshotProvince || undefined,
          delivery_postal_code: snapshotPostalCode || undefined,
          delivery_email: snapshotEmail || undefined,
        } : {}),
        // Tell API how to handle address: 'update' = update existing, 'new' = create new
        ...(addressAction !== 'auto' ? { address_action: addressAction } : {}),
        // Source channel info (from chat)
        ...(source ? { source, source_name: sourceName || undefined } : {}),
        // Bill expiry: compute expires_at based on mode
        ...(expiryMode === 'custom' ? {
          expires_at: new Date(Date.now() + customExpiryDays * 86400000).toISOString(),
        } : expiryMode === 'none' ? {
          expires_at: null, // explicitly no expiry
        } : {}), // 'default' = let API use company setting
        // Exchange: items to return from original order → API creates CN atomically
        ...(exchangeData ? { exchange: exchangeData } : {}),
      };

      if (isEditMode) {
        orderData.id = editOrderId;
      }

      const response = await apiFetch('/api/orders', {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

      const newOrderId = result.order?.id || result.id || editOrderId!;

      if (isEditMode) {
        showToast('บันทึกการแก้ไขสำเร็จ');
        if (onSuccess) {
          setTimeout(() => onSuccess(newOrderId, selectedCustomer?.id, deliveryName ? { name: deliveryName, phone: deliveryPhone, email: deliveryEmail } : undefined), 1000);
        } else {
          setTimeout(() => { router.push('/orders'); }, 1500);
        }
      } else {
        // New order: show success modal with bill online option
        setSavedOrderId(newOrderId);
        setSavedOrderNumber(result.order?.order_number || result.order_number || '');

        setShowSuccessModal(true);
      }
    } catch (error) {
      console.error('Error saving order:', error);
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
      </div>
    );
  }

  // Read-only banner (shown when order can't be edited)
  const readOnlyBanner = (() => {
    if (!isReadOnly) return null;
    // Shopee banner is shown in the order detail page header instead
    if (editOrderSource === 'shopee') return null;
    const statusLabels: Record<string, string> = { new: 'ใหม่', shipping: 'กำลังส่ง', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
    const paymentLabels: Record<string, string> = { pending: 'รอชำระ', verifying: 'รอตรวจสอบ', paid: 'ชำระแล้ว', cancelled: 'ยกเลิก' };
    const reasonMessage = editOrderStatus !== 'new'
      ? `สถานะออเดอร์ "${statusLabels[editOrderStatus] || editOrderStatus}"`
      : `สถานะชำระเงิน "${paymentLabels[editPaymentStatus] || editPaymentStatus}"`;
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 text-yellow-800 dark:text-yellow-300 px-4 py-3 rounded-lg text-sm">
        คำสั่งซื้อ {editOrderNumber} ({reasonMessage}) — ไม่สามารถแก้ไขได้
      </div>
    );
  })();

  const getVariationLabelDisplay = (variationLabel?: string) => {
    return variationLabel || '';
  };

  // Print-only view
  const printView = printMode && (
    <div className="hidden print:block bg-white text-black p-6 text-sm">
      {/* Print Header */}
      <div className="flex justify-between items-start mb-4 pb-3 border-b-2 border-black">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            {printMode === 'order' ? 'ใบออเดอร์' : 'ใบจัดของ (Packing List)'}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          {deliveryDate && (
            <div>วันที่ส่ง: {new Date(deliveryDate + 'T00:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          )}
          <div>พิมพ์เมื่อ: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>

      {/* Customer info - username only */}
      {selectedCustomer && (
        <div className="mb-4 text-sm">
          <span className="text-gray-500">ลูกค้า:</span> <span className="font-medium">{customerSearch || selectedCustomer.name}</span>
        </div>
      )}

      {/* Products per branch */}
      {branchOrders.map((branch, branchIndex) => (
        <div key={branchIndex} className="mb-4">
          {branchOrders.length > 1 && (
            <div className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>{branch.address_name}</span>
            </div>
          )}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                {printMode === 'packing' && <th className="py-1.5 text-left w-8"></th>}
                <th className="py-1.5 text-left w-[72px]">รูป</th>
                <th className="py-1.5 text-left">สินค้า</th>
                <th className="py-1.5 text-center w-16">จำนวน</th>
                {printMode === 'order' && (
                  <>
                    <th className="py-1.5 text-right w-20">ราคา</th>
                    <th className="py-1.5 text-right w-20">ส่วนลด</th>
                    <th className="py-1.5 text-right w-24">รวม</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {branch.products.map((product, productIndex) => {
                const productTotal = calculateProductTotal(product);
                const discountAmount = product.discount_type === 'percent'
                  ? (product.unit_price * product.quantity * product.discount_value / 100)
                  : product.discount_value;
                return (
                  <tr key={productIndex} className="border-b border-gray-200">
                    {printMode === 'packing' && (
                      <td className="py-2 text-center align-middle">
                        <span className="inline-block w-5 h-5 border-2 border-gray-400 rounded-sm"></span>
                      </td>
                    )}
                    <td className="py-2 align-middle">
                      {product.image ? (
                        <img src={product.image} alt={product.product_name} className="w-16 h-16 object-cover rounded border border-gray-200" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400 text-xs">N/A</div>
                      )}
                    </td>
                    <td className="py-2 align-middle">
                      <div className="font-semibold text-sm">{product.product_name}</div>
                      <div className="text-xs text-gray-400">{product.product_code}</div>
                    </td>
                    <td className="py-2 text-center align-middle text-base font-bold">{product.quantity}</td>
                    {printMode === 'order' && (
                      <>
                        <td className="py-2 text-right align-middle">฿{formatNumber(product.unit_price)}</td>
                        <td className="py-2 text-right align-middle text-gray-500">
                          {discountAmount > 0 ? `-฿${formatPrice(discountAmount)}` : '-'}
                        </td>
                        <td className="py-2 text-right align-middle font-medium">฿{formatPrice(productTotal)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Branch shipping fee */}
          {printMode === 'order' && branch.shipping_fee > 0 && (
            <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
              <span>ค่าจัดส่ง</span>
              <span>฿{formatPrice(branch.shipping_fee)}</span>
            </div>
          )}
        </div>
      ))}

      {/* Order Summary - only for order mode */}
      {printMode === 'order' && (
        <div className="border-t-2 border-gray-800 pt-3 mt-4">
          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>ยอดรวมสินค้า</span>
                <span>฿{formatPrice(itemsTotal)}</span>
              </div>
              {totalShippingFee > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>ค่าจัดส่ง</span>
                  <span>฿{formatPrice(totalShippingFee)}</span>
                </div>
              )}
              {orderDiscount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>ส่วนลดรวม</span>
                  <span>-฿{formatPrice(orderDiscountType === 'percent' ? (itemsTotal + totalShippingFee) * orderDiscount / 100 : orderDiscount)}</span>
                </div>
              )}
              {vatRegistered && (
                <>
                  <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-300">
                    <span>ยอดก่อน VAT</span>
                    <span>฿{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>VAT 7%</span>
                    <span>฿{formatPrice(vat)}</span>
                  </div>
                </>
              )}
              {storedExchangeCredit > 0 ? (
                <>
                  <div className="flex justify-between font-bold text-base pt-1.5 border-t-2 border-black">
                    <span>ยอดรวมก่อนหักเครดิต</span>
                    <span>฿{formatPrice(total)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-700">
                    <span>เครดิตจากการเปลี่ยนสินค้า</span>
                    <span>-฿{formatPrice(storedExchangeCredit)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-1.5 mt-1 border-t-2 border-black">
                    <span>ยอดชำระสุทธิ</span>
                    <span>฿{formatPrice(Math.max(0, total - storedExchangeCredit))}</span>
                  </div>
                </>
              ) : (
                <div className={`flex justify-between font-bold text-base pt-1.5 border-t-2 border-black`}>
                  <span>ยอดรวมสุทธิ</span>
                  <span>฿{formatPrice(total)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className="mt-4 pt-3 border-t border-gray-300">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">หมายเหตุ</div>
          <div className="text-sm whitespace-pre-wrap">{notes}</div>
        </div>
      )}
    </div>
  );

  return (
    <>
    {printView}
    <form onSubmit={handleSubmit} className={`space-y-4 ${printMode ? 'print:hidden' : ''}`}>
      {/* Header actions portal — copy order button in parent header */}
      {headerActionsRef?.current && !isEditMode && selectedCustomer && createPortal(
        <button
          type="button"
          onClick={handleCopyLatestOrder}
          disabled={loadingLatestOrder}
          className="p-1.5 text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 flex items-center"
          title="คัดลอก Order ล่าสุด"
        >
          {loadingLatestOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
        </button>,
        headerActionsRef.current
      )}

      {/* Warehouse Picker — portal into header or inline fallback */}
      {stockEnabled && warehouses.length > 1 && (() => {
        const warehousePicker = (
          <div className="inline-block min-w-[160px]">
            <FormSelect
              value={selectedWarehouseId}
              onChange={(val) => {
                setSelectedWarehouseId(val);
                fetchInventoryForWarehouse(val);
              }}
              disabled={isReadOnly}
              options={warehouses.map(wh => ({
                id: wh.id,
                label: `${wh.is_default ? '⭐ ' : ''}${wh.name}`,
              }))}
              icon={<Warehouse className="w-4 h-4" />}
              placeholder="-- เลือกคลัง --"
              searchThreshold={99}
            />
          </div>
        );
        if (warehousePortalRef?.current) {
          return createPortal(warehousePicker, warehousePortalRef.current);
        }
        return <div className="flex justify-end">{warehousePicker}</div>;
      })()}

      {/* Customer + Delivery section — hidden in edit mode (shown in top card instead) */}
      {!isEditMode && (
      <div ref={deliverySectionRef} className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
        <div className={`grid grid-cols-1 ${wideEnough ? 'grid-cols-2' : ''} gap-x-4 gap-y-3`}>
          {/* Row 1 Left: ลูกค้า */}
          <div ref={customerSectionRef} className="relative flex flex-col">
            <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
              ลูกค้า <span className="text-gray-400 text-xs font-normal">(ไม่บังคับ)</span>
            </label>
            {selectedCustomer ? (
              <div className="relative flex-1">
                <div
                  className={`flex items-start gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg h-full ${shippingAddresses.length > 1 && !isReadOnly ? 'cursor-pointer' : ''}`}
                  onClick={() => { if (shippingAddresses.length > 1 && !isReadOnly) setShowAddressDropdown(!showAddressDropdown); }}
                >
                  <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-slate-200">{selectedCustomer.name}</div>
                    {shippingAddresses.length > 0 && (
                      <div className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span>{selectedAddressId === 'new' ? 'ที่อยู่ใหม่' : (shippingAddresses.find(a => a.id === selectedAddressId)?.address_name || shippingAddresses[0]?.address_name)}</span>
                        {shippingAddresses.length > 1 && !isReadOnly && <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                      </div>
                    )}
                  </div>
                  {!isReadOnly && !preselectedCustomerId && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); setCustomerSearch(''); setShippingAddresses([]); setSelectedAddressId(''); setCustomerPrices({}); setShowAddressDropdown(false); setTaxName(''); setTaxTaxId(''); setTaxBranch('สำนักงานใหญ่'); setTaxAddress(''); setTaxInvoiceRequested(false); }} className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded transition-colors">
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  )}
                </div>
                {/* Custom address dropdown */}
                {showAddressDropdown && shippingAddresses.length > 1 && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAddressDropdown(false)} />
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                      {shippingAddresses.map(addr => (
                        <button key={addr.id} type="button" onClick={() => {
                          setSelectedAddressId(addr.id);
                          setDeliveryName(addr.contact_person || selectedCustomer.name);
                          setDeliveryPhone(addr.phone || selectedCustomer.phone || '');
                          setDeliveryAddress(addr.address_line1 || '');
                          setDeliveryDistrict(addr.district || '');
                          setDeliveryAmphoe(addr.amphoe || '');
                          setDeliveryProvince(addr.province || '');
                          setDeliveryPostalCode(addr.postal_code || '');
                          setShowAddressDropdown(false);
                        }} className={`w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors ${selectedAddressId === addr.id ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}>
                          <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${selectedAddressId === addr.id ? 'text-[#F4511E]' : 'text-gray-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm ${selectedAddressId === addr.id ? 'font-medium text-[#F4511E]' : 'text-gray-700 dark:text-slate-300'}`}>{addr.address_name}</div>
                            <div className="text-xs text-gray-400 dark:text-slate-500 truncate">{[addr.address_line1, addr.district, addr.amphoe, addr.province].filter(Boolean).join(', ')}</div>
                          </div>
                          {selectedAddressId === addr.id && <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0" />}
                        </button>
                      ))}
                      <button type="button" onClick={() => {
                        setSelectedAddressId('new');
                        setDeliveryName(''); setDeliveryPhone(''); setDeliveryEmail('');
                        setDeliveryAddress(''); setDeliveryDistrict(''); setDeliveryAmphoe('');
                        setDeliveryProvince(''); setDeliveryPostalCode('');
                        setShowAddressDropdown(false);
                      }} className="w-full px-3 py-2.5 text-left flex items-center gap-2 border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <Plus className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm text-gray-500 dark:text-slate-400">ที่อยู่ใหม่</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <EntitySearchInput
                value=""
                onChange={(id) => {
                  const customer = customers.find(c => c.id === id);
                  if (customer) handleSelectCustomer(customer);
                }}
                options={customers.map(c => ({
                  id: c.id,
                  label: c.name,
                  subtitle: `${c.customer_code}${c.phone ? ' · ' + c.phone : ''}`,
                }))}
                placeholder="ค้นหาชื่อ, รหัส, หรือเบอร์โทร..."
                disabled={(!!preselectedCustomerId || isEditMode) && !!selectedCustomer}
              />
            )}
            {!selectedCustomer && (
              <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">ไม่เลือกลูกค้า = ส่ง Bill Online ให้ลูกค้ากรอกเอง</p>
            )}
          </div>

          {/* Row 1 Right: ที่อยู่จัดส่ง */}
          <div className={`flex flex-col ${wideEnough ? 'border-l border-gray-200 dark:border-slate-700 pl-4' : ''}`}>
            <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่จัดส่ง</label>
            <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} onPaste={(e) => { const pasted = e.clipboardData.getData('text'); if (pasted.length > 10) { const parsed = parseThaiAddress(pasted); if (parsed) { e.preventDefault(); setDeliveryAddress(parsed.address); setDeliveryDistrict(parsed.district); setDeliveryAmphoe(parsed.amphoe); setDeliveryProvince(parsed.province); setDeliveryPostalCode(parsed.postal_code); } } }} placeholder="วางที่อยู่ยาวๆ ได้เลย — ระบบจะแยก ตำบล อำเภอ จังหวัด ให้อัตโนมัติ" disabled={isReadOnly} className="w-full flex-1 px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 resize-none" />
          </div>

          {/* Row 2-3 Left: ชื่อผู้รับ + เบอร์โทร + อีเมล */}
          <div className="space-y-3">
            <div>
              <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ชื่อผู้รับ</label>
              <input type="text" value={deliveryName} onChange={(e) => setDeliveryName(e.target.value)} placeholder="ชื่อ-นามสกุล" disabled={isReadOnly} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">เบอร์โทร</label>
                <input type="text" inputMode="tel" value={deliveryPhone} onChange={(e) => { setDeliveryPhone(e.target.value); if (fieldErrors.deliveryPhone) { const v = e.target.value.trim(); setFieldErrors(prev => { const next = { ...prev }; if (!v || /^(0[0-9]{8,9}|[0-9]{9,10})$/.test(v)) delete next.deliveryPhone; return next; }); } }} onBlur={() => { const v = deliveryPhone.trim(); if (v && !/^(0[0-9]{8,9}|[0-9]{9,10})$/.test(v)) setFieldErrors(prev => ({ ...prev, deliveryPhone: 'เบอร์โทรไม่ถูกต้อง' })); else setFieldErrors(prev => { const { deliveryPhone: _, ...rest } = prev; return rest; }); }} placeholder="0xx-xxx-xxxx" disabled={isReadOnly} className={`w-full px-3 py-2.5 border rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 ${fieldErrors.deliveryPhone ? 'border-red-400' : 'border-gray-300 dark:border-slate-600'}`} />
                {fieldErrors.deliveryPhone && <p className="text-red-500 text-xs mt-1">{fieldErrors.deliveryPhone}</p>}
              </div>
              <div>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">อีเมล</label>
                <input type="text" inputMode="email" value={deliveryEmail} onChange={(e) => { setDeliveryEmail(e.target.value); if (fieldErrors.deliveryEmail) { const v = e.target.value.trim(); setFieldErrors(prev => { const next = { ...prev }; if (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) delete next.deliveryEmail; return next; }); } }} onBlur={() => { const v = deliveryEmail.trim(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) setFieldErrors(prev => ({ ...prev, deliveryEmail: 'อีเมลไม่ถูกต้อง' })); else setFieldErrors(prev => { const { deliveryEmail: _, ...rest } = prev; return rest; }); }} placeholder="email@example.com" disabled={isReadOnly} className={`w-full px-3 py-2.5 border rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 ${fieldErrors.deliveryEmail ? 'border-red-400' : 'border-gray-300 dark:border-slate-600'}`} />
                {fieldErrors.deliveryEmail && <p className="text-red-500 text-xs mt-1">{fieldErrors.deliveryEmail}</p>}
              </div>
            </div>
          </div>

          {/* Row 2-3 Right: ตำบล อำเภอ จังหวัด รหัสไปรษณีย์ (with autocomplete) */}
          <div className={`${wideEnough ? 'border-l border-gray-200 dark:border-slate-700 pl-4' : ''}`}>
            <ThaiAddressInput district={deliveryDistrict} amphoe={deliveryAmphoe} province={deliveryProvince} postalCode={deliveryPostalCode} onAddressChange={(addr) => { if (addr.district !== undefined) setDeliveryDistrict(addr.district); if (addr.amphoe !== undefined) setDeliveryAmphoe(addr.amphoe); if (addr.province !== undefined) setDeliveryProvince(addr.province); if (addr.postalCode !== undefined) setDeliveryPostalCode(addr.postalCode); }} disabled={isReadOnly} />
          </div>

          {/* Tax Invoice Request — full width */}
          {vatRegistered && (
          <div className={wideEnough ? 'col-span-2' : ''}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taxInvoiceRequested}
                onChange={(e) => setTaxInvoiceRequested(e.target.checked)}
                disabled={isReadOnly}
                className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E] accent-[#F4511E]"
              />
              <span className="text-base font-medium text-[#F4511E] dark:text-orange-400">ขอใบกำกับภาษี</span>
            </label>
            {taxInvoiceRequested && (
              <div className="mt-3 space-y-3">
                {/* Row 1: ชื่อกิจการ */}
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ชื่อบริษัท/ชื่อผู้เสียภาษี</label>
                  <input type="text" value={taxName} onChange={(e) => setTaxName(e.target.value)} disabled={isReadOnly} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800" placeholder="บริษัท XXX จำกัด" />
                </div>
                {/* Row 2: เลขผู้เสียภาษี + สาขา */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                    <input type="text" value={taxTaxId} onChange={(e) => setTaxTaxId(e.target.value)} disabled={isReadOnly} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800" placeholder="X-XXXX-XXXXX-XX-X" maxLength={17} />
                  </div>
                  <div>
                    <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">สาขา</label>
                    <input type="text" value={taxBranch} onChange={(e) => setTaxBranch(e.target.value)} disabled={isReadOnly} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800" placeholder="สำนักงานใหญ่" />
                  </div>
                </div>
                {/* Row 3: ที่อยู่ออกบิล */}
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ที่อยู่ออกบิล</label>
                  <textarea value={taxAddress} onChange={(e) => setTaxAddress(e.target.value)} rows={2} disabled={isReadOnly} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#F4511E] resize-none disabled:bg-gray-100 dark:disabled:bg-slate-800" placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" />
                </div>
              </div>
            )}
          </div>
          )}

          {/* Delivery Date — full width */}
          {features.delivery_date.enabled && (
          <div ref={deliveryDateRef} className={wideEnough ? 'col-span-2' : ''}>
            <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
              วันที่ส่งของ {features.delivery_date.required && <span className="text-red-500">*</span>}
            </label>
            <div className={fieldErrors.deliveryDate ? 'ring-2 ring-red-400 rounded-lg' : ''}>
              <DateRangePicker value={deliveryDateValue} onChange={(val) => { setDeliveryDateValue(val); setFieldErrors(prev => { const { deliveryDate, ...rest } = prev; return rest; }); }} asSingle={true} useRange={false} showShortcuts={false} showFooter={false} placeholder="เลือกวันที่ส่ง" disabled={isReadOnly} />
            </div>
            {fieldErrors.deliveryDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.deliveryDate}</p>}
          </div>
          )}
        </div>
      </div>
      )}

      {/* 2-column layout: Products+Notes (left) + Summary (right) on wide screens */}
      <div ref={summarySectionRef} className="flex flex-wrap gap-4 items-start">
      <div className="flex-1 basis-[400px] min-w-0 space-y-4">

      {/* Products Section */}
      {branchOrders.length > 0 && (
        <div ref={productsSectionRef} className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} overflow-visible`}>
          <ItemsTable
            items={(branchOrders[0]?.products || []).map((p): OrderTableItem => ({
              variation_id: p.variation_id,
              product_name: p.product_name,
              variation_label: p.product_type === 'simple' ? p.variation_label : getVariationLabelDisplay(p.variation_label),
              product_code: p.product_code,
              sku: p.sku,
              image: p.image,
              quantity: p.quantity,
              unit_price: p.unit_price,
              discount_value: p.discount_value,
              discount_type: p.discount_type,
            }))}
            columns={['qty', 'unit_price', 'discount', 'total']}
            stockMap={stockEnabled && selectedWarehouseId
              ? Object.fromEntries(Object.entries(inventoryMap).map(([k, v]) => [k, v.available]))
              : {}}
            showStockInSearch={stockEnabled && !!selectedWarehouseId}
            disableOutOfStock={!allowOversell && stockEnabled && !!selectedWarehouseId}
            products={isReadOnly ? [] : products}
            loadingProducts={loadingProducts}
            searchPlaceholder="เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
            onAdd={isReadOnly ? undefined : (p) => handleAddProductToBranch(p as Product)}
            onUpdateField={isReadOnly ? undefined : (idx, field, value) => {
              if (field === 'quantity') handleUpdateProductQuantity(idx, value as number);
              if (field === 'unit_price') handleUpdateProductPrice(idx, value as number);
              if (field === 'discount_value') handleUpdateProductDiscount(idx, value as number);
              if (field === 'discount_type') handleToggleProductDiscountType(idx);
            }}
            onRemove={isReadOnly ? undefined : handleRemoveProduct}
            emptyMessage={fieldErrors.branches || 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน'}
            showSummary={false}
          />
        </div>
      )}

      {/* Notes + Settings — part of left column */}
      {hasProducts && (
        <div className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
          <div className="space-y-3">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
                  หมายเหตุ <span className="text-gray-400 dark:text-slate-500 font-normal">(แสดงในบิล / การจัดส่ง)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-base disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                  placeholder="หมายเหตุสำหรับลูกค้า, การจัดส่ง..."
                />
              </div>
              <div>
                <label className="block text-base font-medium text-orange-700 dark:text-orange-400 mb-1">
                  หมายเหตุภายใน <span className="text-orange-400 dark:text-orange-500 font-normal">(ไม่แสดงในบิล)</span>
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2.5 border border-orange-300 dark:border-orange-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-base bg-orange-50 dark:bg-orange-900/20 text-gray-900 dark:text-slate-200 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500 disabled:border-gray-300 dark:disabled:border-slate-600"
                  placeholder="หมายเหตุภายใน..."
                />
              </div>

              {/* Advance settings toggle */}
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors mt-1"
                >
                  <Settings className="w-3.5 h-3.5" />
                  ตั้งค่าขั้นสูง
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
                </button>
              )}

              {/* Advance settings panel */}
              {showAdvancedSettings && !isReadOnly && (
                <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-slate-700/30">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-slate-300">
                    <Clock className="w-4 h-4" />
                    วันหมดอายุบิล
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="expiryMode"
                        checked={expiryMode === 'default'}
                        onChange={() => setExpiryMode('default')}
                        className="accent-[#F4511E]"
                      />
                      <span className="text-gray-700 dark:text-slate-300">
                        ใช้ที่ตั้งค่าไว้
                        {billExpiryDays && billExpiryDays > 0 ? (
                          <span className="text-gray-400 dark:text-slate-500 ml-1">({billExpiryDays} วัน)</span>
                        ) : billExpiryDays === 0 ? (
                          <span className="text-gray-400 dark:text-slate-500 ml-1">(ปิดใช้งาน)</span>
                        ) : (
                          <span className="text-gray-400 dark:text-slate-500 ml-1">(7 วัน)</span>
                        )}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="expiryMode"
                        checked={expiryMode === 'custom'}
                        onChange={() => setExpiryMode('custom')}
                        className="accent-[#F4511E]"
                      />
                      <span className="text-gray-700 dark:text-slate-300">กำหนดเอง</span>
                      {expiryMode === 'custom' && (
                        <span className="flex items-center gap-1 ml-1">
                          <input
                            type="number"
                            min={1}
                            max={90}
                            value={customExpiryDays}
                            onChange={(e) => setCustomExpiryDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
                            className="w-14 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm text-center bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                          />
                          <span className="text-gray-500 dark:text-slate-400 text-xs">วัน</span>
                        </span>
                      )}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="expiryMode"
                        checked={expiryMode === 'none'}
                        onChange={() => setExpiryMode('none')}
                        className="accent-[#F4511E]"
                      />
                      <span className="text-gray-700 dark:text-slate-300">ไม่หมดอายุ</span>
                    </label>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      </div>{/* End left column */}

      {/* Order Summary — right column (sticky on wide, full-width on narrow) */}
      {hasProducts && (
        <div className={`${summaryWide ? 'w-[340px] flex-shrink-0 sticky top-4' : 'w-full'}`}>
          <div className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
              <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-3">สรุปคำสั่งซื้อ</h3>
              <div className="space-y-2 text-base">
                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                  <span>ยอดรวมสินค้า (รวม VAT)</span>
                  <span>฿{formatPrice(itemsTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-500 dark:text-slate-400">
                  <span>ค่าจัดส่ง</span>
                  {/* Show inline input when single branch, show total when multiple branches */}
                  <div className="relative w-[108px]">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={branchOrders[0]?.shipping_fee || ''}
                      onChange={(e) => handleUpdateShippingFee(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      disabled={isReadOnly}
                      className="w-full px-2 pr-7 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-slate-500 pointer-events-none">฿</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-slate-400">ส่วนลดรวม</span>
                  <div className="flex items-stretch w-[108px]">
                    <input
                      type="number"
                      min="0"
                      max={orderDiscountType === 'percent' ? 100 : undefined}
                      step="0.01"
                      value={orderDiscount}
                      onChange={(e) => setOrderDiscount(parseFloat(e.target.value) || 0)}
                      disabled={isReadOnly}
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-l-lg border-r-0 text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:z-10 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setOrderDiscountType(orderDiscountType === 'percent' ? 'amount' : 'percent');
                        setOrderDiscount(0);
                      }}
                      disabled={isReadOnly}
                      className="px-2 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-500 transition-colors min-w-[28px] flex items-center justify-center disabled:opacity-50"
                      title={orderDiscountType === 'percent' ? 'เปลี่ยนเป็นจำนวนเงิน' : 'เปลี่ยนเป็นเปอร์เซ็นต์'}
                    >
                      {orderDiscountType === 'percent' ? '%' : '฿'}
                    </button>
                  </div>
                </div>
                {vatRegistered && (
                  <>
                    <div className="flex justify-between text-gray-500 dark:text-slate-400 pt-2 border-t border-gray-200 dark:border-slate-600">
                      <span>ยอดก่อน VAT</span>
                      <span>฿{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 dark:text-slate-400">
                      <span>VAT 7%</span>
                      <span>฿{formatPrice(vat)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100">
                  <span>ยอดรวมสุทธิ</span>
                  <span className="text-[#F4511E]">฿{formatPrice(total)}</span>
                </div>
                {/* Exchange: price difference summary (create mode or view existing) */}
                {(() => {
                  const credit = exchangeCreditAmount || storedExchangeCredit || 0;
                  if (credit <= 0) return null;
                  const diff = total - credit;
                  return (
                    <>
                      <div className="flex justify-between text-sm text-green-600 dark:text-green-400 pt-2 border-t border-gray-200 dark:border-slate-600">
                        <span>เครดิตจากการเปลี่ยนสินค้า</span>
                        <span>-฿{formatPrice(credit)}</span>
                      </div>
                      <div className={`flex justify-between items-center text-lg font-bold mt-1 px-3 py-2 rounded-lg ${
                        diff > 0
                          ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                      }`}>
                        <span>{diff > 0 ? 'ลูกค้าจ่ายเพิ่ม' : diff < 0 ? 'คืนเงินลูกค้า' : 'ไม่มีส่วนต่าง'}</span>
                        <span>฿{formatPrice(Math.abs(diff))}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      </div>{/* End 2-column wrapper */}

      {/* Action Buttons */}
      {!isReadOnly && hasProducts && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-5 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-[#F4511E] text-white px-5 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEditMode ? 'บันทึกการแก้ไข' : 'บันทึกคำสั่งซื้อ'}
              </>
            )}
          </button>
        </div>
      )}
      {/* Address Conflict Dialog */}
      {addressConflict && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-2">ที่อยู่ไม่ตรงกับ &quot;{addressConflict.addressName}&quot;</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">ที่อยู่ที่กรอกไม่ตรงกับที่อยู่เดิม ต้องการดำเนินการอย่างไร?</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => doSave('update')}
                disabled={saving}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] transition-colors disabled:opacity-50"
              >
                อัพเดท &quot;{addressConflict.addressName}&quot;
              </button>
              <button
                type="button"
                onClick={() => doSave('new')}
                disabled={saving}
                className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                บันทึกเป็นที่อยู่ใหม่
              </button>
              <button
                type="button"
                onClick={() => setAddressConflict(null)}
                disabled={saving}
                className="w-full px-4 py-2.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal with Bill Online */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowSuccessModal(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowSuccessModal(false); }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md mx-4 w-full relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">สร้างคำสั่งซื้อสำเร็จ!</h3>
              {savedOrderNumber && (
                <p className="text-gray-600 dark:text-slate-400 mb-4">เลขที่คำสั่งซื้อ: <span className="font-medium">{savedOrderNumber}</span></p>
              )}
              <div className="space-y-3">
                {/* Bill Online Link with copy */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1 text-left">บิลออนไลน์</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/bills/${savedOrderId}`}
                      className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-700 dark:text-slate-300 select-all"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const billUrl = `${window.location.origin}/bills/${savedOrderId}`;
                        navigator.clipboard.writeText(billUrl);
                        setBillLinkCopied(true);
                        setTimeout(() => setBillLinkCopied(false), 2000);
                      }}
                      className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                        billLinkCopied
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                      }`}
                      title="คัดลอกลิงก์"
                    >
                      {billLinkCopied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  {billLinkCopied && (
                    <p className="text-xs text-green-600 mt-1 text-left">คัดลอกแล้ว!</p>
                  )}
                </div>

                {onSendBillToChat && (
                  <button
                    type="button"
                    onClick={() => {
                      const billUrl = `${window.location.origin}/bills/${savedOrderId}`;
                      setShowSuccessModal(false);
                      onSendBillToChat(savedOrderId, savedOrderNumber, billUrl);
                      if (onSuccess) {
                        onSuccess(savedOrderId, selectedCustomer?.id, deliveryName ? { name: deliveryName, phone: deliveryPhone, email: deliveryEmail } : undefined);
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    ส่งบิลให้ลูกค้า
                  </button>
                )}
                <a
                  href={`/orders/${savedOrderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-2.5 rounded-lg transition-colors font-medium border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 text-center block"
                >
                  ดูคำสั่งซื้อ
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
    </>
  );
}
