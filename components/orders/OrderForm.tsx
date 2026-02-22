'use client';

import { useState, useEffect, useRef, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { parseThaiAddress } from '@/lib/address-parser';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import ProductSearchInput, { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import {
  Plus,
  Trash2,
  Search,
  Loader2,
  Package,
  MapPin,
  X,
  Save,
  Copy,
  ChevronDown,
  CheckCircle,
  Send,
  Warehouse,
  AlertTriangle
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
  onSuccess?: (orderId: string) => void;
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
}: OrderFormProps) {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();

  // State
  const [loading, setLoading] = useState(!!editOrderId);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedOrderId, setSavedOrderId] = useState('');
  const [savedOrderNumber, setSavedOrderNumber] = useState('');
  const [billLinkCopied, setBillLinkCopied] = useState(false);

  // Edit mode
  const [editOrderNumber, setEditOrderNumber] = useState('');
  const [editOrderStatus, setEditOrderStatus] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [editOrderSource, setEditOrderSource] = useState('manual');
  const isEditMode = !!editOrderId;
  const isReadOnly = isEditMode && (editOrderSource === 'shopee' || editOrderStatus !== 'new' || editPaymentStatus !== 'pending');

  // Customer selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Shipping addresses
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([]);

  // Products
  const [products, setProducts] = useState<Product[]>([]);

  // Customer pricing
  const [customerPrices, setCustomerPrices] = useState<Record<string, { unit_price: number; discount_percent: number }>>({});

  // Branch Orders
  const [branchOrders, setBranchOrders] = useState<BranchOrder[]>([]);
  const [activeBranchIndex, setActiveBranchIndex] = useState(0);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState<number | null>(null);
  const branchDropdownRef = useRef<HTMLDivElement>(null);

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
  const [multiBranch, setMultiBranch] = useState(false);

  // Stock & Warehouse
  const [stockEnabled, setStockEnabled] = useState(false);
  const [allowOversell, setAllowOversell] = useState(true);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string; is_default: boolean }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [inventoryMap, setInventoryMap] = useState<Record<string, { quantity: number; reserved_quantity: number; available: number }>>({});

  // Product search per branch
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Close lightbox on Esc key
  useEffect(() => {
    if (!lightboxImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  // Close branch dropdown on click outside
  useEffect(() => {
    if (branchDropdownOpen === null) return;
    const handleClick = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [branchDropdownOpen]);

  // Copy from latest order
  const [loadingLatestOrder, setLoadingLatestOrder] = useState(false);

  // Refs
  const quantityInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const deliveryDateRef = useRef<HTMLDivElement>(null);
  const branchSectionRef = useRef<HTMLDivElement>(null);

  // Initialize default branch (product-first flow for all modes)
  // This allows product section to show immediately without selecting a customer
  useEffect(() => {
    if (!isEditMode && !initialOrderData && !preselectedCustomerId && branchOrders.length === 0) {
      setBranchOrders([{
        shipping_address_id: '',
        address_name: 'รายการสินค้า',
        delivery_notes: '',
        shipping_fee: 0,
        products: [],
      }]);
    }
  }, [features.customer_branches]);

  // Handle multiBranch toggle
  const handleMultiBranchToggle = (enabled: boolean) => {
    setMultiBranch(enabled);
    const existingProducts = branchOrders.flatMap(b => b.products);
    const existingShippingFee = branchOrders.reduce((sum, b) => sum + (b.shipping_fee || 0), 0);

    if (enabled && shippingAddresses.length > 0) {
      // Switch to multi-branch: put existing products into first address
      const sortedAddresses = [...shippingAddresses].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setBranchOrders([{
        shipping_address_id: sortedAddresses[0].id,
        address_name: sortedAddresses[0].address_name,
        delivery_notes: '',
        shipping_fee: existingShippingFee,
        products: existingProducts,
      }]);
    } else {
      // Switch back to single: collect all products into default branch
      setBranchOrders([{
        shipping_address_id: '',
        address_name: 'รายการสินค้า',
        delivery_notes: '',
        shipping_fee: existingShippingFee,
        products: existingProducts,
      }]);
    }
  };

  // Fetch customers, products, and warehouse config (once)
  // For marketplace orders (edit mode), skip customers/products — they're read-only
  useFetchOnce(() => {
    const source = preloadedOrder?.source || '';
    const isMarketplace = source && source !== 'manual';
    if (!isMarketplace) {
      fetchCustomers();
      fetchProducts();
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
  useEffect(() => {
    if (initialOrderData && customers.length > 0 && products.length > 0 && !selectedCustomer) {
      const customer = customers.find(c => c.id === initialOrderData.customer_id);
      if (customer) {
        // Set customer without reinitializing branches
        setSelectedCustomer(customer);
        setCustomerSearch(customer.name);

        // Fetch shipping addresses without forcing init
        fetchShippingAddresses(customer.id, false);

        // Fetch customer prices
        (async () => {
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

        // Set branch orders from initial data
        setBranchOrders(initialOrderData.branches);

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
      }
    }
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

        // Set notes and discount
        if (order.notes) setNotes(order.notes);
        if (order.internal_notes) setInternalNotes(order.internal_notes);
        if (order.discount_amount) setOrderDiscount(order.discount_amount);
        if (order.order_discount_type) setOrderDiscountType(order.order_discount_type);

        // For marketplace orders, skip unnecessary fetches (read-only)
        const isMarketplace = (order.source || 'manual') !== 'manual';

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

        // Convert order items to branch structure
        const branchMap = new Map<string, BranchOrder>();
        const DEFAULT_BRANCH_KEY = '__default__';

        for (const item of order.items || []) {
          const shipments = item.shipments || [];

          if (shipments.length === 0) {
            // Items without shipments (e.g. Shopee orders with masked addresses)
            if (!branchMap.has(DEFAULT_BRANCH_KEY)) {
              branchMap.set(DEFAULT_BRANCH_KEY, {
                shipping_address_id: '',
                address_name: 'ไม่ระบุ',
                delivery_notes: '',
                shipping_fee: 0,
                products: []
              });
            }
            const branch = branchMap.get(DEFAULT_BRANCH_KEY)!;
            branch.products.push({
              variation_id: item.variation_id,
              product_id: item.product_id,
              product_code: item.product_code,
              product_name: item.product_name,
              variation_label: item.variation_label,
              image: item.image,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_value: item.discount_type === 'amount' ? (item.discount_amount || 0) : (item.discount_percent || 0),
              discount_type: item.discount_type || 'percent'
            });
            continue;
          }

          for (const shipment of shipments) {
            const addressId = shipment.shipping_address_id;
            const addressName = shipment.shipping_address?.address_name || 'ไม่ระบุ';

            if (!branchMap.has(addressId)) {
              branchMap.set(addressId, {
                shipping_address_id: addressId,
                address_name: addressName,
                delivery_notes: shipment.delivery_notes || '',
                shipping_fee: shipment.shipping_fee || 0,
                products: []
              });
            }

            const branch = branchMap.get(addressId)!;
            const existingProduct = branch.products.find(p => p.variation_id === item.variation_id);
            if (!existingProduct) {
              branch.products.push({
                variation_id: item.variation_id,
                product_id: item.product_id,
                product_code: item.product_code,
                product_name: item.product_name,
                variation_label: item.variation_label,
                image: item.image,
                quantity: shipment.quantity,
                unit_price: item.unit_price,
                discount_value: item.discount_type === 'amount' ? (item.discount_amount || 0) : (item.discount_percent || 0),
                discount_type: item.discount_type || 'percent'
              });
            }
          }
        }

        const branches = Array.from(branchMap.values());
        setBranchOrders(branches);
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

  const fetchShippingAddresses = async (customerId: string, forceInit: boolean = true) => {
    try {
      const response = await apiFetch(`/api/shipping-addresses?customer_id=${customerId}`);

      if (response.ok) {
        const result = await response.json();
        const addresses = result.addresses || [];
        setShippingAddresses(addresses);

        if (addresses.length > 0 && forceInit) {
          const sortedAddresses = [...addresses].sort((a: ShippingAddress, b: ShippingAddress) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          const firstBranch: BranchOrder = {
            shipping_address_id: sortedAddresses[0].id,
            address_name: sortedAddresses[0].address_name,
            delivery_notes: '',
            shipping_fee: 0,
            products: []
          };
          setBranchOrders([firstBranch]);
        }
      }
    } catch (error) {
      console.error('Error fetching shipping addresses:', error);
    }
  };

  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
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

    // Collect existing products from all branches before resetting
    const existingProducts = branchOrders.flatMap(b => b.products);
    const existingShippingFee = branchOrders.reduce((sum, b) => sum + (b.shipping_fee || 0), 0);

    // Keep existing products in default branch
    setBranchOrders([{
      shipping_address_id: '',
      address_name: 'รายการสินค้า',
      delivery_notes: '',
      shipping_fee: existingShippingFee,
      products: existingProducts,
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

      // Transform order data - group items by shipping address
      const branchMap = new Map<string, BranchOrder>();

      for (const item of order.items || []) {
        for (const shipment of item.shipments || []) {
          const addressId = shipment.shipping_address_id;
          const addressName = shipment.shipping_address?.address_name || 'ไม่ระบุ';

          if (!branchMap.has(addressId)) {
            branchMap.set(addressId, {
              shipping_address_id: addressId,
              address_name: addressName,
              delivery_notes: shipment.delivery_notes || '',
              shipping_fee: shipment.shipping_fee || 0,
              products: []
            });
          }

          const branch = branchMap.get(addressId)!;

          // Check if product already exists in this branch
          const existingProduct = branch.products.find(p => p.variation_id === item.variation_id);
          if (!existingProduct) {
            branch.products.push({
              variation_id: item.variation_id,
              product_id: item.product_id,
              product_code: item.product_code,
              product_name: item.product_name,
              variation_label: item.variation_label,
              quantity: shipment.quantity,
              unit_price: item.unit_price,
              discount_value: item.discount_type === 'amount' ? (item.discount_amount || 0) : (item.discount_percent || 0),
              discount_type: item.discount_type || 'percent'
            });
          }
        }
      }

      const branches = Array.from(branchMap.values());

      if (branches.length === 0) {
        showToast('ไม่พบข้อมูลสินค้าใน Order เก่า', 'error');
        return;
      }

      // Set branch orders
      setBranchOrders(branches);
      setActiveBranchIndex(0);

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

  // Branch management
  const canAddBranch = shippingAddresses.length > 1 && branchOrders.length < shippingAddresses.length;

  const handleAddBranch = () => {
    if (!canAddBranch) return;

    const usedAddressIds = branchOrders.map(b => b.shipping_address_id);
    const availableAddress = shippingAddresses.find(a => !usedAddressIds.includes(a.id)) || shippingAddresses[0];

    const newBranch: BranchOrder = {
      shipping_address_id: availableAddress.id,
      address_name: availableAddress.address_name,
      delivery_notes: '',
      shipping_fee: 0,
      products: []
    };

    setBranchOrders([...branchOrders, newBranch]);
    setActiveBranchIndex(branchOrders.length);
  };

  const handleRemoveBranch = (index: number) => {
    if (branchOrders.length === 1) {
      showToast('ต้องมีอย่างน้อย 1 สาขา', 'error');
      return;
    }
    setBranchOrders(branchOrders.filter((_, i) => i !== index));
    if (activeBranchIndex >= branchOrders.length - 1) {
      setActiveBranchIndex(Math.max(0, branchOrders.length - 2));
    }
  };

  const handleUpdateBranchAddress = (index: number, addressId: string) => {
    const alreadyUsed = branchOrders.some((b, i) => i !== index && b.shipping_address_id === addressId);
    if (alreadyUsed) return;
    const newBranchOrders = [...branchOrders];
    const address = shippingAddresses.find(a => a.id === addressId);
    if (address) {
      newBranchOrders[index].shipping_address_id = addressId;
      newBranchOrders[index].address_name = address.address_name;
      setBranchOrders(newBranchOrders);
    }
  };

  // Product management
  const handleAddProductToBranch = (branchIndex: number, product: Product) => {
    // Stock validation when oversell is not allowed
    if (!allowOversell && stockEnabled && selectedWarehouseId) {
      const inv = inventoryMap[product.id];
      const available = inv ? inv.available : 0;
      // Sum current qty of this product across all branches
      const currentQty = branchOrders.reduce((sum, b) =>
        sum + b.products.filter(p => p.variation_id === product.id).reduce((s, p) => s + p.quantity, 0), 0);

      if (available <= 0 || currentQty >= available) {
        showToast('สินค้านี้ stock หมด ไม่สามารถเพิ่มได้', 'error');
        return;
      }
    }

    const existingProductIndex = branchOrders[branchIndex].products.findIndex(
      p => p.variation_id === product.id
    );

    const newBranchOrders = [...branchOrders];

    if (existingProductIndex !== -1) {
      // Duplicate → increment quantity (barcode scan behavior)
      if (!allowOversell && stockEnabled && selectedWarehouseId) {
        const inv = inventoryMap[product.id];
        const available = inv ? inv.available : 0;
        const currentQty = branchOrders.reduce((sum, b) =>
          sum + b.products.filter(p => p.variation_id === product.id).reduce((s, p) => s + p.quantity, 0), 0);
        if (currentQty >= available) {
          showToast(`สินค้านี้เหลือ stock ${available} ไม่สามารถเพิ่มได้อีก`, 'error');
          return;
        }
      }
      newBranchOrders[branchIndex].products[existingProductIndex].quantity += 1;
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
        image: product.image,
        quantity: 1,
        unit_price,
        discount_value,
        discount_type: 'percent'
      };

      newBranchOrders[branchIndex].products.push(newProduct);
      setBranchOrders(newBranchOrders);
    }

    // Note: search clearing and re-focus are handled by ProductSearchInput component
  };

  const handleRemoveProductFromBranch = (branchIndex: number, productIndex: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].products = newBranchOrders[branchIndex].products.filter(
      (_, i) => i !== productIndex
    );
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductQuantity = (branchIndex: number, productIndex: number, quantity: number) => {
    let finalQty = Math.max(1, quantity);

    if (!allowOversell && stockEnabled && selectedWarehouseId) {
      const variationId = branchOrders[branchIndex].products[productIndex].variation_id;
      const inv = inventoryMap[variationId];
      const available = inv ? inv.available : 0;
      // Sum qty of this product in other branches/rows (excluding current)
      const otherQty = branchOrders.reduce((sum, b, bi) =>
        sum + b.products.reduce((s, p, pi) =>
          (bi === branchIndex && pi === productIndex) ? s : (p.variation_id === variationId ? s + p.quantity : s), 0), 0);
      const maxAllowed = Math.max(1, available - otherQty);
      if (finalQty > maxAllowed) {
        finalQty = maxAllowed;
        showToast(`stock เหลือ ${available} จำกัดจำนวนที่ ${maxAllowed}`, 'error');
      }
    }

    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].products[productIndex].quantity = finalQty;
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductPrice = (branchIndex: number, productIndex: number, price: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].products[productIndex].unit_price = Math.max(0, price);
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductDiscount = (branchIndex: number, productIndex: number, value: number) => {
    const newBranchOrders = [...branchOrders];
    const product = newBranchOrders[branchIndex].products[productIndex];
    if (product.discount_type === 'percent') {
      product.discount_value = Math.max(0, Math.min(100, value));
    } else {
      product.discount_value = Math.max(0, value);
    }
    setBranchOrders(newBranchOrders);
  };

  const handleToggleProductDiscountType = (branchIndex: number, productIndex: number) => {
    const newBranchOrders = [...branchOrders];
    const product = newBranchOrders[branchIndex].products[productIndex];
    product.discount_type = product.discount_type === 'percent' ? 'amount' : 'percent';
    product.discount_value = 0;
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateBranchShippingFee = (branchIndex: number, fee: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].shipping_fee = Math.max(0, fee);
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
  const subtotal = Math.round((totalWithVAT / 1.07) * 100) / 100;
  const vat = totalWithVAT - subtotal;
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
    // Check that at least one product exists
    if (branchOrders.length === 0 || branchOrders.every(b => b.products.length === 0)) {
      errors.branches = 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ';
    }
    // In branch mode with customer selected: validate each branch has products
    if (multiBranch && selectedCustomer && shippingAddresses.length > 0) {
      for (let i = 0; i < branchOrders.length; i++) {
        if (branchOrders[i].products.length === 0) {
          errors[`branch_${i}`] = `กรุณาเพิ่มสินค้าสำหรับสาขา: ${branchOrders[i].address_name}`;
          if (!errors.branches) errors.branches = errors[`branch_${i}`];
        }
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      // Scroll to first error
      if (errors.customer) {
        customerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (errors.deliveryDate) {
        deliveryDateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (errors.branches || Object.keys(errors).some(k => k.startsWith('branch_'))) {
        branchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    try {
      setSaving(true);

      const items = branchOrders.flatMap(branch =>
        branch.products.map(product => ({
          variation_id: product.variation_id,
          product_id: product.product_id,
          product_code: product.product_code,
          product_name: product.product_name,
          variation_label: product.variation_label,
          quantity: product.quantity,
          unit_price: product.unit_price,
          discount_value: product.discount_value,
          discount_type: product.discount_type,
          // Only include shipments when customer is selected (has shipping address)
          shipments: selectedCustomer ? [{
            shipping_address_id: branch.shipping_address_id,
            quantity: product.quantity,
            shipping_fee: branch.shipping_fee || 0
          }] : []
        }))
      );

      const orderData: any = {
        ...(selectedCustomer ? { customer_id: selectedCustomer.id } : {}),
        delivery_date: deliveryDate || undefined,
        discount_amount: calculateOrderDiscount(),
        order_discount_type: orderDiscountType,
        notes: notes || undefined,
        internal_notes: internalNotes || undefined,
        items,
        ...(stockEnabled && selectedWarehouseId ? { warehouse_id: selectedWarehouseId } : {}),
        // Non-customer: send shipping fee directly
        ...(!selectedCustomer ? { shipping_fee: branchOrders[0]?.shipping_fee || 0 } : {}),
        // Delivery info (both customer & non-customer)
        ...(deliveryName ? {
          delivery_name: deliveryName,
          delivery_phone: deliveryPhone || undefined,
          delivery_address: deliveryAddress || undefined,
          delivery_district: deliveryDistrict || undefined,
          delivery_amphoe: deliveryAmphoe || undefined,
          delivery_province: deliveryProvince || undefined,
          delivery_postal_code: deliveryPostalCode || undefined,
          delivery_email: deliveryEmail || undefined,
        } : {}),
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
          setTimeout(() => onSuccess(newOrderId), 1000);
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
    if (editOrderSource === 'shopee') {
      return (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 text-orange-800 dark:text-orange-300 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <img src="/marketplace/shopee.svg" alt="Shopee" className="w-4 h-4" />
          คำสั่งซื้อ {editOrderNumber} — ออเดอร์จาก Shopee ไม่สามารถแก้ไขได้
        </div>
      );
    }
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

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      c.customer_code.toLowerCase().includes(q) ||
      (c.phone && c.phone.replace(/[-\s]/g, '').includes(q.replace(/[-\s]/g, '')));
  });

  const getVariationLabelDisplay = (variationLabel?: string) => {
    return variationLabel || '';
  };

  const getStockBadge = (variationId: string, orderQty: number) => {
    if (!stockEnabled || !selectedWarehouseId) return null;
    const inv = inventoryMap[variationId];
    const available = inv ? inv.available : 0;
    const isLow = available > 0 && orderQty > available;
    const isOut = available <= 0;
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${
        isOut ? 'bg-red-100 text-red-700' :
        isLow ? 'bg-amber-100 text-amber-700' :
        'bg-green-100 text-green-700'
      }`}>
        {isOut ? 'หมด' : `คงเหลือ ${available}`}
        {isLow && <AlertTriangle className="w-3 h-3 inline ml-0.5" />}
      </span>
    );
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
              <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-300">
                <span>ยอดก่อน VAT</span>
                <span>฿{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>VAT 7%</span>
                <span>฿{formatPrice(vat)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1.5 border-t-2 border-black">
                <span>ยอดรวมสุทธิ</span>
                <span>฿{formatPrice(total)}</span>
              </div>
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
      {readOnlyBanner}

      {/* Old customer-first section removed — unified below products */}

      {/* Warehouse Picker — portal into header or inline fallback */}
      {!features.customer_branches && stockEnabled && warehouses.length > 1 && (() => {
        const warehousePicker = (
          <div className="flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => {
                setSelectedWarehouseId(e.target.value);
                fetchInventoryForWarehouse(e.target.value);
              }}
              disabled={isReadOnly}
              className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}{wh.is_default ? ' (ค่าเริ่มต้น)' : ''}
                </option>
              ))}
            </select>
          </div>
        );
        if (warehousePortalRef?.current) {
          return createPortal(warehousePicker, warehousePortalRef.current);
        }
        return <div className="flex justify-end">{warehousePicker}</div>;
      })()}

      {/* Step 2: Branch Orders - Product List */}
      {branchOrders.length > 0 && (
        <div ref={branchSectionRef} className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} overflow-visible`}>
          {/* Branch Header — show branch tabs only when customer has multiple shipping addresses */}
          {multiBranch && selectedCustomer && shippingAddresses.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            {/* Branch Tabs with inline dropdown */}
            <div className="flex items-center gap-1 overflow-visible" ref={branchDropdownRef}>
              {branchOrders.map((branch, index) => {
                const isActive = activeBranchIndex === index;
                const isDropdownOpen = branchDropdownOpen === index;
                return (
                  <div key={index} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isActive) {
                          setActiveBranchIndex(index);
                          setBranchDropdownOpen(null);
                        } else if (shippingAddresses.length > 0 && !isReadOnly) {
                          setBranchDropdownOpen(isDropdownOpen ? null : index);
                        }
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-[#F4511E] text-white'
                          : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {branch.address_name}
                      {branch.products.length > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isActive ? 'bg-[#1A1A2E]/20' : 'bg-gray-200'
                        }`}>
                          {branch.products.length}
                        </span>
                      )}
                      {isActive && shippingAddresses.length > 0 && !isReadOnly && (
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                    {/* Dropdown to change address */}
                    {isDropdownOpen && (() => {
                      const usedIds = branchOrders.map(b => b.shipping_address_id).filter(id => id !== branch.shipping_address_id);
                      return (
                        <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg min-w-[200px] py-1">
                          {shippingAddresses
                            .filter(addr => !usedIds.includes(addr.id))
                            .map(addr => (
                              <button
                                key={addr.id}
                                type="button"
                                onClick={() => {
                                  handleUpdateBranchAddress(index, addr.id);
                                  setBranchDropdownOpen(null);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                                  branch.shipping_address_id === addr.id
                                    ? 'bg-[#F4511E]/10 text-[#F4511E] font-medium'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate">{addr.address_name}</span>
                              </button>
                            ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {!isReadOnly && (
              <div className="flex items-center gap-1.5 ml-2">
                {branchOrders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBranch(activeBranchIndex)}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    title="ลบสาขานี้"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddBranch}
                  disabled={!canAddBranch}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap bg-blue-50 text-blue-700 dark:text-blue-400 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-50"
                  title={!canAddBranch ? (shippingAddresses.length <= 1 ? 'ลูกค้ามีสาขาเดียว' : 'เพิ่มครบทุกสาขาแล้ว') : 'เพิ่มสาขา'}
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มสาขา
                </button>
              </div>
            )}
          </div>
          )}

          {/* Active Branch Content */}
          {branchOrders.map((branch, branchIndex) => (
            <div
              key={branchIndex}
              className={branchIndex === activeBranchIndex ? 'block' : 'hidden'}
            >

              {/* Products List */}
              {embedded ? (
                /* Embedded mode: card layout — product name full width, inputs below */
                <div className="divide-y divide-gray-100">
                  {branch.products.map((product, productIndex) => {
                    const capacityDisplay = getVariationLabelDisplay(product.variation_label);
                    return (
                      <div key={product.variation_id} className="px-3 py-2.5 hover:bg-gray-50/50">
                        {/* Row 1: Image + Product name + delete */}
                        <div className="flex items-start gap-2 mb-1.5">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.product_name}
                              className="w-10 h-10 object-cover rounded flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setLightboxImage(product.image!)}
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                              {product.product_name}{capacityDisplay && ` - ${capacityDisplay}`}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400 dark:text-slate-500">{product.product_code}</span>
                              {getStockBadge(product.variation_id, product.quantity)}
                            </div>
                          </div>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleRemoveProductFromBranch(branchIndex, productIndex)}
                              className="text-gray-400 hover:text-red-600 p-0.5 rounded transition-colors flex-shrink-0 mt-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {/* Row 2: Qty, Price, Discount, Total */}
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={(el) => { quantityInputRefs.current[`${branchIndex}-${productIndex}`] = el; }}
                            type="number"
                            min="1"
                            value={product.quantity}
                            onChange={(e) => handleUpdateProductQuantity(branchIndex, productIndex, parseInt(e.target.value) || 1)}
                            disabled={isReadOnly}
                            className="w-12 px-1 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                          />
                          <span className="text-gray-400 dark:text-slate-500 text-xs">&times;</span>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={product.unit_price}
                              onChange={(e) => handleUpdateProductPrice(branchIndex, productIndex, parseFloat(e.target.value) || 0)}
                              disabled={isReadOnly}
                              className="w-16 px-1 pr-4 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                            />
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-xs pointer-events-none">฿</span>
                          </div>
                          <div className="flex items-stretch">
                            <input
                              type="number"
                              min="0"
                              max={product.discount_type === 'percent' ? 100 : undefined}
                              step="0.01"
                              value={product.discount_value}
                              onChange={(e) => handleUpdateProductDiscount(branchIndex, productIndex, parseFloat(e.target.value) || 0)}
                              disabled={isReadOnly}
                              className="w-10 px-1 py-1.5 border border-gray-300 dark:border-slate-600 rounded-l-lg border-r-0 text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:z-10 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleToggleProductDiscountType(branchIndex, productIndex)}
                              disabled={isReadOnly}
                              className="px-1.5 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-500 transition-colors min-w-[24px] flex items-center justify-center disabled:opacity-50"
                              title={product.discount_type === 'percent' ? 'เปลี่ยนเป็นจำนวนเงิน' : 'เปลี่ยนเป็นเปอร์เซ็นต์'}
                            >
                              {product.discount_type === 'percent' ? '%' : '฿'}
                            </button>
                          </div>
                          <span className="ml-auto text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                            {formatPrice(calculateProductTotal(product))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Full page mode: table layout */
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead className="data-thead">
                      <tr>
                        <th className="data-th">สินค้า</th>
                        <th className="data-th text-center w-20">จำนวน</th>
                        <th className="data-th text-right w-28">ราคา</th>
                        <th className="data-th text-center w-28">ส่วนลด</th>
                        <th className="data-th text-right w-28">รวม</th>
                        <th className="data-th w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="data-tbody">
                      {branch.products.map((product, productIndex) => {
                        const capacityDisplay = getVariationLabelDisplay(product.variation_label);
                        return (
                          <tr key={product.variation_id} className="data-tr">
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2.5">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.product_name}
                                    className="w-12 h-12 object-cover rounded flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => setLightboxImage(product.image!)}
                                  />
                                ) : (
                                  <div className="w-12 h-12 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                                    <Package className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                                    {product.product_name}{capacityDisplay && ` - ${capacityDisplay}`}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-400 dark:text-slate-500">{product.product_code}</span>
                                    {getStockBadge(product.variation_id, product.quantity)}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                ref={(el) => { quantityInputRefs.current[`${branchIndex}-${productIndex}`] = el; }}
                                type="number"
                                min="1"
                                value={product.quantity}
                                onChange={(e) => handleUpdateProductQuantity(branchIndex, productIndex, parseInt(e.target.value) || 1)}
                                disabled={isReadOnly}
                                className="w-16 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="relative inline-block">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={product.unit_price}
                                  onChange={(e) => handleUpdateProductPrice(branchIndex, productIndex, parseFloat(e.target.value) || 0)}
                                  disabled={isReadOnly}
                                  className="w-24 px-2 pr-5 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-xs pointer-events-none">฿</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-stretch justify-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={product.discount_type === 'percent' ? 100 : undefined}
                                  step="0.01"
                                  value={product.discount_value}
                                  onChange={(e) => handleUpdateProductDiscount(branchIndex, productIndex, parseFloat(e.target.value) || 0)}
                                  disabled={isReadOnly}
                                  className="w-16 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-l-lg border-r-0 text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:z-10 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleToggleProductDiscountType(branchIndex, productIndex)}
                                  disabled={isReadOnly}
                                  className="px-2.5 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-500 transition-colors min-w-[28px] flex items-center justify-center disabled:opacity-50"
                                  title={product.discount_type === 'percent' ? 'เปลี่ยนเป็นจำนวนเงิน' : 'เปลี่ยนเป็นเปอร์เซ็นต์'}
                                >
                                  {product.discount_type === 'percent' ? '%' : '฿'}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                              {formatPrice(calculateProductTotal(product))}
                            </td>
                            <td className="px-2 py-3 text-center">
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProductFromBranch(branchIndex, productIndex)}
                                  className="text-gray-400 hover:text-red-600 p-1 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add Product Search */}
              {!isReadOnly && <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
                <ProductSearchInput
                  products={products}
                  onSelect={(p) => handleAddProductToBranch(branchIndex, p as Product)}
                  placeholder="เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
                  searchFields={[]}
                  formatSubtitle={(p) => {
                    const parts = [p.code];
                    if (p.default_price != null) parts.push(`฿${formatNumber(p.default_price)}`);
                    return parts.join(' · ');
                  }}
                  isDisabled={(p) => !allowOversell && stockEnabled && !!selectedWarehouseId && ((inventoryMap[p.id]?.available ?? 0) <= 0)}
                  renderExtra={(p) => {
                    if (!stockEnabled || !selectedWarehouseId) return null;
                    const avail = inventoryMap[p.id]?.available ?? 0;
                    return (
                      <span className={`px-1 py-0.5 rounded text-[10px] flex-shrink-0 ${
                        avail <= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {avail <= 0 ? 'หมด' : `stock ${avail}`}
                      </span>
                    );
                  }}
                />
              </div>}

              {branch.products.length === 0 && !isReadOnly && (
                <div className={`text-center py-8 ${fieldErrors[`branch_${branchIndex}`] ? 'text-red-400' : 'text-gray-400'}`}>
                  <Package className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">{fieldErrors[`branch_${branchIndex}`] || 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน'}</p>
                </div>
              )}

              {/* Shipping Fee + Branch Total — only in branch mode with customer */}
              {multiBranch && selectedCustomer && shippingAddresses.length > 0 && branch.products.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 dark:bg-slate-700/50 border-t dark:border-slate-600 space-y-1.5">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400">ค่าจัดส่ง</span>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-xs">฿</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={branch.shipping_fee || ''}
                        onChange={(e) => handleUpdateBranchShippingFee(branchIndex, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        disabled={isReadOnly}
                        className="w-24 pl-5 pr-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-sm font-medium text-gray-500 dark:text-slate-400">
                      ยอดรวมสาขา {branch.address_name}
                    </span>
                    <span className="text-lg font-bold text-[#F4511E]">
                      ฿{formatPrice(calculateBranchTotal(branch) + (branch.shipping_fee || 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step 3: Summary */}
      {branchOrders.length > 0 && branchOrders.some(b => b.products.length > 0) && (
        <div className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
          <div className="grid grid-cols-1 md:grid-cols-[1fr,320px] gap-4">
            {/* Notes */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  หมายเหตุ <span className="text-gray-400 dark:text-slate-500 font-normal">(แสดงในบิล / การจัดส่ง)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-sm disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                  placeholder="หมายเหตุสำหรับลูกค้า, การจัดส่ง..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-orange-700 dark:text-orange-400 mb-1">
                  หมายเหตุภายใน <span className="text-orange-400 dark:text-orange-500 font-normal">(ไม่แสดงในบิล)</span>
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2.5 border border-orange-300 dark:border-orange-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm bg-orange-50 dark:bg-orange-900/20 text-gray-900 dark:text-slate-200 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500 disabled:border-gray-300 dark:disabled:border-slate-600"
                  placeholder="หมายเหตุภายใน..."
                />
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">สรุปคำสั่งซื้อ</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                  <span>ยอดรวมสินค้า (รวม VAT)</span>
                  <span>฿{formatPrice(itemsTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-500 dark:text-slate-400">
                  <span>ค่าจัดส่ง</span>
                  {/* Show inline input when single branch, show total when multiple branches */}
                  {branchOrders.length <= 1 ? (
                    <div className="relative w-[108px]">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={branchOrders[0]?.shipping_fee || ''}
                        onChange={(e) => handleUpdateBranchShippingFee(0, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        disabled={isReadOnly}
                        className="w-full px-2 pr-7 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-slate-500 pointer-events-none">฿</span>
                    </div>
                  ) : (
                    <span>฿{formatPrice(totalShippingFee)}</span>
                  )}
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
                <div className="flex justify-between text-gray-500 dark:text-slate-400 pt-2 border-t border-gray-200 dark:border-slate-600">
                  <span>ยอดก่อน VAT</span>
                  <span>฿{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                  <span>VAT 7%</span>
                  <span>฿{formatPrice(vat)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100">
                  <span>ยอดรวมสุทธิ</span>
                  <span className="text-[#F4511E]">฿{formatPrice(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer + Delivery section — 2 columns */}
      <div className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
        {/* Delivery info — show when NOT in multi-branch mode */}
        {!multiBranch ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left column: ลูกค้า + ชื่อผู้รับ + เบอร์ + อีเมล + วันส่ง */}
          <div className="space-y-3">
            {/* Customer Search */}
            <div ref={customerSectionRef} className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                ลูกค้า <span className="text-gray-400 text-xs font-normal">(ไม่บังคับ)</span>
              </label>
              {selectedCustomer ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-slate-200">{selectedCustomer.name}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">{selectedCustomer.customer_code}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}</span>
                  </div>
                  {!isReadOnly && (
                    <button type="button" onClick={handleCopyLatestOrder} disabled={loadingLatestOrder} className="p-1.5 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50" title="คัดลอก Order ล่าสุด">
                      {loadingLatestOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {/* Multi-branch toggle */}
                  {features.customer_branches && shippingAddresses.length > 0 && !isReadOnly && (
                    <button type="button" onClick={() => handleMultiBranchToggle(!multiBranch)} className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600">
                      <div className="relative w-7 h-4 rounded-full bg-gray-300 dark:bg-slate-500 transition-colors">
                        <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-all" />
                      </div>
                      หลายสาขา
                    </button>
                  )}
                  {!isReadOnly && !preselectedCustomerId && (
                    <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setShippingAddresses([]); setSelectedAddressId(''); setCustomerPrices({}); }} className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded transition-colors">
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type="text" value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }} onFocus={() => setShowCustomerDropdown(true)} placeholder="ค้นหาชื่อ, รหัส, หรือเบอร์โทร..." className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200" disabled={(!!preselectedCustomerId || isEditMode) && !!selectedCustomer} />
                </div>
              )}
              {showCustomerDropdown && customerSearch && !selectedCustomer && !preselectedCustomerId && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">ไม่พบลูกค้า</div>
                  ) : (
                    filteredCustomers.map(customer => (
                      <button key={customer.id} type="button" onClick={() => handleSelectCustomer(customer)} className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <div className="text-sm font-medium text-gray-900 dark:text-slate-200">{customer.name}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">{customer.customer_code}{customer.phone ? ` · ${customer.phone}` : ''}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* ชื่อผู้รับ */}
            <div>
              <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">ชื่อผู้รับ</label>
              <input type="text" value={deliveryName} onChange={(e) => setDeliveryName(e.target.value)} placeholder="ชื่อ-นามสกุล" disabled={isReadOnly} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800" />
            </div>
            {/* เบอร์โทร + อีเมล */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">เบอร์โทร</label>
                <input type="tel" value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} placeholder="0xx-xxx-xxxx" disabled={isReadOnly} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">อีเมล</label>
                <input type="email" value={deliveryEmail} onChange={(e) => setDeliveryEmail(e.target.value)} placeholder="email@example.com" disabled={isReadOnly} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800" />
              </div>
            </div>

            {/* Delivery Date */}
            {features.delivery_date.enabled && (
            <div ref={deliveryDateRef}>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                วันที่ส่งของ {features.delivery_date.required && <span className="text-red-500">*</span>}
              </label>
              <div className={fieldErrors.deliveryDate ? 'ring-2 ring-red-400 rounded-lg' : ''}>
                <DateRangePicker value={deliveryDateValue} onChange={(val) => { setDeliveryDateValue(val); setFieldErrors(prev => { const { deliveryDate, ...rest } = prev; return rest; }); }} asSingle={true} useRange={false} showShortcuts={false} showFooter={false} placeholder="เลือกวันที่ส่ง" disabled={isReadOnly} />
              </div>
              {fieldErrors.deliveryDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.deliveryDate}</p>}
            </div>
            )}

            {!selectedCustomer && (
              <p className="text-sm text-gray-400 dark:text-slate-500">ไม่เลือกลูกค้า = ส่ง Bill Online ให้ลูกค้ากรอกเอง</p>
            )}
          </div>

          {/* Right column: ที่อยู่จัดส่ง */}
          <div className="space-y-3 md:border-l md:border-gray-200 md:dark:border-slate-700 md:pl-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">ที่อยู่จัดส่ง</label>

            {selectedCustomer && shippingAddresses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {shippingAddresses.map(addr => (
                  <button key={addr.id} type="button" onClick={() => { setSelectedAddressId(addr.id); setDeliveryName(addr.contact_person || selectedCustomer.name); setDeliveryPhone(addr.phone || selectedCustomer.phone || ''); setDeliveryAddress(addr.address_line1 || ''); setDeliveryDistrict(addr.district || ''); setDeliveryAmphoe(addr.amphoe || ''); setDeliveryProvince(addr.province || ''); setDeliveryPostalCode(addr.postal_code || ''); }} className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${selectedAddressId === addr.id ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] font-medium' : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-gray-400 dark:hover:border-slate-500'}`}>
                    <MapPin className="w-3 h-3 inline mr-1" />{addr.address_name}
                  </button>
                ))}
                <button type="button" onClick={() => { setSelectedAddressId('new'); setDeliveryName(''); setDeliveryPhone(''); setDeliveryEmail(''); setDeliveryAddress(''); setDeliveryDistrict(''); setDeliveryAmphoe(''); setDeliveryProvince(''); setDeliveryPostalCode(''); }} className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${selectedAddressId === 'new' ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] font-medium' : 'border-dashed border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E]'}`}>
                  <Plus className="w-3 h-3 inline mr-1" />ที่อยู่ใหม่
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">ที่อยู่ (บ้านเลขที่ ซอย ถนน)</label>
              <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} onPaste={(e) => { const pasted = e.clipboardData.getData('text'); if (pasted.length > 10) { const parsed = parseThaiAddress(pasted); if (parsed) { e.preventDefault(); setDeliveryAddress(parsed.address); setDeliveryDistrict(parsed.district); setDeliveryAmphoe(parsed.amphoe); setDeliveryProvince(parsed.province); setDeliveryPostalCode(parsed.postal_code); } } }} placeholder="วางที่อยู่ยาวๆ ได้เลย — ระบบจะแยก ตำบล อำเภอ จังหวัด ให้อัตโนมัติ" disabled={isReadOnly} rows={2} className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800 resize-none" />
            </div>
            <ThaiAddressInput district={deliveryDistrict} amphoe={deliveryAmphoe} province={deliveryProvince} postalCode={deliveryPostalCode} onAddressChange={(addr) => { if (addr.district !== undefined) setDeliveryDistrict(addr.district); if (addr.amphoe !== undefined) setDeliveryAmphoe(addr.amphoe); if (addr.province !== undefined) setDeliveryProvince(addr.province); if (addr.postalCode !== undefined) setDeliveryPostalCode(addr.postalCode); }} disabled={isReadOnly} />
          </div>
        </div>
        ) : (
        /* Multi-branch mode: just customer + delivery date */
        <div className="space-y-3">
          <div ref={customerSectionRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              ลูกค้า <span className="text-gray-400 text-xs font-normal">(ไม่บังคับ)</span>
            </label>
            {selectedCustomer && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg">
                <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-200">{selectedCustomer.name}</span>
                  <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">{selectedCustomer.customer_code}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}</span>
                  {shippingAddresses.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-slate-400 ml-2"><MapPin className="w-3 h-3 inline mr-0.5" />{shippingAddresses.length} สาขา</span>
                  )}
                </div>
                {!isReadOnly && (
                  <button type="button" onClick={handleCopyLatestOrder} disabled={loadingLatestOrder} className="p-1.5 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50" title="คัดลอก Order ล่าสุด">
                    {loadingLatestOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
                {/* Multi-branch toggle — ON state */}
                <button type="button" onClick={() => handleMultiBranchToggle(false)} className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap bg-[#F4511E] text-white">
                  <div className="relative w-7 h-4 rounded-full bg-white/30 transition-colors">
                    <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-white transition-all" />
                  </div>
                  หลายสาขา
                </button>
                {!isReadOnly && !preselectedCustomerId && (
                  <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setShippingAddresses([]); setSelectedAddressId(''); setCustomerPrices({}); handleMultiBranchToggle(false); }} className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded transition-colors">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
              </div>
            )}
          </div>

          {features.delivery_date.enabled && (
          <div ref={deliveryDateRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              วันที่ส่งของ {features.delivery_date.required && <span className="text-red-500">*</span>}
            </label>
            <div className={fieldErrors.deliveryDate ? 'ring-2 ring-red-400 rounded-lg' : ''}>
              <DateRangePicker value={deliveryDateValue} onChange={(val) => { setDeliveryDateValue(val); setFieldErrors(prev => { const { deliveryDate, ...rest } = prev; return rest; }); }} asSingle={true} useRange={false} showShortcuts={false} showFooter={false} placeholder="เลือกวันที่ส่ง" disabled={isReadOnly} />
            </div>
            {fieldErrors.deliveryDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.deliveryDate}</p>}
          </div>
          )}
        </div>
        )}
      </div>

      {/* Action Buttons */}
      {!isReadOnly && branchOrders.length > 0 && branchOrders.some(b => b.products.length > 0) && (
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
                    }}
                    className="w-full px-4 py-2.5 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    ส่งบิลให้ลูกค้า
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowSuccessModal(false);
                    if (onSuccess) {
                      onSuccess(savedOrderId);
                    } else {
                      router.push(`/orders/${savedOrderId}`);
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-lg transition-colors font-medium ${
                    onSendBillToChat
                      ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                      : 'bg-[#F4511E] text-white hover:bg-[#D63B0E]'
                  }`}
                >
                  ดูคำสั่งซื้อ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
    </>
  );
}
