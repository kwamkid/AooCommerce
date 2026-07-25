// Path: app/transfers/receive/[token]/page.tsx
// Server wrapper (SSR) for the public transfer-receive page: data fetched
// server-side for complete first paint + OG link preview when shared in
// LINE chat. Interactive receive form lives in receive-client.tsx.

import { cache } from 'react';
import type { Metadata } from 'next';
import { NextRequest } from 'next/server';
import { GET as transfersReceiveGET } from '@/app/api/transfers/receive/route';
import TransferReceiveClient, { type TransferData } from './receive-client';

export const dynamic = 'force-dynamic';

const getTransfer = cache(async (token: string): Promise<TransferData | null> => {
  try {
    const res = await transfersReceiveGET(
      new NextRequest(`http://internal/api/transfers/receive?token=${encodeURIComponent(token)}`)
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.transfer as TransferData) ?? null;
  } catch (err) {
    console.error('[transfers/receive SSR] server fetch failed, client will retry:', err);
    return null;
  }
});

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  const transfer = await getTransfer(token);
  const robots = { index: false, follow: false };

  if (!transfer) {
    return { title: 'รับสินค้าโอนย้าย', robots };
  }

  const title = `ใบโอนย้าย ${transfer.transfer_number} — ${transfer.company?.name || ''}`.trim();
  const description = `${transfer.from_warehouse?.name || ''} → ${transfer.to_warehouse?.name || ''} · ${transfer.items?.length || 0} รายการ`;

  return {
    title,
    description,
    robots,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(transfer.company?.logo_url ? { images: [{ url: transfer.company.logo_url }] } : {}),
    },
  };
}

export default async function TransferReceivePage(
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const transfer = await getTransfer(token);
  return <TransferReceiveClient token={token} initialTransfer={transfer} />;
}
