// Path: app/api/image-proxy/route.ts
// Proxies Google Drive images (CORS workaround). Public by design — used in
// <img> tags including on public bill pages — so it is NOT auth-gated.
// Instead it is locked to a Google host allowlist to prevent SSRF: without
// this an attacker could pass ?url=http://169.254.169.254/... and read cloud
// metadata / internal services through the server.
import { NextRequest, NextResponse } from 'next/server';

// Only these hosts (exact or subdomain) may be proxied. All Google Drive
// image delivery resolves to one of these.
const ALLOWED_HOST_SUFFIXES = [
  'drive.google.com',
  'drive.usercontent.google.com',
  'googleusercontent.com', // lh3.googleusercontent.com, *.googleusercontent.com
];

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(s => h === s || h.endsWith(`.${s}`));
}

const MAX_BYTES = 15 * 1024 * 1024; // 15MB cap

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Validate the target: must be https + a Google host. Rejects private/
    // link-local IPs, internal hostnames, other schemes.
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
    }

    const response = await fetch(target.toString(), { redirect: 'follow' });
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    // Only serve actual images — a Drive "download" of a non-image (e.g. an
    // HTML login page) must not be echoed back through our origin.
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 415 });
    }

    const imageBuffer = await response.arrayBuffer();
    if (imageBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
