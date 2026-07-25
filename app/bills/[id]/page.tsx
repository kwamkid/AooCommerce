// Path: app/bills/[id]/page.tsx
// Server wrapper for the public bill page (SSR): fetches the bill on the
// server so the HTML arrives complete (fast first paint on customer phones,
// no client fetch waterfall) and generateMetadata renders OG link previews
// when the bill URL is shared in LINE/Facebook chat. All interactive UI
// (payment form, slip upload, print, delivery form) lives in bill-client.tsx.

import { cache } from 'react';
import type { Metadata } from 'next';
import { NextRequest } from 'next/server';
import { GET as billsGET } from '@/app/api/bills/route';
import BillClient, { type BillData } from './bill-client';

export const dynamic = 'force-dynamic';

// Calls the /api/bills GET handler in-process — single source of truth with
// the client refresh path, no HTTP hop. cache() dedupes the call between
// generateMetadata and the page render within one request.
const getBill = cache(async (orderId: string): Promise<BillData | null> => {
  try {
    const res = await billsGET(
      new NextRequest(`http://internal/api/bills?id=${encodeURIComponent(orderId)}`)
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.bill as BillData) ?? null;
  } catch (err) {
    console.error('[bills SSR] server fetch failed, client will retry:', err);
    return null;
  }
});

const formatBaht = (n: number) =>
  `฿${(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const bill = await getBill(id);

  // Private unguessable link — must never be indexed (OG preview still works)
  const robots = { index: false, follow: false };

  if (!bill) {
    return { title: 'บิลออนไลน์', robots };
  }

  const shop = bill.company_name || 'บิลออนไลน์';
  const status = bill.is_cancelled
    ? 'ยกเลิกแล้ว'
    : bill.is_expired
      ? 'บิลหมดอายุ'
      : bill.payment_status === 'paid'
        ? 'ชำระแล้ว'
        : 'รอชำระ';
  const title = `บิล ${bill.order_number} — ${shop}`;
  const description = `ยอดชำระ ${formatBaht(bill.total_amount)} · ${status}`;

  return {
    title,
    description,
    robots,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(bill.company_logo ? { images: [{ url: bill.company_logo }] } : {}),
    },
  };
}

export default async function BillOnlinePage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bill = await getBill(id);
  // bill = null → BillClient falls back to its own client-side fetch/error UI
  return <BillClient orderId={id} initialBill={bill} />;
}
