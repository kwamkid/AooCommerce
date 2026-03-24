import { useState, useCallback, useRef } from 'react';
import { fetchCustomerOrderContext, type GpResolverContext } from '@/lib/gp-resolver';

// ── Types ──

export interface PrefillShippingAddress {
  id: string;
  address_name: string;
  contact_person: string;
  phone: string;
  address_line1: string;
  district: string;
  amphoe: string;
  province: string;
  postal_code: string;
  is_default?: boolean;
  delivery_notes?: string;
}

export interface PrefillDeliveryFields {
  deliveryName: string;
  deliveryPhone: string;
  deliveryEmail: string;
  deliveryAddress: string;
  deliveryDistrict: string;
  deliveryAmphoe: string;
  deliveryProvince: string;
  deliveryPostalCode: string;
}

export interface PrefillTaxFields {
  taxName: string;
  taxTaxId: string;
  taxBranch: string;
  taxAddress: string;
}

export interface CustomerPrefillResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: Record<string, any>;
  shippingAddresses: PrefillShippingAddress[];
  gpContext: GpResolverContext;
}

// ── Hook ──

export function useCustomerPrefill() {
  // Shipping addresses
  const [shippingAddresses, setShippingAddresses] = useState<PrefillShippingAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');

  // Delivery fields
  const [deliveryName, setDeliveryName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryEmail, setDeliveryEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDistrict, setDeliveryDistrict] = useState('');
  const [deliveryAmphoe, setDeliveryAmphoe] = useState('');
  const [deliveryProvince, setDeliveryProvince] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');

  // Tax fields
  const [taxName, setTaxName] = useState('');
  const [taxTaxId, setTaxTaxId] = useState('');
  const [taxBranch, setTaxBranch] = useState('สำนักงานใหญ่');
  const [taxAddress, setTaxAddress] = useState('');

  // Dedup ref
  const latestCustomerIdRef = useRef('');

  // ── Fill delivery from a shipping address ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fillDeliveryFromAddress = useCallback((addr: PrefillShippingAddress, cust: Record<string, any> | null) => {
    setDeliveryName(addr.contact_person || cust?.name || '');
    setDeliveryPhone(addr.phone || cust?.phone || '');
    setDeliveryEmail(cust?.email || '');
    setDeliveryAddress(addr.address_line1 || '');
    setDeliveryDistrict(addr.district || '');
    setDeliveryAmphoe(addr.amphoe || '');
    setDeliveryProvince(addr.province || '');
    setDeliveryPostalCode(addr.postal_code || '');
  }, []);

  // ── Fill delivery from billing (fallback) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fillDeliveryFromBilling = useCallback((c: Record<string, any>) => {
    setDeliveryName(c.contact_person || c.name || '');
    setDeliveryPhone(c.phone || '');
    setDeliveryEmail(c.email || '');
    setDeliveryAddress(c.billing_address || '');
    setDeliveryDistrict(c.billing_district || '');
    setDeliveryAmphoe(c.billing_amphoe || '');
    setDeliveryProvince(c.billing_province || '');
    setDeliveryPostalCode(c.billing_postal_code || '');
  }, []);

  // ── Fill tax fields from customer ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fillTaxFromCustomer = useCallback((c: Record<string, any>) => {
    if (c.tax_company_name) setTaxName(c.tax_company_name);
    if (c.tax_id) setTaxTaxId(c.tax_id);
    if (c.tax_branch) setTaxBranch(c.tax_branch);
    const addrParts = [c.billing_address, c.billing_district, c.billing_amphoe, c.billing_province, c.billing_postal_code].filter(Boolean).join(' ');
    if (addrParts) setTaxAddress(addrParts);
  }, []);

  // ── Fetch customer context + prefill ──
  const prefillCustomer = useCallback(async (
    customerId: string,
    options?: { includeTax?: boolean; fallbackToBilling?: boolean }
  ): Promise<CustomerPrefillResult | null> => {
    latestCustomerIdRef.current = customerId;
    try {
      const ctx = await fetchCustomerOrderContext(customerId);
      if (latestCustomerIdRef.current !== customerId) return null; // stale

      const addrs = ctx.shippingAddresses || [];
      const c = ctx.customer;

      // Addresses
      setShippingAddresses(addrs);
      const defaultAddr = addrs.find(a => a.is_default) || addrs[0];
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
        fillDeliveryFromAddress(defaultAddr, c);
      } else if (options?.fallbackToBilling !== false && c) {
        fillDeliveryFromBilling(c);
      }

      // Tax
      if (options?.includeTax !== false && c) {
        fillTaxFromCustomer(c);
      }

      return { customer: c, shippingAddresses: addrs, gpContext: ctx.gpContext };
    } catch {
      return null;
    }
  }, [fillDeliveryFromAddress, fillDeliveryFromBilling, fillTaxFromCustomer]);

  // ── Clear all fields ──
  const clearPrefill = useCallback(() => {
    setShippingAddresses([]);
    setSelectedAddressId('');
    setDeliveryName(''); setDeliveryPhone(''); setDeliveryEmail('');
    setDeliveryAddress(''); setDeliveryDistrict(''); setDeliveryAmphoe('');
    setDeliveryProvince(''); setDeliveryPostalCode('');
    setTaxName(''); setTaxTaxId(''); setTaxBranch('สำนักงานใหญ่'); setTaxAddress('');
  }, []);

  // ── onDeliveryChange handler for CustomerSelectionCard ──
  const handleDeliveryChange = useCallback((f: Partial<PrefillDeliveryFields>) => {
    if (f.deliveryName !== undefined) setDeliveryName(f.deliveryName);
    if (f.deliveryPhone !== undefined) setDeliveryPhone(f.deliveryPhone);
    if (f.deliveryEmail !== undefined) setDeliveryEmail(f.deliveryEmail);
    if (f.deliveryAddress !== undefined) setDeliveryAddress(f.deliveryAddress);
    if (f.deliveryDistrict !== undefined) setDeliveryDistrict(f.deliveryDistrict);
    if (f.deliveryAmphoe !== undefined) setDeliveryAmphoe(f.deliveryAmphoe);
    if (f.deliveryProvince !== undefined) setDeliveryProvince(f.deliveryProvince);
    if (f.deliveryPostalCode !== undefined) setDeliveryPostalCode(f.deliveryPostalCode);
  }, []);

  // ── onTaxFieldsChange handler for CustomerSelectionCard ──
  const handleTaxFieldsChange = useCallback((f: PrefillTaxFields) => {
    setTaxName(f.taxName); setTaxTaxId(f.taxTaxId);
    setTaxBranch(f.taxBranch); setTaxAddress(f.taxAddress);
  }, []);

  // ── onAddressSelect handler for CustomerSelectionCard ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAddressSelect = useCallback((id: string, addr: PrefillShippingAddress, customer?: Record<string, any> | null) => {
    setSelectedAddressId(id);
    fillDeliveryFromAddress(addr, customer || null);
  }, [fillDeliveryFromAddress]);

  // ── onNewAddress handler for CustomerSelectionCard ──
  const handleNewAddress = useCallback(() => {
    setSelectedAddressId('new');
    setDeliveryName(''); setDeliveryPhone(''); setDeliveryEmail('');
    setDeliveryAddress(''); setDeliveryDistrict(''); setDeliveryAmphoe('');
    setDeliveryProvince(''); setDeliveryPostalCode('');
  }, []);

  return {
    // State
    shippingAddresses,
    selectedAddressId,
    delivery: {
      deliveryName, deliveryPhone, deliveryEmail,
      deliveryAddress, deliveryDistrict, deliveryAmphoe,
      deliveryProvince, deliveryPostalCode,
    },
    taxFields: { taxName, taxTaxId, taxBranch, taxAddress },

    // Individual setters (for edit mode population)
    setDeliveryName, setDeliveryPhone, setDeliveryEmail,
    setDeliveryAddress, setDeliveryDistrict, setDeliveryAmphoe,
    setDeliveryProvince, setDeliveryPostalCode,
    setTaxName, setTaxTaxId, setTaxBranch, setTaxAddress,
    setShippingAddresses, setSelectedAddressId,

    // Actions
    prefillCustomer,
    clearPrefill,
    fillDeliveryFromAddress,

    // CustomerSelectionCard handlers (pass directly as props)
    handleDeliveryChange,
    handleTaxFieldsChange,
    handleAddressSelect,
    handleNewAddress,
  };
}
