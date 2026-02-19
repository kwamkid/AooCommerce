'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  Loader2,
  Package,
  MapPin,
  X,
  Save,
  AlertCircle
} from 'lucide-react';
import { formatPrice, formatNumber } from '@/lib/utils/format';

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
  id: string; // variation_id for variations, product_id for simple products
  product_id: string;
  code: string;
  name: string;
  variation_label?: string;
  product_type: 'simple' | 'variation';
  default_price: number;
  discount_price?: number;
  stock: number;
}

// Branch-First structure
interface BranchProduct {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
}

interface BranchOrder {
  shipping_address_id: string;
  address_name: string;
  delivery_notes: string;
  shipping_fee: number;
  products: BranchProduct[];
}

interface OrderItemShipment {
  id: string;
  shipping_address_id: string;
  quantity: number;
  shipping_fee?: number;
  delivery_status: string;
  delivery_date?: string;
  received_date?: string;
  delivery_notes?: string;
  shipping_address: {
    id: string;
    address_name: string;
    contact_person?: string;
    phone?: string;
    address_line1: string;
    district?: string;
    amphoe?: string;
    province: string;
    postal_code?: string;
  };
}

interface OrderItem {
  id: string;
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  subtotal: number;
  total: number;
  shipments: OrderItemShipment[];
}

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  delivery_date?: string;
  total_amount: number;
  payment_status: string;
  order_status: string;
  notes?: string;
  internal_notes?: string;
  vat_amount: number;
  discount_amount: number;
  subtotal: number;
  customer: Customer;
  items: OrderItem[];
}

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { userProfile, loading: authLoading } = useAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusError, setStatusError] = useState('');

  // Original order data
  const [originalOrder, setOriginalOrder] = useState<Order | null>(null);

  // Customer (read-only in edit mode)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Shipping addresses
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([]);

  // Products
  const [products, setProducts] = useState<Product[]>([]);

  // Customer pricing (last prices paid by customer for each product)
  const [customerPrices, setCustomerPrices] = useState<Record<string, { unit_price: number; discount_percent: number }>>({});

  // Branch Orders (Branch-First approach)
  const [branchOrders, setBranchOrders] = useState<BranchOrder[]>([]);
  const [activeBranchIndex, setActiveBranchIndex] = useState(0);

  // Order details
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [orderDiscount, setOrderDiscount] = useState(0);

  // Product search per branch
  const [productSearches, setProductSearches] = useState<string[]>([]);
  const [showProductDropdowns, setShowProductDropdowns] = useState<boolean[]>([]);

  // Refs for quantity inputs (to focus after adding product)
  const quantityInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Fetch order data and initialize
  useEffect(() => {
    if (!authLoading && userProfile && orderId) {
      fetchOrderAndInitialize();
    }
  }, [authLoading, userProfile, orderId]);

  const fetchOrderAndInitialize = async () => {
    try {
      setLoading(true);

      // Fetch order details
      const response = await apiFetch(`/api/orders?id=${orderId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch order');
      }

      const result = await response.json();
      const order: Order = result.order;

      // Check if order can be edited (only "new" status can be edited)
      if (order.order_status !== 'new') {
        const statusLabels: Record<string, string> = {
          new: 'ใหม่',
          shipping: 'กำลังส่ง',
          completed: 'สำเร็จ',
          cancelled: 'ยกเลิก'
        };
        setStatusError(
          `ไม่สามารถแก้ไขคำสั่งซื้อนี้ได้ เนื่องจากอยู่ในสถานะ ${statusLabels[order.order_status] || order.order_status} กรุณายกเลิกและสร้างคำสั่งซื้อใหม่`
        );
        setLoading(false);
        return;
      }

      setOriginalOrder(order);
      setSelectedCustomer(order.customer);
      setDeliveryDate(order.delivery_date || '');
      setNotes(order.notes || '');
      setInternalNotes(order.internal_notes || '');
      setOrderDiscount(order.discount_amount || 0);

      // Fetch products
      await fetchProducts();

      // Fetch shipping addresses
      await fetchShippingAddresses(order.customer.id);

      // Fetch customer prices
      await fetchCustomerPrices(order.customer.id);

      // Convert order items back to Branch-First structure
      const branchMap: Map<string, BranchOrder> = new Map();

      order.items.forEach(item => {
        item.shipments.forEach(shipment => {
          const addressId = shipment.shipping_address_id;

          if (!branchMap.has(addressId)) {
            branchMap.set(addressId, {
              shipping_address_id: addressId,
              address_name: shipment.shipping_address.address_name,
              delivery_notes: shipment.delivery_notes || '',
              shipping_fee: shipment.shipping_fee || 0,
              products: []
            });
          }

          const branch = branchMap.get(addressId)!;

          // Check if product already exists in this branch
          const existingProduct = branch.products.find(p => p.variation_id === item.variation_id);

          if (existingProduct) {
            // Add to existing product quantity
            existingProduct.quantity += shipment.quantity;
          } else {
            // Add new product to branch
            branch.products.push({
              variation_id: item.variation_id,
              product_id: item.product_id,
              product_code: item.product_code,
              product_name: item.product_name,
              variation_label: item.variation_label,
              quantity: shipment.quantity,
              unit_price: item.unit_price,
              discount_percent: item.discount_percent
            });
          }
        });
      });

      const branchOrdersArray = Array.from(branchMap.values());
      setBranchOrders(branchOrdersArray);
      setProductSearches(new Array(branchOrdersArray.length).fill(''));
      setShowProductDropdowns(new Array(branchOrdersArray.length).fill(false));

    } catch (error) {
      console.error('Error fetching order:', error);
      setError('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await apiFetch('/api/products');

      if (!response.ok) throw new Error('Failed to fetch products');

      const result = await response.json();
      const fetchedProducts = result.products || [];

      // Flatten variations into individual products
      const flatProducts: Product[] = [];

      fetchedProducts.forEach((sp: any) => {
        if (sp.product_type === 'simple') {
          const variation_id = sp.variations && sp.variations.length > 0 ? sp.variations[0].variation_id : null;
          flatProducts.push({
            id: variation_id || sp.product_id,
            product_id: sp.product_id,
            code: sp.code,
            name: sp.name,
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
              name: `${sp.name} (${v.variation_label})`,
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

  const fetchShippingAddresses = async (customerId: string) => {
    try {
      const response = await apiFetch(`/api/shipping-addresses?customer_id=${customerId}`);

      if (response.ok) {
        const result = await response.json();
        const addresses = result.addresses || [];
        setShippingAddresses(addresses);
      }
    } catch (error) {
      console.error('Error fetching shipping addresses:', error);
    }
  };

  const fetchCustomerPrices = async (customerId: string) => {
    try {
      const response = await apiFetch(`/api/customer-prices?customer_id=${customerId}`);

      if (response.ok) {
        const result = await response.json();
        setCustomerPrices(result.prices || {});
      }
    } catch (error) {
      console.error('Error fetching customer prices:', error);
    }
  };

  // Branch management
  const handleAddBranch = () => {
    if (shippingAddresses.length === 0) {
      setError('ลูกค้านี้ยังไม่มีที่อยู่จัดส่ง');
      return;
    }

    // Find first available address not used yet
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
    const newBranchOrders = [...branchOrders];
    const address = shippingAddresses.find(a => a.id === addressId);
    if (address) {
      newBranchOrders[index].shipping_address_id = addressId;
      newBranchOrders[index].address_name = address.address_name;
      setBranchOrders(newBranchOrders);
    }
  };

  const handleUpdateBranchNotes = (index: number, notes: string) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[index].delivery_notes = notes;
    setBranchOrders(newBranchOrders);
  };

  // Product management per branch
  const handleAddProductToBranch = (branchIndex: number, product: Product) => {
    const existingProduct = branchOrders[branchIndex].products.find(
      p => p.variation_id === product.id
    );

    if (existingProduct) {
      setError('สินค้านี้มีอยู่ในสาขานี้แล้ว');
      setTimeout(() => setError(''), 3000);
      return;
    }

    // Determine price
    let unit_price = 0;
    let discount_percent = 0;

    const customerLastPrice = customerPrices[product.id];
    if (customerLastPrice) {
      unit_price = customerLastPrice.unit_price;
      discount_percent = customerLastPrice.discount_percent;
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
      quantity: 1,
      unit_price,
      discount_percent
    };

    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].products.push(newProduct);
    setBranchOrders(newBranchOrders);

    // Clear search
    const newSearches = [...productSearches];
    newSearches[branchIndex] = '';
    setProductSearches(newSearches);

    const newDropdowns = [...showProductDropdowns];
    newDropdowns[branchIndex] = false;
    setShowProductDropdowns(newDropdowns);

    // Focus on quantity input after adding product
    setTimeout(() => {
      const productIndex = newBranchOrders[branchIndex].products.length - 1;
      const inputKey = `${branchIndex}-${productIndex}`;
      const inputElement = quantityInputRefs.current[inputKey];
      if (inputElement) {
        inputElement.focus();
        inputElement.select(); // Highlight all text
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

  const handleUpdateProductDiscount = (branchIndex: number, productIndex: number, discount: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].products[productIndex].discount_percent = Math.max(0, Math.min(100, discount));
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateBranchShippingFee = (branchIndex: number, fee: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[branchIndex].shipping_fee = Math.max(0, fee);
    setBranchOrders(newBranchOrders);
  };

  // Calculate totals
  const calculateProductSubtotal = (product: BranchProduct) => {
    return product.quantity * product.unit_price;
  };

  const calculateProductDiscount = (product: BranchProduct) => {
    return calculateProductSubtotal(product) * (product.discount_percent / 100);
  };

  const calculateProductTotal = (product: BranchProduct) => {
    return calculateProductSubtotal(product) - calculateProductDiscount(product);
  };

  const calculateBranchTotal = (branch: BranchOrder) => {
    return branch.products.reduce((sum, p) => sum + calculateProductTotal(p), 0);
  };

  // Prices already include VAT, so we need to calculate backwards
  const itemsTotal = branchOrders.reduce((sum, branch) => sum + calculateBranchTotal(branch), 0);
  const totalShippingFee = branchOrders.reduce((sum, branch) => sum + (branch.shipping_fee || 0), 0);
  const totalWithVAT = itemsTotal - orderDiscount + totalShippingFee; // This is the final total (already includes VAT)
  const subtotal = Math.round((totalWithVAT / 1.07) * 100) / 100; // Calculate subtotal (before VAT)
  const vat = totalWithVAT - subtotal; // VAT amount
  const total = totalWithVAT; // Final total (same as totalWithVAT)

  // Validate and submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      setError('กรุณาเลือกลูกค้า');
      return;
    }

    if (!deliveryDate) {
      setError('กรุณาเลือกวันที่ส่งของ');
      return;
    }

    if (branchOrders.length === 0) {
      setError('กรุณาเพิ่มอย่างน้อย 1 สาขา');
      return;
    }

    // Check if all branches have products
    for (let i = 0; i < branchOrders.length; i++) {
      if (branchOrders[i].products.length === 0) {
        setError(`กรุณาเพิ่มสินค้าสำหรับสาขา: ${branchOrders[i].address_name}`);
        return;
      }
    }

    try {
      setSaving(true);
      setError('');

      // Convert branch-first structure to flat order items
      const items = branchOrders.flatMap(branch =>
        branch.products.map(product => ({
          variation_id: product.variation_id,
          product_id: product.product_id,
          product_code: product.product_code,
          product_name: product.product_name,
          variation_label: product.variation_label,
          quantity: product.quantity,
          unit_price: product.unit_price,
          discount_percent: product.discount_percent,
          shipments: [{
            shipping_address_id: branch.shipping_address_id,
            quantity: product.quantity,
            delivery_notes: branch.delivery_notes || undefined,
            shipping_fee: branch.shipping_fee || 0
          }]
        }))
      );

      const orderData = {
        id: orderId,
        customer_id: selectedCustomer.id,
        delivery_date: deliveryDate || undefined,
        discount_amount: orderDiscount,
        notes: notes || undefined,
        internal_notes: internalNotes || undefined,
        items
      };

      const response = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      setSuccess('บันทึกการแก้ไขสำเร็จ');
      setTimeout(() => {
        router.push(`/orders/${orderId}`);
      }, 1500);
    } catch (error) {
      console.error('Error updating order:', error);
      setError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  // Show error if order status is not "confirmed"
  if (statusError) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/orders/${orderId}`)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">แก้ไขคำสั่งซื้อ</h1>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 mb-2">ไม่สามารถแก้ไขได้</h3>
              <p className="text-red-700">{statusError}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push('/orders')}
              className="px-6 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              กลับไปหน้ารายการคำสั่งซื้อ
            </button>
            <button
              onClick={() => router.push(`/orders/${orderId}`)}
              className="bg-[#F4511E] text-white px-6 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors"
            >
              ดูรายละเอียดคำสั่งซื้อ
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/orders')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              แก้ไขคำสั่งซื้อ #{originalOrder?.order_number}
            </h1>
            {originalOrder && (
              <p className="text-sm text-gray-500 mt-1">
                สร้างเมื่อ: {new Date(originalOrder.order_date).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Customer Information (Read-only) */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold mb-4">ข้อมูลลูกค้า</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-slate-400 mb-1">ชื่อลูกค้า</div>
              <div className="font-medium">{selectedCustomer?.name}</div>
              <div className="text-sm text-gray-500 dark:text-slate-400">{selectedCustomer?.customer_code}</div>
            </div>

            {selectedCustomer && (
              <div className="bg-gray-50 dark:bg-slate-700/50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-slate-400 mb-1">ผู้ติดต่อ</div>
                <div className="font-medium dark:text-white">{selectedCustomer.contact_person || '-'}</div>
                <div className="text-sm text-gray-600 dark:text-slate-400">{selectedCustomer.phone || '-'}</div>
              </div>
            )}
          </div>

          {selectedCustomer && shippingAddresses.length > 0 && (
            <div className="mt-4">
              <div className="text-sm text-gray-600 dark:text-slate-400 mb-2">ที่อยู่จัดส่ง ({shippingAddresses.length} แห่ง)</div>
              <div className="flex flex-wrap gap-2">
                {shippingAddresses.map(addr => (
                  <div key={addr.id} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {addr.address_name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Branch Orders */}
        {selectedCustomer && branchOrders.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 overflow-visible">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">รายการสินค้าแยกตามสาขา</h2>
              <button
                type="button"
                onClick={handleAddBranch}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                เพิ่มสาขา
              </button>
            </div>

            {/* Branch Tabs (only show if more than one branch) */}
            {branchOrders.length > 1 && (
              <div className="flex gap-2 mb-4 border-b overflow-x-auto">
                {branchOrders.map((branch, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveBranchIndex(index)}
                    className={`px-4 py-2 font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeBranchIndex === index
                        ? 'border-[#F4511E] text-[#F4511E]'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {branch.address_name}
                    {branch.products.length > 0 && (
                      <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded-full">
                        {branch.products.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Active Branch */}
            {branchOrders.map((branch, branchIndex) => (
              <div
                key={branchIndex}
                className={branchIndex === activeBranchIndex ? 'block' : 'hidden'}
              >
                {/* Branch Details */}
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        สาขา <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={branch.shipping_address_id}
                        onChange={(e) => handleUpdateBranchAddress(branchIndex, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      >
                        {shippingAddresses.map(addr => (
                          <option key={addr.id} value={addr.id}>
                            {addr.address_name} - {addr.address_line1}, {addr.district}, {addr.amphoe}, {addr.province}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ค่าจัดส่ง
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">฿</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={branch.shipping_fee || ''}
                          onChange={(e) => handleUpdateBranchShippingFee(branchIndex, parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        หมายเหตุการจัดส่ง
                      </label>
                      <input
                        type="text"
                        value={branch.delivery_notes}
                        onChange={(e) => handleUpdateBranchNotes(branchIndex, e.target.value)}
                        placeholder="หมายเหตุสำหรับสาขานี้..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                    </div>
                  </div>
                  {branchOrders.length > 1 && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveBranch(branchIndex)}
                        className="text-red-600 hover:text-red-700 text-sm flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        ลบสาขานี้
                      </button>
                    </div>
                  )}
                </div>

                {/* Products Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="data-thead">
                      <tr>
                        <th className="data-th">สินค้า</th>
                        <th className="data-th text-center w-24">จำนวน</th>
                        <th className="data-th text-right w-32">ราคา/หน่วย</th>
                        <th className="data-th text-center w-24">ส่วนลด%</th>
                        <th className="data-th text-right w-32">รวม</th>
                        <th className="data-th text-center w-16">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="data-tbody">
                      {branch.products.map((product, productIndex) => (
                        <tr key={product.variation_id}>
                          <td className="px-4 py-3">
                            <div className="font-medium">{product.product_name}</div>
                            <div className="text-sm text-gray-500 dark:text-slate-400">{product.product_code}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              ref={(el) => {
                                const key = `${branchIndex}-${productIndex}`;
                                quantityInputRefs.current[key] = el;
                              }}
                              type="number"
                              min="1"
                              value={product.quantity}
                              onChange={(e) => handleUpdateProductQuantity(branchIndex, productIndex, parseInt(e.target.value) || 1)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-stretch">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={product.unit_price}
                                onChange={(e) => handleUpdateProductPrice(branchIndex, productIndex, Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-20 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded-l bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                              />
                              <span className="px-1.5 border border-l-0 border-gray-300 dark:border-slate-600 rounded-r bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-sm font-bold flex items-center">฿</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex items-stretch">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={product.discount_percent}
                                onChange={(e) => handleUpdateProductDiscount(branchIndex, productIndex, Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-16 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded-l bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                              />
                              <span className="px-2 border border-l-0 border-gray-300 dark:border-slate-600 rounded-r bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-sm font-bold flex items-center">%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            ฿{formatPrice(calculateProductTotal(product))}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveProductFromBranch(branchIndex, productIndex)}
                              className="text-red-600 hover:text-red-700 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add Product Search - Below table, aligned with product column */}
                <div className="mt-4">
                  <div className="relative inline-block w-auto min-w-[300px]">
                    <div className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#F4511E] transition-colors bg-white">
                      <Plus className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <input
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
                          // Delay to allow click on dropdown items
                          setTimeout(() => {
                            const newDropdowns = [...showProductDropdowns];
                            newDropdowns[branchIndex] = false;
                            setShowProductDropdowns(newDropdowns);
                          }, 200);
                        }}
                        placeholder="ค้นหาชื่อหรือรหัสสินค้า..."
                        className="flex-1 min-w-[200px] outline-none bg-transparent"
                      />
                    </div>
                    {showProductDropdowns[branchIndex] && productSearches[branchIndex] && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                        {products.filter(p =>
                          p.name.toLowerCase().includes(productSearches[branchIndex].toLowerCase()) ||
                          p.code.toLowerCase().includes(productSearches[branchIndex].toLowerCase())
                        ).length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">ไม่พบสินค้า</div>
                        ) : (
                          products
                            .filter(p =>
                              p.name.toLowerCase().includes(productSearches[branchIndex].toLowerCase()) ||
                              p.code.toLowerCase().includes(productSearches[branchIndex].toLowerCase())
                            )
                            .map(product => (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => handleAddProductToBranch(branchIndex, product)}
                                className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                              >
                                <div className="font-medium">{product.name}</div>
                                <div className="text-sm text-gray-500 dark:text-slate-400">
                                  {product.code} • คงเหลือ: {product.stock}
                                </div>
                              </button>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {branch.products.length === 0 && (
                  <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>ยังไม่มีสินค้าในสาขานี้</p>
                    <p className="text-sm">ค้นหาและเพิ่มสินค้าด้านบน</p>
                  </div>
                )}

                {/* Branch Total */}
                {branch.products.length > 0 && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                    <span className="font-medium">
                      ยอดรวมสาขานี้:
                      {branch.shipping_fee > 0 && (
                        <span className="text-gray-400 font-normal ml-2">(รวมค่าส่ง ฿{formatPrice(branch.shipping_fee)})</span>
                      )}
                    </span>
                    <span className="text-lg font-bold text-[#F4511E]">
                      ฿{formatPrice(calculateBranchTotal(branch) + (branch.shipping_fee || 0))}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Order Summary and Details */}
        {branchOrders.length > 0 && branchOrders.some(b => b.products.length > 0) && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column (Desktop) / Second on Mobile - Delivery & Payment Info */}
              <div className="order-2 md:order-1 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่ส่งของ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมายเหตุ
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    placeholder="หมายเหตุสำหรับลูกค้า..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมายเหตุภายใน
                  </label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    placeholder="หมายเหตุภายใน (ไม่แสดงให้ลูกค้า)..."
                  />
                </div>
              </div>

              {/* Right Column (Desktop) / First on Mobile - Order Summary */}
              <div className="order-1 md:order-2">
                <h2 className="text-lg font-semibold mb-4">สรุปคำสั่งซื้อ</h2>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-slate-400">
                    <span>ยอดรวมสินค้า (รวม VAT)</span>
                    <span>฿{formatPrice(itemsTotal)}</span>
                  </div>
                  {totalShippingFee > 0 && (
                    <div className="flex justify-between text-sm text-gray-600 dark:text-slate-400">
                      <span>ค่าจัดส่ง</span>
                      <span>฿{formatPrice(totalShippingFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span>ส่วนลดรวม</span>
                    <div className="flex">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={orderDiscount}
                        onChange={(e) => setOrderDiscount(Math.min(itemsTotal, Math.max(0, parseFloat(e.target.value) || 0)))}
                        className="w-24 px-3 py-1 border border-gray-300 dark:border-slate-600 rounded-l bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                      <span className="px-2 py-1 border border-l-0 border-gray-300 dark:border-slate-600 rounded-r bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-sm font-bold flex items-center">฿</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 pt-2 border-t">
                    <span>ยอดก่อน VAT</span>
                    <span>฿{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 dark:text-slate-400">
                    <span>VAT 7%</span>
                    <span>฿{formatPrice(vat)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold pt-3 border-t">
                    <span>ยอดรวมสุทธิ</span>
                    <span className="text-[#F4511E]">฿{formatPrice(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {branchOrders.length > 0 && branchOrders.some(b => b.products.length > 0) && (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/orders')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
            >
              <X className="w-5 h-5" />
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-[#F4511E] text-white px-6 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  บันทึกการแก้ไข
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </Layout>
  );
}
