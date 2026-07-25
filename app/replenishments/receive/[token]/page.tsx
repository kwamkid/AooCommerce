// Path: app/replenishments/receive/[token]/page.tsx
// Server wrapper (SSR) for the public replenishment-receive page: data
// fetched server-side for complete first paint + OG link preview when the
// receive link is shared to the dealer in LINE chat. Interactive receive
// form lives in receive-client.tsx.

import { cache } from 'react';
import type { Metadata } from 'next';
import { NextRequest } from 'next/server';
import { GET as replenishmentsReceiveGET } from '@/app/api/replenishments/receive/route';
import ReplenishmentReceiveClient, { type ReplenishmentData } from './receive-client';

export const dynamic = 'force-dynamic';

const getReplenishment = cache(async (token: string): Promise<ReplenishmentData | null> => {
  try {
    const res = await replenishmentsReceiveGET(
      new NextRequest(`http://internal/api/replenishments/receive?token=${encodeURIComponent(token)}`)
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.replenishment as ReplenishmentData) ?? null;
  } catch (err) {
    console.error('[replenishments/receive SSR] server fetch failed, client will retry:', err);
    return null;
  }
});

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  const data = await getReplenishment(token);
  const robots = { index: false, follow: false };

  if (!data) {
    return { title: 'รับสินค้าเติม', robots };
  }

  const title = `ใบเติมสินค้า ${data.replenishment_number} — ${data.company?.name || ''}`.trim();
  const description = `${data.items?.length || 0} รายการ · กดเพื่อตรวจรับสินค้า`;

  return {
    title,
    description,
    robots,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(data.company?.logo_url ? { images: [{ url: data.company.logo_url }] } : {}),
    },
  };
}

export default async function ReplenishmentReceivePage(
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const data = await getReplenishment(token);
  return <ReplenishmentReceiveClient token={token} initialData={data} />;
}
