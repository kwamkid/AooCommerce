'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';
import { Loader2, Package, Camera, Sun, Moon, CheckCircle2, XCircle, Clock, Truck, AlertTriangle } from 'lucide-react';
import NumberInput from '@/components/ui/NumberInput';
import ProductImageThumb from '@/components/ui/ProductImageThumb';

interface TransferItem {
  id: string;
  variation_id: string;
  qty_sent: number;
  qty_received: number | null;
  notes: string | null;
  variation: {
    id: string;
    variation_label: string;
    sku: string | null;
    barcode: string | null;
    attributes: Record<string, string> | null;
    product: {
      id: string;
      code: string | null;
      name: string;
      image: string | null;
    };
  };
}

export interface TransferData {
  id: string;
  transfer_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  receive_token: string;
  receiver_name: string | null;
  receive_photo_url: string | null;
  receive_notes: string | null;
  from_warehouse: { id: string; name: string; code: string | null };
  to_warehouse: { id: string; name: string; code: string | null };
  items: TransferItem[];
  company: { id: string; name: string; logo_url: string | null };
}

export default function TransferReceiveClient({ token, initialTransfer }: { token: string; initialTransfer: TransferData | null }) {
  const [transfer, setTransfer] = useState<TransferData | null>(initialTransfer);
  const [loading, setLoading] = useState(!initialTransfer);
  const [error, setError] = useState('');

  // Dark mode
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('transfer-receive-theme');
    if (stored === 'light') setDark(false);
    setMounted(true);
  }, []);
  const toggleDark = () => {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem('transfer-receive-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Form state
  const [receiverName, setReceiverName] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Init quantities to qty_sent (default: receive all)
  const seedQuantities = (t: TransferData) => {
    const initQty: Record<string, number> = {};
    for (const item of t.items) {
      initQty[item.id] = item.qty_received ?? item.qty_sent;
    }
    setQuantities(initQty);
  };

  useEffect(() => {
    if (initialTransfer) {
      seedQuantities(initialTransfer);
    } else if (token) {
      // No server-provided data (server fetch failed) — fall back to client fetch
      fetchTransfer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchTransfer = async () => {
    try {
      const res = await fetch(`/api/transfers/receive?token=${token}`);
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'ไม่พบใบโอนย้าย');
      }
      const { transfer: t } = await res.json();
      setTransfer(t);
      seedQuantities(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (photoPreview) URL.revokeObjectURL(photoPreview);

    setCompressing(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      setPhoto(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
    } catch {
      if (file.size > 5 * 1024 * 1024) {
        setError('ไฟล์ใหญ่เกินไป กรุณาเลือกรูปขนาดเล็กกว่า 5MB');
        setCompressing(false);
        return;
      }
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async () => {
    if (!transfer) return;
    if (!receiverName.trim()) {
      setError('กรุณาระบุชื่อผู้รับสินค้า');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('token', token);
      formData.append('receiver_name', receiverName.trim());
      const itemsPayload = transfer.items.map(item => ({
        item_id: item.id,
        qty_received: quantities[item.id] ?? item.qty_sent,
      }));
      formData.append('items', JSON.stringify(itemsPayload));
      if (receiveNotes.trim()) formData.append('receive_notes', receiveNotes.trim());
      if (photo) formData.append('photo', photo);

      const res = await fetch('/api/transfers/receive', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'ไม่สามารถรับสินค้าได้');
      }

      setSubmitSuccess(true);
      await fetchTransfer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getProductDisplay = (item: TransferItem) => {
    const name = item.variation.product.name;
    const label = item.variation.variation_label;
    const sku = item.variation.sku;
    const barcode = item.variation.barcode;
    const productCode = item.variation.product.code;
    // Subtitle: skip if label equals barcode/sku/productCode or is pure digits
    const cleanLabel = label && label !== '-' && label !== barcode && label !== sku && label !== productCode && !/^\d+$/.test(label) ? label : null;
    // Code line: barcode + sku (de-duped)
    const codeParts: string[] = [];
    if (barcode) codeParts.push(barcode);
    if (sku && sku !== barcode) codeParts.push(sku);
    const code = codeParts.length > 0 ? codeParts.join(' / ') : null;
    return { name, subtitle: cleanLabel, code };
  };

  // Loading
  if (loading || !mounted) {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  // Not found
  if (!transfer) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${dark ? 'bg-[#1A1A2E]' : 'bg-gray-50'}`}>
        <div className="text-center">
          <Package className={`w-16 h-16 mx-auto mb-4 ${dark ? 'text-slate-600' : 'text-gray-300'}`} />
          <h1 className={`text-xl font-semibold mb-2 ${dark ? 'text-slate-300' : 'text-gray-700'}`}>ไม่พบใบโอนย้าย</h1>
          <p className={dark ? 'text-slate-500' : 'text-gray-500'}>{error || 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว'}</p>
        </div>
      </div>
    );
  }

  const totalSent = transfer.items.reduce((sum, i) => sum + i.qty_sent, 0);
  const totalReceived = transfer.items.reduce((sum, i) => sum + (quantities[i.id] ?? i.qty_sent), 0);

  return (
    <div className={`min-h-screen transition-colors ${dark ? 'bg-[#1A1A2E]' : 'bg-gray-100'}`}>
      {/* Top bar */}
      <div className="sticky top-0 bg-[#1A1A2E] px-4 py-3 flex items-center justify-between z-10 shadow-md">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Logo" width={80} height={52} className="h-8 w-auto" priority />
          <span className="font-medium text-white/80 text-sm ml-2">#{transfer.transfer_number}</span>
        </div>
        <button
          onClick={toggleDark}
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="max-w-lg mx-auto my-4 px-3">
        <div className={`rounded-xl shadow-sm p-5 md:p-6 transition-colors ${dark ? 'bg-[#16213E] shadow-black/20' : 'bg-white'}`}>

          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              {transfer.company.logo_url ? (
                <img src={transfer.company.logo_url} alt={transfer.company.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 ${dark ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {transfer.company.name.charAt(0)}
                </div>
              )}
              <div>
                <div className={`text-lg font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{transfer.company.name}</div>
                <p className={`text-sm ${dark ? 'text-slate-500' : 'text-gray-400'}`}>ใบโอนย้ายสินค้า</p>
              </div>
            </div>
            <div className="text-right">
              <div className={`font-bold text-base ${dark ? 'text-white' : 'text-gray-900'}`}>{transfer.transfer_number}</div>
              {transfer.shipped_at && (
                <div className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`} suppressHydrationWarning>{formatDate(transfer.shipped_at)}</div>
              )}
            </div>
          </div>

          {/* Warehouse info */}
          <div className={`rounded-lg p-3 mb-5 ${dark ? 'bg-[#1A1A2E]' : 'bg-gray-50'}`}>
            <div className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
              <span className={`font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{transfer.from_warehouse.name}</span>
              <span className="mx-2">→</span>
              <span className={`font-medium ${dark ? 'text-amber-400' : 'text-amber-600'}`}>{transfer.to_warehouse.name}</span>
            </div>
          </div>

          {/* === STATUS: PENDING === */}
          {transfer.status === 'pending' && (
            <div className={`border-2 rounded-xl p-5 text-center ${dark ? 'bg-yellow-900/20 border-yellow-800' : 'bg-yellow-50 border-yellow-200'}`}>
              <Clock className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-yellow-400' : 'text-yellow-500'}`} />
              <div className={`font-bold text-lg ${dark ? 'text-yellow-400' : 'text-yellow-700'}`}>ใบโอนย้ายนี้ยังไม่ได้จัดส่ง</div>
              <p className={`text-sm mt-1 ${dark ? 'text-yellow-500/70' : 'text-yellow-500'}`}>กรุณารอจนกว่าจะมีการจัดส่งสินค้า</p>
            </div>
          )}

          {/* === STATUS: CANCELLED === */}
          {transfer.status === 'cancelled' && (
            <div className={`border-2 rounded-xl p-5 text-center ${dark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
              <XCircle className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-red-400' : 'text-red-500'}`} />
              <div className={`font-bold text-lg ${dark ? 'text-red-400' : 'text-red-700'}`}>ใบโอนย้ายนี้ถูกยกเลิกแล้ว</div>
            </div>
          )}

          {/* === STATUS: RECEIVED (summary) === */}
          {transfer.status === 'received' && (
            <>
              <div className={`border-2 rounded-xl p-5 text-center mb-5 ${dark ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'}`}>
                <CheckCircle2 className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-green-400' : 'text-green-500'}`} />
                <div className={`font-bold text-lg ${dark ? 'text-green-400' : 'text-green-700'}`}>รับสินค้าเรียบร้อยแล้ว</div>
                {transfer.received_at && (
                  <p className={`text-sm mt-1 ${dark ? 'text-green-500/70' : 'text-green-500'}`} suppressHydrationWarning>{formatDate(transfer.received_at)}</p>
                )}
                {transfer.receiver_name && (
                  <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>ผู้รับ: {transfer.receiver_name}</p>
                )}
              </div>

              {/* Diff table */}
              <div className="space-y-2 mb-4">
                {transfer.items.map((item, idx) => {
                  const { name, subtitle, code } = getProductDisplay(item);
                  const sent = item.qty_sent;
                  const received = item.qty_received ?? 0;
                  const diff = sent - received;
                  return (
                    <div key={item.id} className={`flex items-center gap-3 py-3 border-b last:border-0 ${dark ? 'border-slate-700' : 'border-gray-100'}`}>
                      <ProductImageThumb src={item.variation.product.image} alt={name} size="lg" />

                      <div className="flex-1 min-w-0">
                        <div className={`font-medium leading-snug ${dark ? 'text-white' : 'text-gray-900'}`}>{name}</div>
                        {subtitle && <div className={`text-sm ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{subtitle}</div>}
                        {code && <div className={`text-xs font-mono ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{code}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>ส่ง {sent}</div>
                        <div className={`font-bold ${received === sent ? (dark ? 'text-green-400' : 'text-green-600') : (dark ? 'text-amber-400' : 'text-amber-600')}`}>
                          รับ {received}
                        </div>
                        {diff > 0 && (
                          <div className={`text-xs ${dark ? 'text-red-400' : 'text-red-500'}`}>ขาด {diff}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Receive photo */}
              {transfer.receive_photo_url && (
                <div className="mb-4">
                  <div className={`text-sm font-medium mb-2 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>รูปถ่ายการรับสินค้า</div>
                  <img src={transfer.receive_photo_url} alt="รูปรับสินค้า" className={`w-full max-h-64 object-contain rounded-lg border ${dark ? 'border-slate-600' : 'border-gray-200'}`} />
                </div>
              )}

              {/* Receive notes */}
              {transfer.receive_notes && (
                <div className={`rounded-lg p-3 ${dark ? 'bg-[#1A1A2E]' : 'bg-gray-50'}`}>
                  <div className={`text-sm font-medium mb-1 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>หมายเหตุ</div>
                  <div className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{transfer.receive_notes}</div>
                </div>
              )}
            </>
          )}

          {/* === STATUS: SHIPPING (receive form) === */}
          {transfer.status === 'shipping' && !submitSuccess && (
            <>
              <div className={`flex items-center gap-2 mb-4 ${dark ? 'text-amber-400' : 'text-amber-600'}`}>
                <Truck className="w-5 h-5" />
                <span className="font-bold text-lg">รับสินค้า</span>
              </div>

              {/* Items */}
              <div className="space-y-3 mb-5">
                {transfer.items.map((item) => {
                  const { name, subtitle, code } = getProductDisplay(item);
                  const qty = quantities[item.id] ?? item.qty_sent;
                  return (
                    <div key={item.id} className={`rounded-lg p-3 ${dark ? 'bg-[#1A1A2E]' : 'bg-gray-50'}`}>
                      {/* Row 1: Image + Product info */}
                      <div className="flex gap-3">
                        <ProductImageThumb src={item.variation.product.image} alt={name} size="lg" />

                        <div className="flex-1 min-w-0">
                          <div className={`font-medium leading-snug ${dark ? 'text-white' : 'text-gray-900'}`}>{name}</div>
                          {subtitle && <div className={`text-sm mt-0.5 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{subtitle}</div>}
                          {code && <div className={`text-xs mt-0.5 font-mono ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{code}</div>}
                        </div>
                      </div>
                      {/* Row 2: Quantity controls */}
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>ส่ง <span className="font-medium">{item.qty_sent}</span> ชิ้น →</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-600'}`}>รับ</span>
                          <button
                            type="button"
                            onClick={() => setQuantities(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] ?? item.qty_sent) - 1) }))}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors ${dark ? 'bg-slate-600 text-white hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                          >
                            -
                          </button>
                          <NumberInput
                            min={0}
                            max={item.qty_sent}
                            value={qty}
                            onChange={(n) => {
                              const v = Math.min(item.qty_sent, Math.max(0, n));
                              setQuantities(prev => ({ ...prev, [item.id]: v }));
                            }}
                            className={`w-16 h-9 text-center rounded-lg text-lg font-bold border focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                              qty < item.qty_sent
                                ? dark ? 'bg-amber-900/30 border-amber-700 text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-700'
                                : dark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setQuantities(prev => ({ ...prev, [item.id]: Math.min(item.qty_sent, (prev[item.id] ?? item.qty_sent) + 1) }))}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors ${dark ? 'bg-slate-600 text-white hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              {totalReceived < totalSent && (
                <div className={`rounded-lg p-3 flex items-center gap-2 ${dark ? 'bg-amber-900/20 border border-amber-800' : 'bg-amber-50 border border-amber-200'}`}>
                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${dark ? 'text-amber-400' : 'text-amber-500'}`} />
                  <span className={`text-sm ${dark ? 'text-amber-400' : 'text-amber-700'}`}>
                    รับไม่ครบ: {totalReceived}/{totalSent} ชิ้น (ขาด {totalSent - totalReceived} ชิ้น จะถูกคืนกลับคลังต้นทาง)
                  </span>
                </div>
              )}
            </>
          )}

          {/* Success after submit */}
          {transfer.status === 'shipping' && submitSuccess && (
            <div className={`border-2 rounded-xl p-5 text-center ${dark ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'}`}>
              <CheckCircle2 className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-green-400' : 'text-green-500'}`} />
              <div className={`font-bold text-lg ${dark ? 'text-green-400' : 'text-green-700'}`}>บันทึกการรับสินค้าเรียบร้อย</div>
              <p className={`text-sm mt-1 ${dark ? 'text-green-500/70' : 'text-green-500'}`}>ขอบคุณที่ยืนยันการรับสินค้า</p>
            </div>
          )}

        </div>

        {/* === STATUS: SHIPPING — Receiver card (separate) === */}
        {transfer.status === 'shipping' && !submitSuccess && (
          <div className={`rounded-xl shadow-sm p-5 md:p-6 mt-4 transition-colors ${dark ? 'bg-[#16213E] shadow-black/20' : 'bg-white'}`}>
            {/* Error message */}
            {error && (
              <div className={`rounded-lg p-3 mb-4 text-sm ${dark ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                {error}
              </div>
            )}

            {/* Receiver name */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                ชื่อผู้รับสินค้า <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="ระบุชื่อผู้รับ"
                className={`w-full px-3 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent ${dark ? 'bg-[#1A1A2E] border-slate-600 text-white placeholder-slate-600' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </div>

            {/* Photo upload */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>รูปถ่ายการรับสินค้า</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              {compressing ? (
                <div className={`w-full border-2 border-dashed rounded-lg py-8 flex flex-col items-center gap-2 ${dark ? 'border-slate-600 text-slate-500' : 'border-gray-300 text-gray-400'}`}>
                  <Loader2 className="w-10 h-10 animate-spin" />
                  <span className="text-sm">กำลังย่อรูป...</span>
                </div>
              ) : photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt="รูปรับสินค้า" className={`w-full max-h-48 object-contain rounded-lg border ${dark ? 'border-slate-600' : 'border-gray-200'}`} />
                  <button
                    type="button"
                    onClick={() => { if (photoPreview) URL.revokeObjectURL(photoPreview); setPhoto(null); setPhotoPreview(null); }}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-lg py-6 flex flex-col items-center gap-2 hover:border-amber-400 hover:text-amber-400 transition-colors ${dark ? 'border-slate-600 text-slate-500' : 'border-gray-300 text-gray-400'}`}
                >
                  <Camera className="w-8 h-8" />
                  <span className="text-sm">ถ่ายรูป / เลือกรูป</span>
                </button>
              )}
            </div>

            {/* Notes */}
            <div className="mb-5">
              <label className={`block text-sm font-medium mb-1 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>หมายเหตุ</label>
              <textarea
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                rows={2}
                className={`w-full px-3 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent ${dark ? 'bg-[#1A1A2E] border-slate-600 text-white placeholder-slate-600' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || compressing || !receiverName.trim()}
              className="w-full bg-amber-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  ยืนยันรับสินค้า
                </>
              )}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
