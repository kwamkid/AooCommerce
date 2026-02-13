'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
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
  Send
} from 'lucide-react';

// Interfaces
interface Customer {
  id: string;
  customer_code: string;
  name: string;
  contact_person?: string;
  phone?: string;
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
  bottle_size?: string;
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
  bottle_size?: string;
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
  // Callback when order is created/updated successfully
  onSuccess?: (orderId: string) => void;
  // Callback when cancelled
  onCancel?: () => void;
  // Embedded mode (no back button, different styling)
  embedded?: boolean;
  // Callback to send bill to customer via LINE Chat (only from LINE Chat new order)
  onSendBillToChat?: (orderId: string, orderNumber: string, billUrl: string) => void;
}

export default function OrderForm({
  preselectedCustomerId,
  initialOrderData,
  editOrderId,
  onSuccess,
  onCancel,
  embedded = false,
  onSendBillToChat
}: OrderFormProps) {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();

  // State
  const [loading, setLoading] = useState(!!editOrderId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedOrderId, setSavedOrderId] = useState('');
  const [savedOrderNumber, setSavedOrderNumber] = useState('');
  const [billLinkCopied, setBillLinkCopied] = useState(false);

  // Edit mode
  const [editOrderNumber, setEditOrderNumber] = useState('');
  const [editOrderStatus, setEditOrderStatus] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const isEditMode = !!editOrderId;
  const isReadOnly = isEditMode && (editOrderStatus !== 'new' || editPaymentStatus !== 'pending');

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

  // Product search per branch
  const [productSearches, setProductSearches] = useState<string[]>([]);
  const [showProductDropdowns, setShowProductDropdowns] = useState<boolean[]>([]);
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
  const productSearchRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const deliveryDateRef = useRef<HTMLDivElement>(null);
  const branchSectionRef = useRef<HTMLDivElement>(null);

  // Fetch customers and products
  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchCustomers();
      fetchProducts();
    }
  }, [authLoading, userProfile]);

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
            const { data: sessionData } = await supabase.auth.getSession();
            const response = await fetch(`/api/customer-prices?customer_id=${customer.id}`, {
              headers: { 'Authorization': `Bearer ${sessionData?.session?.access_token || ''}` }
            });
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
        setProductSearches(initialOrderData.branches.map(() => ''));
        setShowProductDropdowns(initialOrderData.branches.map(() => false));

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
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Fetch order details
        const response = await fetch(`/api/orders?id=${editOrderId}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch order');

        const result = await response.json();
        const order = result.order;
        if (!order) throw new Error('Order not found');

        setEditOrderNumber(order.order_number);
        setEditOrderStatus(order.order_status);
        setEditPaymentStatus(order.payment_status || 'pending');

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

        // Fetch shipping addresses
        if (order.customer?.id) {
          const addrResponse = await fetch(`/api/shipping-addresses?customer_id=${order.customer.id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (addrResponse.ok) {
            const addrResult = await addrResponse.json();
            setShippingAddresses(addrResult.addresses || []);
          }

          // Fetch customer prices
          const priceResponse = await fetch(`/api/customer-prices?customer_id=${order.customer.id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (priceResponse.ok) {
            const priceResult = await priceResponse.json();
            setCustomerPrices(priceResult.prices || {});
          }
        }

        // Fetch products (needed for product search)
        await fetchProducts();

        // Convert order items to branch structure
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
            const existingProduct = branch.products.find(p => p.variation_id === item.variation_id);
            if (!existingProduct) {
              branch.products.push({
                variation_id: item.variation_id,
                product_id: item.product_id,
                product_code: item.product_code,
                product_name: item.product_name,
                bottle_size: item.bottle_size,
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
        setProductSearches(branches.map(() => ''));
        setShowProductDropdowns(branches.map(() => false));
      } catch (error) {
        console.error('Error loading order:', error);
        setError('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [editOrderId, authLoading, userProfile]);

  const fetchCustomers = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/customers?active=true', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionData?.session?.access_token || ''}`
        }
      });
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const productsResponse = await fetch('/api/products', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

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
            bottle_size: sp.simple_bottle_size,
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
              code: `${sp.code}-${v.bottle_size}`,
              name: sp.name,
              image: v.image_url || sp.main_image_url || sp.image,
              bottle_size: v.bottle_size,
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

  const fetchShippingAddresses = async (customerId: string, forceInit: boolean = true) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/shipping-addresses?customer_id=${customerId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

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
          setProductSearches(['']);
          setShowProductDropdowns([false]);
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
    setBranchOrders([]);
    setProductSearches([]);
    setShowProductDropdowns([]);
    setShippingAddresses([]);

    fetchShippingAddresses(customer.id);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`/api/customer-prices?customer_id=${customer.id}`, {
        headers: { 'Authorization': `Bearer ${sessionData?.session?.access_token || ''}` }
      });
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
      setError('');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch latest order for this customer
      const response = await fetch(`/api/orders?customer_id=${selectedCustomer.id}&limit=1`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch orders');

      const result = await response.json();
      const orders = result.orders || [];

      if (orders.length === 0) {
        setError('ลูกค้านี้ยังไม่มีคำสั่งซื้อเก่า');
        setTimeout(() => setError(''), 3000);
        return;
      }

      const latestOrder = orders[0];

      // Fetch full order details
      const detailResponse = await fetch(`/api/orders?id=${latestOrder.id}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

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
              bottle_size: item.bottle_size,
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
        setError('ไม่พบข้อมูลสินค้าใน Order เก่า');
        setTimeout(() => setError(''), 3000);
        return;
      }

      // Set branch orders
      setBranchOrders(branches);
      setProductSearches(branches.map(() => ''));
      setShowProductDropdowns(branches.map(() => false));
      setActiveBranchIndex(0);

      // Set other fields
      if (order.notes) setNotes(order.notes);
      if (order.internal_notes) setInternalNotes(order.internal_notes);
      if (order.discount_amount) setOrderDiscount(order.discount_amount);
      if (order.order_discount_type) setOrderDiscountType(order.order_discount_type);

      setSuccess(`คัดลอกจาก ${latestOrder.order_number} สำเร็จ`);
      setTimeout(() => setSuccess(''), 3000);

    } catch (error) {
      console.error('Error copying order:', error);
      setError('ไม่สามารถคัดลอกคำสั่งซื้อได้');
      setTimeout(() => setError(''), 3000);
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
    setProductSearches([...productSearches, '']);
    setShowProductDropdowns([...showProductDropdowns, false]);
    setActiveBranchIndex(branchOrders.length);
  };

  const handleRemoveBranch = (index: number) => {
    if (branchOrders.length === 1) {
      setError('ต้องมีอย่างน้อย 1 สาขา');
      setTimeout(() => setError(''), 3000);
      return;
    }
    setBranchOrders(branchOrders.filter((_, i) => i !== index));
    setProductSearches(productSearches.filter((_, i) => i !== index));
    setShowProductDropdowns(showProductDropdowns.filter((_, i) => i !== index));
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
    const existingProductIndex = branchOrders[branchIndex].products.findIndex(
      p => p.variation_id === product.id
    );

    const newBranchOrders = [...branchOrders];

    if (existingProductIndex !== -1) {
      // Duplicate → increment quantity (barcode scan behavior)
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
        bottle_size: product.bottle_size,
        image: product.image,
        quantity: 1,
        unit_price,
        discount_value,
        discount_type: 'percent'
      };

      newBranchOrders[branchIndex].products.push(newProduct);
      setBranchOrders(newBranchOrders);
    }

    // Clear search and close dropdown
    const newSearches = [...productSearches];
    newSearches[branchIndex] = '';
    setProductSearches(newSearches);
    const newDropdowns = [...showProductDropdowns];
    newDropdowns[branchIndex] = false;
    setShowProductDropdowns(newDropdowns);

    // Focus back to product search input for next scan/search
    setTimeout(() => {
      const searchInput = productSearchRefs.current[branchIndex];
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  };

  const handleRemoveProductFromBranch = (branchIndex: number, productIndex: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].products = newBranchOrders[branchIndex].products.filter(
      (_, i) => i !== productIndex
    );
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductQuantity = (branchIndex: number, productIndex: number, quantity: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].products[productIndex].quantity = Math.max(1, quantity);
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
    if (!selectedCustomer) errors.customer = 'กรุณาเลือกลูกค้า';
    if (!deliveryDate) errors.deliveryDate = 'กรุณาเลือกวันที่ส่งของ';
    if (branchOrders.length === 0) errors.branches = 'กรุณาเพิ่มอย่างน้อย 1 สาขา';
    for (let i = 0; i < branchOrders.length; i++) {
      if (branchOrders[i].products.length === 0) {
        errors[`branch_${i}`] = `กรุณาเพิ่มสินค้าสำหรับสาขา: ${branchOrders[i].address_name}`;
        if (!errors.branches) errors.branches = errors[`branch_${i}`];
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
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const items = branchOrders.flatMap(branch =>
        branch.products.map(product => ({
          variation_id: product.variation_id,
          product_id: product.product_id,
          product_code: product.product_code,
          product_name: product.product_name,
          bottle_size: product.bottle_size,
          quantity: product.quantity,
          unit_price: product.unit_price,
          discount_value: product.discount_value,
          discount_type: product.discount_type,
          shipments: [{
            shipping_address_id: branch.shipping_address_id,
            quantity: product.quantity,
            shipping_fee: branch.shipping_fee || 0
          }]
        }))
      );

      const orderData: any = {
        customer_id: selectedCustomer!.id,
        delivery_date: deliveryDate || undefined,
        discount_amount: calculateOrderDiscount(),
        order_discount_type: orderDiscountType,
        notes: notes || undefined,
        internal_notes: internalNotes || undefined,
        items
      };

      if (isEditMode) {
        orderData.id = editOrderId;
      }

      const response = await fetch('/api/orders', {
        method: isEditMode ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(orderData)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

      const newOrderId = result.order?.id || result.id || editOrderId!;

      if (isEditMode) {
        setSuccess('บันทึกการแก้ไขสำเร็จ');
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
      setError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
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
        <Loader2 className="w-8 h-8 text-[#E9B308] animate-spin" />
      </div>
    );
  }

  // Read-only banner (shown when order can't be edited)
  const readOnlyBanner = (() => {
    if (!isReadOnly) return null;
    const statusLabels: Record<string, string> = { new: 'ใหม่', shipping: 'กำลังส่ง', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
    const paymentLabels: Record<string, string> = { pending: 'รอชำระ', verifying: 'รอตรวจสอบ', paid: 'ชำระแล้ว', cancelled: 'ยกเลิก' };
    const reasonMessage = editOrderStatus !== 'new'
      ? `สถานะออเดอร์ "${statusLabels[editOrderStatus] || editOrderStatus}"`
      : `สถานะชำระเงิน "${paymentLabels[editPaymentStatus] || editPaymentStatus}"`;
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
        คำสั่งซื้อ {editOrderNumber} ({reasonMessage}) — ไม่สามารถแก้ไขได้
      </div>
    );
  })();

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.customer_code.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const getBottleSizeDisplay = (bottleSize?: string) => {
    return bottleSize || '';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Server error (API errors only) */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {readOnlyBanner}

      {/* Step 1: Customer + Delivery Date */}
      <div className={`bg-white rounded-lg ${embedded ? '' : 'border border-gray-200'} p-4`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Customer Search */}
          <div ref={customerSectionRef} className="relative md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ลูกค้า <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => {
                  setShowCustomerDropdown(true);
                  setFieldErrors(prev => { const { customer, ...rest } = prev; return rest; });
                }}
                placeholder="ค้นหาชื่อลูกค้าหรือรหัส..."
                className={`w-full pl-9 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308] text-sm ${fieldErrors.customer ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                disabled={(!!preselectedCustomerId || isEditMode) && !!selectedCustomer}
              />
            </div>
            {fieldErrors.customer && (
              <p className="text-red-500 text-xs mt-1">{fieldErrors.customer}</p>
            )}
            {showCustomerDropdown && customerSearch && !preselectedCustomerId && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">ไม่พบลูกค้า</div>
                ) : (
                  filteredCustomers.map(customer => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleSelectCustomer(customer)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="text-sm font-medium">{customer.name}</div>
                      <div className="text-xs text-gray-500">{customer.customer_code}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Delivery Date */}
          <div ref={deliveryDateRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              วันที่ส่งของ <span className="text-red-500">*</span>
            </label>
            <div className={fieldErrors.deliveryDate ? 'ring-2 ring-red-400 rounded-lg' : ''}>
              <DateRangePicker
                value={deliveryDateValue}
                onChange={(val) => {
                  setDeliveryDateValue(val);
                  setFieldErrors(prev => { const { deliveryDate, ...rest } = prev; return rest; });
                }}
                asSingle={true}
                useRange={false}
                showShortcuts={false}
                showFooter={false}
                placeholder="เลือกวันที่ส่ง"
                disabled={isReadOnly}
              />
            </div>
            {fieldErrors.deliveryDate && (
              <p className="text-red-500 text-xs mt-1">{fieldErrors.deliveryDate}</p>
            )}
          </div>
        </div>

        {/* Selected customer info */}
        {selectedCustomer && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-gray-500">ผู้ติดต่อ: <span className="text-gray-900 font-medium">{selectedCustomer.contact_person || '-'}</span></span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-500">โทร: <span className="text-gray-900">{selectedCustomer.phone || '-'}</span></span>
              {shippingAddresses.length > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">
                    <MapPin className="w-3.5 h-3.5 inline mr-0.5" />
                    {shippingAddresses.length} สาขา
                  </span>
                </>
              )}
            </div>
            {/* Copy from latest order button */}
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleCopyLatestOrder}
                disabled={loadingLatestOrder}
                className="p-2 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                title="คัดลอก Order ล่าสุด"
              >
                {loadingLatestOrder ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* No Shipping Addresses Warning */}
      {selectedCustomer && shippingAddresses.length === 0 && !isReadOnly && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-medium text-yellow-800">ลูกค้านี้ยังไม่มีที่อยู่จัดส่ง</span>
              <span className="text-yellow-700 text-sm ml-2">กรุณาเพิ่มที่อยู่จัดส่งก่อน</span>
            </div>
            <button
              type="button"
              onClick={() => window.open(`/customers/${selectedCustomer.id}?tab=addresses`, '_blank')}
              className="bg-yellow-600 text-white px-3 py-1.5 rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium whitespace-nowrap"
            >
              เพิ่มที่อยู่
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Branch Orders - Product List */}
      {selectedCustomer && branchOrders.length > 0 && (
        <div ref={branchSectionRef} className={`bg-white rounded-lg ${embedded ? '' : 'border border-gray-200'} overflow-visible`}>
          {/* Branch Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
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
                          ? 'bg-[#E9B308] text-[#00231F]'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {branch.address_name}
                      {branch.products.length > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isActive ? 'bg-[#00231F]/20' : 'bg-gray-200'
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
                        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] py-1">
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
                                    ? 'bg-[#E9B308]/10 text-[#00231F] font-medium'
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-50"
                  title={!canAddBranch ? (shippingAddresses.length <= 1 ? 'ลูกค้ามีสาขาเดียว' : 'เพิ่มครบทุกสาขาแล้ว') : 'เพิ่มสาขา'}
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มสาขา
                </button>
              </div>
            )}
          </div>

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
                    const capacityDisplay = getBottleSizeDisplay(product.bottle_size);
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
                            <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 line-clamp-2">
                              {product.product_name}{capacityDisplay && ` - ${capacityDisplay}`}
                            </div>
                            <div className="text-xs text-gray-400">{product.product_code}</div>
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
                            className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] disabled:bg-gray-100 disabled:text-gray-500"
                          />
                          <span className="text-gray-300 text-xs">&times;</span>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={product.unit_price}
                              onChange={(e) => handleUpdateProductPrice(branchIndex, productIndex, parseFloat(e.target.value) || 0)}
                              disabled={isReadOnly}
                              className="w-16 px-1 pr-4 py-1 border border-gray-300 rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] disabled:bg-gray-100 disabled:text-gray-500"
                            />
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 text-xs pointer-events-none">฿</span>
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
                              className="w-10 px-1 py-1 border border-gray-300 rounded-l border-r-0 text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] focus:z-10 disabled:bg-gray-100 disabled:text-gray-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleToggleProductDiscountType(branchIndex, productIndex)}
                              disabled={isReadOnly}
                              className="px-1.5 text-xs font-medium border border-gray-300 rounded-r bg-gray-50 hover:bg-gray-100 transition-colors min-w-[24px] flex items-center justify-center disabled:opacity-50"
                              title={product.discount_type === 'percent' ? 'เปลี่ยนเป็นจำนวนเงิน' : 'เปลี่ยนเป็นเปอร์เซ็นต์'}
                            >
                              {product.discount_type === 'percent' ? '%' : '฿'}
                            </button>
                          </div>
                          <span className="ml-auto text-sm font-medium text-gray-900 whitespace-nowrap">
                            {calculateProductTotal(product).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Full page mode: table layout */
                <div>
                  <table className="w-full table-fixed">
                    <thead className="bg-gray-50 border-b text-xs">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">สินค้า</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-500 uppercase w-16">จำนวน</th>
                        <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase w-24">ราคา</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-500 uppercase w-24">ส่วนลด</th>
                        <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase w-24">รวม</th>
                        <th className="px-1 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {branch.products.map((product, productIndex) => {
                        const capacityDisplay = getBottleSizeDisplay(product.bottle_size);
                        return (
                          <tr key={product.variation_id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.product_name}
                                    className="w-16 h-16 object-cover rounded flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => setLightboxImage(product.image!)}
                                  />
                                ) : (
                                  <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                                    <Package className="w-6 h-6 text-gray-400" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 line-clamp-2">
                                    {product.product_name}{capacityDisplay && ` - ${capacityDisplay}`}
                                  </div>
                                  <div className="text-xs text-gray-400">{product.product_code}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <input
                                ref={(el) => { quantityInputRefs.current[`${branchIndex}-${productIndex}`] = el; }}
                                type="number"
                                min="1"
                                value={product.quantity}
                                onChange={(e) => handleUpdateProductQuantity(branchIndex, productIndex, parseInt(e.target.value) || 1)}
                                disabled={isReadOnly}
                                className="w-14 px-1.5 py-1 border border-gray-300 rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] disabled:bg-gray-100 disabled:text-gray-500"
                              />
                            </td>
                            <td className="px-2 py-2.5 text-right">
                              <div className="relative inline-block">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={product.unit_price}
                                  onChange={(e) => handleUpdateProductPrice(branchIndex, productIndex, parseFloat(e.target.value) || 0)}
                                  disabled={isReadOnly}
                                  className="w-20 px-1.5 pr-5 py-1 border border-gray-300 rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] disabled:bg-gray-100 disabled:text-gray-500"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-300 text-xs pointer-events-none">฿</span>
                              </div>
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-stretch">
                                <input
                                  type="number"
                                  min="0"
                                  max={product.discount_type === 'percent' ? 100 : undefined}
                                  step="0.01"
                                  value={product.discount_value}
                                  onChange={(e) => handleUpdateProductDiscount(branchIndex, productIndex, parseFloat(e.target.value) || 0)}
                                  disabled={isReadOnly}
                                  className="w-14 px-1.5 py-1 border border-gray-300 rounded-l border-r-0 text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] focus:z-10 disabled:bg-gray-100 disabled:text-gray-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleToggleProductDiscountType(branchIndex, productIndex)}
                                  disabled={isReadOnly}
                                  className="px-2 text-xs font-medium border border-gray-300 rounded-r bg-gray-50 hover:bg-gray-100 transition-colors min-w-[28px] flex items-center justify-center disabled:opacity-50"
                                  title={product.discount_type === 'percent' ? 'เปลี่ยนเป็นจำนวนเงิน' : 'เปลี่ยนเป็นเปอร์เซ็นต์'}
                                >
                                  {product.discount_type === 'percent' ? '%' : '฿'}
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-right text-sm font-medium text-gray-900">
                              {calculateProductTotal(product).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-1 py-2.5 text-center">
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProductFromBranch(branchIndex, productIndex)}
                                  className="text-gray-400 hover:text-red-600 p-0.5 rounded transition-colors"
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
              {!isReadOnly && <div className="px-4 py-3 border-t border-gray-100">
                <div className="relative">
                  <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg hover:border-[#E9B308] transition-colors bg-white">
                    <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      ref={(el) => { productSearchRefs.current[branchIndex] = el; }}
                      type="text"
                      value={productSearches[branchIndex] || ''}
                      onChange={(e) => {
                        const newSearches = [...productSearches];
                        newSearches[branchIndex] = e.target.value;
                        setProductSearches(newSearches);
                        const newDropdowns = [...showProductDropdowns];
                        newDropdowns[branchIndex] = true;
                        setShowProductDropdowns(newDropdowns);
                      }}
                      onFocus={() => {
                        const newDropdowns = [...showProductDropdowns];
                        newDropdowns[branchIndex] = true;
                        setShowProductDropdowns(newDropdowns);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          const newDropdowns = [...showProductDropdowns];
                          newDropdowns[branchIndex] = false;
                          setShowProductDropdowns(newDropdowns);
                        }, 200);
                      }}
                      placeholder="เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
                      className="flex-1 outline-none bg-transparent text-sm"
                    />
                  </div>
                  {showProductDropdowns[branchIndex] && productSearches[branchIndex] && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
                      {products.filter(p =>
                        p.name.toLowerCase().includes(productSearches[branchIndex].toLowerCase()) ||
                        p.code.toLowerCase().includes(productSearches[branchIndex].toLowerCase())
                      ).length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">ไม่พบสินค้า</div>
                      ) : (
                        products
                          .filter(p =>
                            p.name.toLowerCase().includes(productSearches[branchIndex].toLowerCase()) ||
                            p.code.toLowerCase().includes(productSearches[branchIndex].toLowerCase())
                          )
                          .map(product => {
                            const capacityDisplay = getBottleSizeDisplay(product.bottle_size);
                            return (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => handleAddProductToBranch(branchIndex, product)}
                                className="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-center gap-3"
                              >
                                {product.image ? (
                                  <img src={product.image} alt={product.name} className="w-10 h-10 object-cover rounded flex-shrink-0" />
                                ) : (
                                  <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                                    <Package className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {product.name}{capacityDisplay && ` - ${capacityDisplay}`}
                                  </div>
                                  <div className="text-xs text-gray-400">{product.code} · ฿{product.default_price}</div>
                                </div>
                              </button>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>
              </div>}

              {branch.products.length === 0 && !isReadOnly && (
                <div className={`text-center py-8 ${fieldErrors[`branch_${branchIndex}`] ? 'text-red-400' : 'text-gray-400'}`}>
                  <Package className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">{fieldErrors[`branch_${branchIndex}`] || 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน'}</p>
                </div>
              )}

              {/* Shipping Fee + Branch Total */}
              {branch.products.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t space-y-1.5">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-gray-500">ค่าจัดส่ง</span>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">฿</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={branch.shipping_fee || ''}
                        onChange={(e) => handleUpdateBranchShippingFee(branchIndex, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        disabled={isReadOnly}
                        className="w-24 pl-5 pr-2 py-1 border border-gray-300 rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-sm font-medium text-gray-500">
                      ยอดรวมสาขา {branch.address_name}
                    </span>
                    <span className="text-lg font-bold text-[#E9B308]">
                      ฿{(calculateBranchTotal(branch) + (branch.shipping_fee || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
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
        <div className={`bg-white rounded-lg ${embedded ? '' : 'border border-gray-200'} p-4`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Notes */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  หมายเหตุ <span className="text-gray-400 font-normal">(แสดงในบิล / การจัดส่ง)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308] text-sm disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="หมายเหตุสำหรับลูกค้า, การจัดส่ง..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-orange-700 mb-1">
                  หมายเหตุภายใน <span className="text-orange-400 font-normal">(ไม่แสดงในบิล)</span>
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2.5 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm bg-orange-50 disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-300"
                  placeholder="หมายเหตุภายใน..."
                />
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">สรุปคำสั่งซื้อ</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>ยอดรวมสินค้า (รวม VAT)</span>
                  <span>฿{itemsTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>ค่าจัดส่ง</span>
                  <span>฿{totalShippingFee.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">ส่วนลดรวม</span>
                  <div className="flex items-stretch">
                    <input
                      type="number"
                      min="0"
                      max={orderDiscountType === 'percent' ? 100 : undefined}
                      step="0.01"
                      value={orderDiscount}
                      onChange={(e) => setOrderDiscount(parseFloat(e.target.value) || 0)}
                      disabled={isReadOnly}
                      className="w-20 px-2 py-1 border border-gray-300 rounded-l border-r-0 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] focus:z-10 disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setOrderDiscountType(orderDiscountType === 'percent' ? 'amount' : 'percent');
                        setOrderDiscount(0);
                      }}
                      disabled={isReadOnly}
                      className="px-2 text-xs font-medium border border-gray-300 rounded-r bg-gray-50 hover:bg-gray-100 transition-colors min-w-[28px] flex items-center justify-center disabled:opacity-50"
                      title={orderDiscountType === 'percent' ? 'เปลี่ยนเป็นจำนวนเงิน' : 'เปลี่ยนเป็นเปอร์เซ็นต์'}
                    >
                      {orderDiscountType === 'percent' ? '%' : '฿'}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-gray-500 pt-2 border-t border-gray-200">
                  <span>ยอดก่อน VAT</span>
                  <span>฿{subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>VAT 7%</span>
                  <span>฿{vat.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
                  <span>ยอดรวมสุทธิ</span>
                  <span className="text-[#E9B308]">฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!isReadOnly && branchOrders.length > 0 && branchOrders.some(b => b.products.length > 0) && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-[#E9B308] text-[#00231F] px-5 py-2 rounded-lg hover:bg-[#d4a307] transition-colors flex items-center gap-2 disabled:opacity-50 text-sm font-medium"
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
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 w-full relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">สร้างคำสั่งซื้อสำเร็จ!</h3>
              {savedOrderNumber && (
                <p className="text-gray-600 mb-4">เลขที่คำสั่งซื้อ: <span className="font-medium">{savedOrderNumber}</span></p>
              )}
              <div className="space-y-3">
                {/* Bill Online Link with copy */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-left">บิลออนไลน์</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/bills/${savedOrderId}`}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 select-all"
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
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                    className="w-full px-4 py-2.5 bg-[#E9B308] text-[#00231F] rounded-lg hover:bg-[#d4a307] transition-colors font-medium flex items-center justify-center gap-2"
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
                      : 'bg-[#E9B308] text-[#00231F] hover:bg-[#d4a307]'
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
  );
}
