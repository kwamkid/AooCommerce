'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Package, Sun, Moon, CheckCircle2, ClipboardList, BarChart3, ChevronRight, AlertCircle, KeyRound, LogOut, Store } from 'lucide-react';
import { productDisplayName } from '@/lib/product-display';
import NumberInput from '@/components/ui/NumberInput';
import { FullPageLoading } from '@/components/ui/Loading';
import StatusBadge from '@/components/ui/StatusBadge';

interface StockItem {
  variation_id: string;
  total_sent: number;
  total_sold: number;
  total_returned: number;
  total_remaining: number;
  sku: string | null;
  barcode: string | null;
  variation_label: string | null;
  product_name: string;
  product_code: string | null;
  image_url: string | null;
}

function productSubtitle(item: { product_code: string | null; sku: string | null; barcode?: string | null }): string {
  const parts: string[] = [];
  if (item.product_code) parts.push(item.product_code);
  if (item.sku && item.sku !== item.product_code && item.sku !== item.barcode) parts.push(`SKU: ${item.sku}`);
  return parts.join(' | ');
}

interface ConsignmentReport {
  id: string;
  report_number: string;
  period_year: number;
  period_month: number;
  status: string;
  total_qty_sold: number | null;
  our_amount: number | null;
  due_date: string | null;
  report_token: string | null;
}

interface CustomerInfo {
  id: string;
  name: string;
  customer_code: string | null;
  phone: string | null;
}

interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
}

interface PortalData {
  customer: CustomerInfo;
  company: CompanyInfo;
  stock_summary: StockItem[];
  reports: ConsignmentReport[];
}

interface ReportItem {
  variation_id: string;
  product_name: string;
  variation_label: string | null;
  qty_sold: number;
  qty_returned: number;
}

const THAI_MONTHS = [
  '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const formatNumber = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });

function getStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case 'draft': return { label: 'รอกรอก', color: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' };
    case 'received': return { label: 'ได้รับแล้ว', color: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' };
    case 'invoiced': return { label: 'ออกบิลแล้ว', color: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' };
    case 'billed': return { label: 'วางบิลแล้ว', color: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' };
    case 'paid': return { label: 'ชำระแล้ว', color: 'bg-green-500/20 text-green-400 border border-green-500/30' };
    case 'overdue': return { label: 'เกินกำหนด', color: 'bg-red-500/20 text-red-400 border border-red-500/30' };
    case 'cancelled': return { label: 'ยกเลิก', color: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' };
    default: return { label: status, color: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' };
  }
}

export default function ConsignmentPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dark mode — same pattern as supplier portal
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('portal-theme');
    const isDark = stored === 'light' ? false : true;
    setDark(isDark);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    return () => {
      const adminTheme = localStorage.getItem('aoo-theme') || 'system';
      if (adminTheme === 'dark') root.classList.add('dark');
      else if (adminTheme === 'light') root.classList.remove('dark');
      else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) root.classList.add('dark');
        else root.classList.remove('dark');
      }
    };
  }, [dark, mounted]);

  const toggleDark = () => {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem('portal-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Auth gate
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authCode, setAuthCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    const stored = sessionStorage.getItem(`portal-auth-${token}`);
    if (stored) setAuthenticated(true);
    setAuthChecking(false);
  }, [token]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = authCode.trim();
    if (!trimmed) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/consignment/portal-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: trimmed, token }),
      });
      if (!res.ok) {
        setAuthError('รหัสไม่ถูกต้อง กรุณาลองใหม่');
        return;
      }
      sessionStorage.setItem(`portal-auth-${token}`, 'true');
      setAuthenticated(true);
    } catch {
      setAuthError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(`portal-auth-${token}`);
    setAuthenticated(false);
    setAuthCode('');
    setData(null);
  };

  // Tab state
  const [activeTab, setActiveTab] = useState<'stock' | 'reports'>('stock');

  // Lightbox
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  useEffect(() => {
    if (!lightboxImage) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxImage(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxImage]);

  // Selected report for inline form
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Report form state
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [reportNotes, setReportNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (authenticated && token) fetchData();
  }, [authenticated, token]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/consignment/portal?token=${token}`);
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'ไม่พบข้อมูลตัวแทน');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReportForm = (report: ConsignmentReport) => {
    if (!data) return;
    setSelectedReportId(report.id);
    setSubmitSuccess(false);
    setSubmitError('');
    setReportNotes('');

    // Initialize items from stock_summary (items in consignment for this customer)
    const initialItems: ReportItem[] = data.stock_summary.map(s => ({
      variation_id: s.variation_id,
      product_name: s.product_name,
      variation_label: s.variation_label,
      qty_sold: 0,
      qty_returned: 0,
    }));
    setReportItems(initialItems);
  };

  const handleCloseForm = () => {
    setSelectedReportId(null);
    setSubmitSuccess(false);
    setSubmitError('');
  };

  const handleSubmitReport = async () => {
    if (!selectedReportId) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`/api/consignment/portal?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: selectedReportId,
          items: reportItems.map(item => ({
            variation_id: item.variation_id,
            qty_sold: item.qty_sold,
            qty_returned: item.qty_returned,
          })),
          notes: reportNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'ไม่สามารถส่งรายงานได้');
      }

      setSubmitSuccess(true);
      await fetchData();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedReport = data?.reports.find(r => r.id === selectedReportId) ?? null;
  // Auth checking — spinner
  if (authChecking || !mounted) {
    return (
      <FullPageLoading />
    );
  }

  // Not authenticated — login gate
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#1A1A2E] flex items-center justify-center p-4 transition-colors" suppressHydrationWarning>
        <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 mb-4">
              <KeyRound className="w-7 h-7 text-amber-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Portal ตัวแทน</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">กรุณากรอกรหัสเข้าถึงเพื่อดูข้อมูล</p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                รหัสเข้าถึง (Access Code)
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={authCode}
                  onChange={e => { setAuthCode(e.target.value); setAuthError(''); }}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 font-mono tracking-wider"
                  placeholder="DN-XXXXXX"
                  autoFocus
                  autoComplete="off"
                />
              </div>
              {authError && (
                <p className="mt-1.5 text-sm text-red-500">{authError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={authLoading || !authCode.trim()}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              เข้าสู่ระบบ
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <FullPageLoading />
    );
  }

  if (!data) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${dark ? 'bg-[#1A1A2E]' : 'bg-gray-50'}`}>
        <div className="text-center">
          <AlertCircle className={`w-16 h-16 mx-auto mb-4 ${dark ? 'text-red-400' : 'text-red-400'}`} />
          <h1 className={`text-xl font-semibold mb-2 ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
            ไม่พบข้อมูลตัวแทน
          </h1>
          <p className={dark ? 'text-slate-500' : 'text-gray-500'}>
            {error || 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1A1A2E] transition-colors" suppressHydrationWarning>
      {/* Top bar — same as supplier portal */}
      <div className="sticky top-0 bg-[#1A1A2E] px-4 py-3 flex items-center justify-between z-10 shadow-md">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Logo" width={80} height={52} className="h-8 w-auto" priority />
          {(data.company.logo_url || data.company.name) && (
            <>
              <div className="w-px h-6 bg-white/20" />
              <div className="flex items-center gap-2">
                {data.company.logo_url && (
                  <img src={data.company.logo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                )}
                {data.company.name && (
                  <span className="text-sm text-white/80 font-medium">{data.company.name}</span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleDark}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={dark ? 'Light Mode' : 'Dark Mode'}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="ออกจากระบบ"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{data.customer.name}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Portal ตัวแทน</p>
        </div>

        {/* Tabs — pill style same as supplier portal */}
        <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-1 mb-6">
          {([
            { key: 'stock', label: 'สต๊อกคงเหลือ', icon: <BarChart3 className="w-4 h-4" /> },
            { key: 'reports', label: 'รายงาน', icon: <ClipboardList className="w-4 h-4" /> },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Stock Tab */}
        {activeTab === 'stock' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            {data.stock_summary.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-slate-500">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">ไม่มีสินค้าคงเหลือ</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[340px]">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                      <th className="text-left px-4 py-2.5 font-medium">สินค้า</th>
                      <th className="text-right px-3 py-2.5 font-medium">ส่งไป</th>
                      <th className="text-right px-3 py-2.5 font-medium">ขายแล้ว</th>
                      <th className="text-right px-4 py-2.5 font-medium">คงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {data.stock_summary.map((item) => (
                      <tr key={item.variation_id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.product_name}
                                className="w-11 h-11 rounded object-cover flex-shrink-0 cursor-zoom-in"
                                onClick={() => setLightboxImage(item.image_url)}
                              />
                            ) : (
                              <div className="w-11 h-11 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                <Package className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 dark:text-white line-clamp-2 leading-snug">
                                {productDisplayName(item)}
                              </p>
                              {productSubtitle(item) && (
                                <p className="text-xs text-gray-500 dark:text-slate-400 font-mono mt-0.5">{productSubtitle(item)}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-sm tabular-nums text-gray-500 dark:text-slate-400">{item.total_sent}</td>
                        <td className="px-3 py-3 text-right text-sm tabular-nums text-gray-500 dark:text-slate-400">{item.total_sold}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold tabular-nums text-sm ${item.total_remaining > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>
                            {item.total_remaining}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.stock_summary.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">{data.stock_summary.reduce((s, i) => s + i.total_sent, 0)}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">ส่งไปแล้ว</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-700 dark:text-slate-300">{data.stock_summary.reduce((s, i) => s + i.total_sold, 0)}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">ขายแล้ว</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-amber-500 dark:text-amber-400">{data.stock_summary.reduce((s, i) => s + i.total_remaining, 0)}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">คงเหลือ</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-3">
            {data.reports.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-slate-500">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">ยังไม่มีรายงาน</p>
              </div>
            ) : (
              data.reports.map((report) => {
                const statusInfo = getStatusLabel(report.status);
                const isDraftWithToken = report.status === 'draft' && report.report_token;
                return (
                  <div key={report.id} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white">
                            {THAI_MONTHS[report.period_month]} {report.period_year + 543}
                          </span>
                          <StatusBadge status="report" colors={statusInfo.color}>{statusInfo.label}</StatusBadge>
                        </div>
                        <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{report.report_number}</div>
                        <div className="flex items-center gap-3 mt-1.5">
                          {report.total_qty_sold != null && (
                            <span className="text-xs text-gray-500 dark:text-slate-400">ขาย {formatNumber(report.total_qty_sold)} ชิ้น</span>
                          )}
                          {report.our_amount != null && (
                            <span className="text-xs font-medium text-amber-500 dark:text-amber-400">฿{formatNumber(report.our_amount)}</span>
                          )}
                          {report.due_date && (
                            <span className="text-xs text-gray-400 dark:text-slate-500">ครบ {formatDate(report.due_date)}</span>
                          )}
                        </div>
                      </div>
                      {isDraftWithToken && (
                        <button
                          onClick={() => handleOpenReportForm(report)}
                          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-[#e03e0d] text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          กรอกรายงาน
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>

      {/* Report Form Modal */}
      {selectedReportId && selectedReport && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={handleCloseForm}
        >
          <div
            className={`w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col ${dark ? 'bg-[#16213E]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? 'border-slate-700' : 'border-gray-200'}`}>
              <div>
                <h3 className={`font-bold text-base ${dark ? 'text-white' : 'text-gray-900'}`}>
                  กรอกรายงานประจำเดือน
                </h3>
                <p className={`text-xs mt-0.5 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                  {THAI_MONTHS[selectedReport.period_month]} {selectedReport.period_year + 543} — {selectedReport.report_number}
                </p>
              </div>
              <button
                onClick={handleCloseForm}
                className={`p-2 rounded-lg transition-colors ${dark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {submitSuccess ? (
                <div className={`text-center py-8 ${dark ? 'text-green-400' : 'text-green-600'}`}>
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3" />
                  <p className="font-bold text-lg">ส่งรายงานสำเร็จ</p>
                  <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>ขอบคุณที่ส่งรายงานประจำเดือน</p>
                  <button
                    onClick={handleCloseForm}
                    className="mt-4 px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
                  >
                    ปิด
                  </button>
                </div>
              ) : (
                <>
                  {submitError && (
                    <div className={`rounded-lg p-3 mb-4 text-sm ${dark ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                      {submitError}
                    </div>
                  )}

                  {reportItems.length === 0 ? (
                    <p className={`text-sm text-center py-4 ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
                      ไม่มีสินค้าที่ต้องรายงาน
                    </p>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {reportItems.map((item, idx) => (
                        <div
                          key={item.variation_id}
                          className={`rounded-lg p-3 ${dark ? 'bg-[#1A1A2E]' : 'bg-gray-50'}`}
                        >
                          <div className="mb-2.5">
                            <div className={`font-medium text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>
                              {item.product_name}
                            </div>
                            {item.variation_label && (
                              <div className={`text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
                                {item.variation_label}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div>
                              <label className={`block text-xs font-medium mb-1 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                                จำนวนขาย (ชิ้น)
                              </label>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setReportItems(prev => prev.map((ri, i) =>
                                    i === idx ? { ...ri, qty_sold: Math.max(0, ri.qty_sold - 1) } : ri
                                  ))}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-base transition-colors ${dark ? 'bg-slate-600 text-white hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                >
                                  -
                                </button>
                                <NumberInput
                                  min={0}
                                  value={item.qty_sold}
                                  onChange={(n) => {
                                    const v = Math.max(0, n);
                                    setReportItems(prev => prev.map((ri, i) =>
                                      i === idx ? { ...ri, qty_sold: v } : ri
                                    ));
                                  }}
                                  className={`w-16 h-8 text-center rounded-lg text-sm font-bold border focus:outline-none focus:ring-2 focus:ring-amber-400 ${dark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setReportItems(prev => prev.map((ri, i) =>
                                    i === idx ? { ...ri, qty_sold: ri.qty_sold + 1 } : ri
                                  ))}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-base transition-colors ${dark ? 'bg-slate-600 text-white hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                >
                                  +
                                </button>
                              </div>
                            </div>

                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  <div className="mb-4">
                    <label className={`block text-sm font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                      หมายเหตุ (ถ้ามี)
                    </label>
                    <textarea
                      value={reportNotes}
                      onChange={e => setReportNotes(e.target.value)}
                      rows={2}
                      placeholder="เพิ่มหมายเหตุ..."
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${dark ? 'bg-[#1A1A2E] border-slate-600 text-white placeholder-slate-600' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            {!submitSuccess && (
              <div className={`px-5 py-4 border-t ${dark ? 'border-slate-700' : 'border-gray-200'}`}>
                <button
                  type="button"
                  onClick={handleSubmitReport}
                  disabled={submitting || reportItems.length === 0}
                  className="w-full bg-amber-500 text-white py-3.5 rounded-xl font-bold text-base hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      กำลังส่ง...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      ส่งรายงาน
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt=""
            className="max-w-full max-h-full rounded-lg object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
