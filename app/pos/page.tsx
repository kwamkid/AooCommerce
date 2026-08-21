// Path: app/pos/page.tsx
// Terminal POS — wraps the shared PosSaleScreen with session/shift management,
// payment (tenders + change) and receipt printing. The sale screen itself
// (products, cart, promotions, barcode) lives in components/pos/PosSaleScreen.
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Clock, ListOrdered } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

import PosSaleScreen, { type PosSaleScreenHandle, type CheckoutPayload } from '@/components/pos/PosSaleScreen';
import SessionModal from './components/SessionModal';
import PaymentModal from './components/PaymentModal';
import Receipt from './components/Receipt';
import CustomerSearch from './components/CustomerSearch';
import { FullPageLoading } from '@/components/ui/Loading';

interface PosSession {
  id: string;
  warehouse_id: string | null;
  terminal_id: string | null;
  cashier_name: string;
  opening_float: number;
  total_sales: number;
  total_orders: number;
  total_voids: number;
  payment_summary: Record<string, number>;
  warehouse: { id: string; name: string; code: string | null } | null;
  terminal: { id: string; name: string; code: string | null } | null;
}

interface Customer {
  id: string;
  name: string;
  customer_code: string;
  phone?: string;
}

export default function PosPage() {
  const router = useRouter();
  const { loading: authLoading, userProfile } = useAuth();
  const { currentCompany } = useCompany();

  const saleScreenRef = useRef<PosSaleScreenHandle>(null);

  // Session state
  const [session, setSession] = useState<PosSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionModalMode, setSessionModalMode] = useState<'open' | 'close'>('open');
  const [sessionLoading, setSessionLoading] = useState(false);

  // Customer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  // Payment — checkout payload is snapshotted when the cart's pay button is pressed
  const [checkout, setCheckout] = useState<CheckoutPayload | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Receipt
  const [receiptData, setReceiptData] = useState<any>(null);

  // Check for existing open session
  useEffect(() => {
    if (authLoading || !userProfile) return;

    (async () => {
      try {
        const res = await apiFetch('/api/pos/sessions?status=open');
        const data = await res.json();
        const sessions = data.sessions || [];
        if (sessions.length > 0) {
          setSession(sessions[0]);
        } else {
          setShowSessionModal(true);
          setSessionModalMode('open');
        }
      } catch {
        setShowSessionModal(true);
        setSessionModalMode('open');
      } finally {
        setLoadingSession(false);
      }
    })();
  }, [authLoading, userProfile]);

  // Open/Close shift handlers
  const handleOpenShift = async (terminalId: string, openingFloat: number) => {
    setSessionLoading(true);
    try {
      const res = await apiFetch('/api/pos/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminal_id: terminalId, opening_float: openingFloat }),
      });
      const data = await res.json();
      if (res.ok && data.session) {
        setSession(data.session);
        setShowSessionModal(false);
      }
    } catch {}
    setSessionLoading(false);
  };

  const handleCloseShift = async (closingCash: number, notes: string) => {
    if (!session) return;
    setSessionLoading(true);
    try {
      const res = await apiFetch('/api/pos/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, closing_cash: closingCash, notes }),
      });
      if (res.ok) {
        setSession(null);
        setShowSessionModal(false);
        router.push('/dashboard');
      }
    } catch {}
    setSessionLoading(false);
  };

  // Payment handler
  const handlePayment = async (tenders: any[]) => {
    if (!session || !checkout) return;
    setPaymentLoading(true);
    try {
      const res = await apiFetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pos_session_id: session.id,
          customer_id: selectedCustomer?.id || null,
          items: checkout.items.map(i => ({
            variation_id: i.variation_id,
            product_id: i.product_id,
            product_code: i.product_code,
            product_name: i.product_name,
            variation_label: i.variation_label,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount_type: i.discount_type,
            discount_value: i.discount_value,
            promotion_id: i.promotion_id || null,
          })),
          payments: tenders,
          discount_amount: checkout.orderDiscountAmount,
        }),
      });

      const data = await res.json();
      if (res.ok && data.order) {
        setCheckout(null);

        // Clear cart immediately after successful payment
        saleScreenRef.current?.clearCart();
        setSelectedCustomer(null);

        // Fetch receipt data
        const receiptRes = await apiFetch(`/api/pos/receipt?order_id=${data.order.id}`);
        const receiptJson = await receiptRes.json();
        if (receiptJson.receipt) {
          // Add change amount from cash tenders
          const changeAmount = tenders.reduce((s, t) => s + (t.change_amount || 0), 0);
          setReceiptData({ ...receiptJson.receipt, change_amount: changeAmount });
        }

        // Refresh session totals
        const sessRes = await apiFetch('/api/pos/sessions?status=open');
        const sessData = await sessRes.json();
        if (sessData.sessions?.[0]) setSession(sessData.sessions[0]);

        // Refresh products (stock changed)
        saleScreenRef.current?.refreshProducts();
      }
    } catch {}
    setPaymentLoading(false);
  };

  // New sale (after receipt)
  const handleNewSale = () => {
    setReceiptData(null);
    saleScreenRef.current?.clearCart();
    setSelectedCustomer(null);
  };

  // Loading state
  if (authLoading || loadingSession) {
    return (
      <FullPageLoading />
    );
  }

  // No session — show session modal
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#0F172A]">
        <SessionModal
          mode="open"
          onOpenShift={handleOpenShift}
          onCloseShift={() => {}}
          onCancel={() => router.push('/dashboard')}
          loading={sessionLoading}
        />
      </div>
    );
  }

  const topBar = (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#1E293B] border-b border-gray-200 dark:border-gray-700/50 flex-shrink-0 shadow-sm dark:shadow-none">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard')}
          className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {currentCompany?.logo_url && (
          <img
            src={currentCompany.logo_url}
            alt={currentCompany.name}
            className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-gray-600"
          />
        )}
        <div>
          <p className="text-gray-900 dark:text-white font-bold text-lg leading-tight">
            {session.terminal?.name || session.warehouse?.name || 'POS'}
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-xs">
            {currentCompany?.name ? `${currentCompany.name} • ` : ''}{session.cashier_name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <ThemeToggle iconClassName="w-3.5 h-3.5" className="hidden sm:block" />
        <button
          onClick={() => router.push('/pos/orders')}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-white/10 rounded-lg text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
        >
          <ListOrdered className="w-4 h-4" />
          <span className="hidden sm:inline">รายการขาย</span>
        </button>
        <button
          onClick={() => { setSessionModalMode('close'); setShowSessionModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 rounded-lg text-red-400 text-sm hover:bg-red-600/30 transition-colors"
        >
          <Clock className="w-4 h-4" />
          <span className="hidden sm:inline">ปิดกะ</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <PosSaleScreen
        ref={saleScreenRef}
        warehouseId={session.warehouse_id}
        topBar={topBar}
        customerName={selectedCustomer?.name || null}
        onOpenCustomerSearch={() => setShowCustomerSearch(true)}
        onCheckout={setCheckout}
        vatRegistered={currentCompany?.vat_registered || false}
      />

      {/* Modals */}
      {showSessionModal && (
        <SessionModal
          mode={sessionModalMode}
          session={session}
          onOpenShift={handleOpenShift}
          onCloseShift={handleCloseShift}
          onCancel={() => {
            setShowSessionModal(false);
            if (!session) router.push('/dashboard');
          }}
          loading={sessionLoading}
        />
      )}

      {showCustomerSearch && (
        <CustomerSearch
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}

      {checkout && (
        <PaymentModal
          totalAmount={checkout.totalAmount}
          onConfirm={handlePayment}
          onClose={() => setCheckout(null)}
          loading={paymentLoading}
          companyLogo={currentCompany?.logo_url}
        />
      )}

      {receiptData && (
        <Receipt
          data={receiptData}
          onClose={handleNewSale}
          onNewSale={handleNewSale}
        />
      )}
    </>
  );
}
