'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingCart,
  Users,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Clock,
  Zap,
  Star,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

/* ─────────────────────────────────────────────
   Demo Dashboard — Frontend Design Skill Test
   Aesthetic: Refined dark with warm amber accents
   Font: system + monospace for numbers
   ───────────────────────────────────────────── */

// Mock data
const revenueData = [28, 42, 35, 50, 38, 62, 55, 70, 65, 80, 72, 95];
const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const topProducts = [
  { name: 'เซรั่มบำรุงผิว Premium', sold: 342, revenue: 512400, trend: +12.5 },
  { name: 'ครีมกันแดด SPF50+', sold: 289, revenue: 346800, trend: +8.3 },
  { name: 'โทนเนอร์ AHA/BHA', sold: 256, revenue: 230400, trend: -2.1 },
  { name: 'มาส์กหน้า Collagen', sold: 198, revenue: 178200, trend: +15.7 },
  { name: 'คลีนซิ่ง Micellar Water', sold: 167, revenue: 133600, trend: +5.4 },
];

const recentOrders = [
  { id: 'ORD-2431', customer: 'คุณสมหญิง', amount: 2450, status: 'completed', time: '2 นาทีที่แล้ว' },
  { id: 'ORD-2430', customer: 'คุณณัฐพล', amount: 1890, status: 'shipping', time: '15 นาทีที่แล้ว' },
  { id: 'ORD-2429', customer: 'คุณพิมพ์ใจ', amount: 5670, status: 'processing', time: '32 นาทีที่แล้ว' },
  { id: 'ORD-2428', customer: 'คุณอภิชาติ', amount: 890, status: 'completed', time: '1 ชม.ที่แล้ว' },
  { id: 'ORD-2427', customer: 'คุณวิภาวดี', amount: 3200, status: 'ready_to_ship', time: '1.5 ชม.ที่แล้ว' },
];

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'สำเร็จ' },
  shipping: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'กำลังจัดส่ง' },
  processing: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'กำลังจัดของ' },
  ready_to_ship: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'พร้อมส่ง' },
};

function formatNum(n: number) {
  return n.toLocaleString('th-TH');
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString('th-TH');
}

// Animated counter hook
function useCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const startTime = performance.now();
    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }, [target, duration]);
  return count;
}

// Mini sparkline SVG
function Sparkline({ data, color = '#f59e0b' }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill={`url(#grad-${color.replace('#', '')})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot on last point */}
      {(() => {
        const lastX = w;
        const lastY = h - ((data[data.length - 1] - min) / range) * h * 0.8 - h * 0.1;
        return <circle cx={lastX} cy={lastY} r="3" fill={color} />;
      })()}
    </svg>
  );
}

// Bar chart
function BarChart({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-1.5 h-40">
      {data.map((v, i) => {
        const pct = (v / max) * 100;
        return (
          <div key={i} className="flex flex-col items-center flex-1 group">
            <div className="relative w-full flex justify-center">
              <div
                className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-amber-600 to-amber-400
                  group-hover:from-amber-500 group-hover:to-amber-300 transition-all duration-300
                  relative overflow-hidden"
                style={{
                  height: `${pct}%`,
                  minHeight: '4px',
                  animationDelay: `${i * 60}ms`,
                }}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 mt-1.5 font-mono">{labels[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

// Stat card
function StatCard({
  label,
  value,
  prefix = '',
  suffix = '',
  trend,
  icon: Icon,
  sparkData,
  color,
  delay = 0,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  trend: number;
  icon: typeof TrendingUp;
  sparkData: number[];
  color: string;
  delay?: number;
}) {
  const animatedValue = useCounter(value);
  const isUp = trend >= 0;

  return (
    <div
      className="relative bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-5
        hover:border-zinc-700/80 transition-all duration-500 group overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Subtle glow */}
      <div
        className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-3xl"
        style={{ background: color }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${color}15` }}
            >
              <Icon size={16} style={{ color }} />
            </div>
            <span className="text-sm text-zinc-400">{label}</span>
          </div>
          <div className={`flex items-center gap-0.5 text-xs font-mono ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}%
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="font-mono text-2xl font-semibold text-white tracking-tight">
            {prefix}{formatNum(animatedValue)}{suffix}
          </div>
          <Sparkline data={sparkData} color={color} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function DemoFrontendPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Background texture */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black" />
      <div
        className="fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div
          className={`mb-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Live Dashboard</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            ภาพรวมร้านค้า
          </h1>
          <p className="text-zinc-500 mt-1">
            Demo — Frontend Design Skill Test
          </p>
        </div>

        {/* Stats Grid */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 transition-all duration-700 delay-100
            ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <StatCard
            label="รายได้วันนี้"
            value={48750}
            prefix="฿"
            trend={12.5}
            icon={DollarSign}
            sparkData={[20, 35, 28, 42, 38, 55, 48]}
            color="#f59e0b"
            delay={0}
          />
          <StatCard
            label="ออเดอร์ใหม่"
            value={24}
            trend={8.3}
            suffix=" รายการ"
            icon={ShoppingCart}
            sparkData={[12, 18, 15, 22, 20, 28, 24]}
            color="#3b82f6"
            delay={80}
          />
          <StatCard
            label="ลูกค้าใหม่"
            value={7}
            trend={-3.2}
            suffix=" ราย"
            icon={Users}
            sparkData={[8, 12, 6, 10, 9, 5, 7]}
            color="#8b5cf6"
            delay={160}
          />
          <StatCard
            label="สินค้าคงเหลือ"
            value={1284}
            trend={2.1}
            suffix=" ชิ้น"
            icon={Package}
            sparkData={[1100, 1050, 1120, 1180, 1200, 1250, 1284]}
            color="#10b981"
            delay={240}
          />
        </div>

        {/* Main Content */}
        <div
          className={`grid grid-cols-1 lg:grid-cols-3 gap-6 transition-all duration-700 delay-200
            ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          {/* Revenue Chart */}
          <div className="lg:col-span-2 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <BarChart3 size={18} className="text-amber-400" />
                  รายได้รายเดือน
                </h2>
                <p className="text-sm text-zinc-500 mt-0.5">ปี 2569</p>
              </div>
              <div className="text-right">
                <div className="font-mono text-xl font-semibold text-white">฿1.24M</div>
                <div className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
                  <ArrowUpRight size={12} />
                  +18.2% จากปีก่อน
                </div>
              </div>
            </div>
            <BarChart data={revenueData} labels={months} />
          </div>

          {/* Recent Orders */}
          <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Clock size={18} className="text-blue-400" />
                ออเดอร์ล่าสุด
              </h2>
              <button className="text-xs text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-0.5">
                ดูทั้งหมด <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-3">
              {recentOrders.map((order, i) => {
                const st = statusColors[order.status] || statusColors.processing;
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between py-2.5 border-b border-zinc-800/50 last:border-0
                      hover:bg-zinc-800/30 -mx-2 px-2 rounded-lg transition-colors cursor-pointer"
                    style={{ animationDelay: `${300 + i * 80}ms` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-500">{order.id}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="text-sm text-zinc-300 mt-0.5 truncate">{order.customer}</div>
                    </div>
                    <div className="text-right ml-3">
                      <div className="font-mono text-sm text-white">฿{formatNum(order.amount)}</div>
                      <div className="text-[10px] text-zinc-600">{order.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div
          className={`mt-6 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-6
            transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Star size={18} className="text-amber-400" />
              สินค้าขายดี
            </h2>
            <span className="text-xs text-zinc-600 font-mono">30 วันล่าสุด</span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="grid grid-cols-12 gap-4 text-xs text-zinc-500 font-medium mb-3 px-3">
              <div className="col-span-1">#</div>
              <div className="col-span-5">สินค้า</div>
              <div className="col-span-2 text-right">ขายได้</div>
              <div className="col-span-2 text-right">รายได้</div>
              <div className="col-span-2 text-right">แนวโน้ม</div>
            </div>
            {topProducts.map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-4 items-center py-3 px-3 rounded-xl
                  hover:bg-zinc-800/40 transition-colors cursor-pointer group"
              >
                <div className="col-span-1">
                  <span className={`font-mono text-sm font-bold ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-amber-700' : 'text-zinc-600'}`}>
                    {i + 1}
                  </span>
                </div>
                <div className="col-span-5">
                  <span className="text-sm text-zinc-200 group-hover:text-white transition-colors">{p.name}</span>
                </div>
                <div className="col-span-2 text-right font-mono text-sm text-zinc-300">
                  {formatNum(p.sold)}
                </div>
                <div className="col-span-2 text-right font-mono text-sm text-zinc-300">
                  ฿{formatCurrency(p.revenue)}
                </div>
                <div className="col-span-2 text-right">
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-mono ${p.trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {p.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {p.trend >= 0 ? '+' : ''}{p.trend}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {topProducts.map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-zinc-800/50 last:border-0">
                <span className={`font-mono text-lg font-bold w-6 ${i === 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{p.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {formatNum(p.sold)} ชิ้น &middot; ฿{formatCurrency(p.revenue)}
                  </div>
                </div>
                <span className={`text-xs font-mono ${p.trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {p.trend >= 0 ? '+' : ''}{p.trend}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-zinc-600">
            <Sparkles size={12} className="text-amber-500/50" />
            <span>Generated by <span className="text-zinc-500 font-mono">frontend-design</span> skill</span>
            <Sparkles size={12} className="text-amber-500/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
