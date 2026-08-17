// Storefront robots.txt — per company, served on the customer's own domain.
// AI crawlers are listed explicitly so `allow_ai_crawlers` is a real switch:
// some shops want to be quotable by ChatGPT/Perplexity, others don't.
import { NextResponse } from 'next/server';
import { getStorefrontCompany } from '@/lib/storefront-server';
import { storefrontUrl } from '@/lib/storefront';

export const revalidate = 3600;

// Answer-engine + AI-training crawlers, toggled together by allow_ai_crawlers.
const AI_CRAWLERS = [
  'GPTBot',           // OpenAI training
  'OAI-SearchBot',    // ChatGPT search
  'ChatGPT-User',     // ChatGPT browsing on behalf of a user
  'ClaudeBot',        // Anthropic
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',  // Gemini / AI Overviews grounding
  'Applebot-Extended',
  'CCBot',            // Common Crawl — feeds many LLM datasets
  'Bytespider',
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return new NextResponse('Not found', { status: 404 });

  const cfg = company.config;
  const lines: string[] = [];

  if (!cfg.public_base_url) {
    // ยังไม่ได้ผูกโดเมนของร้าน — อย่าให้ index บนโดเมน aoo (หลายร้านโดเมนเดียวกัน)
    lines.push('User-agent: *', 'Disallow: /');
  } else {
    lines.push('User-agent: *', 'Allow: /', '');
    for (const bot of AI_CRAWLERS) {
      lines.push(`User-agent: ${bot}`, cfg.allow_ai_crawlers ? 'Allow: /' : 'Disallow: /', '');
    }
    lines.push(`Sitemap: ${storefrontUrl(cfg, slug, '/sitemap.xml')}`);
  }

  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
