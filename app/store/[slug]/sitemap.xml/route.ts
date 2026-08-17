// Storefront sitemap — served per company so it can sit on the customer's own
// domain (e.g. shop.adayfresh.com/sitemap.xml via the edge proxy).
// URLs always use the configured public domain; without one there is nothing
// worth submitting, so we return 404 rather than a sitemap of unindexable URLs.
import { NextResponse } from 'next/server';
import { getStorefrontCompany, getStorefrontCatalog } from '@/lib/storefront-server';
import { storefrontUrl } from '@/lib/storefront';

export const revalidate = 3600;

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company || !company.config.public_base_url) {
    return new NextResponse('Not found', { status: 404 });
  }

  const cfg = company.config;
  const products = await getStorefrontCatalog(company.id, { limit: 5000 }, company.features.stock);

  const entries = [
    { loc: storefrontUrl(cfg, slug), priority: '1.0', lastmod: null as string | null },
    { loc: storefrontUrl(cfg, slug, '/delivery'), priority: '0.5', lastmod: null },
    ...products.map(p => ({
      loc: storefrontUrl(cfg, slug, `/p/${p.slug}`),
      priority: '0.8',
      lastmod: p.updated_at,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(e => `  <url>
    <loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `
    <lastmod>${new Date(e.lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
