// Path: lib/upload-validation.ts
// Shared validation for user-uploaded images (payment slips, receipt photos).
// Used by the PUBLIC upload endpoints (bills, transfers/receive,
// replenishments/receive) — the caller is unauthenticated, so this is the
// only gate on what lands in storage.

// Allowlist of safe raster image types. SVG is deliberately excluded — it can
// carry inline <script> and would execute as XSS when served from our origin
// (storage contentType echoes the client type). Allowlist > blocklist so a
// novel image subtype can't slip through.
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

/**
 * True when the uploaded file is a safe raster image. Rejects SVG by both
 * MIME type and extension (the extension also becomes the stored file path).
 */
export function isAllowedImageUpload(file: { type: string; name: string }): boolean {
  const type = (file.type || '').toLowerCase();
  const ext = (file.name?.split('.').pop() || '').toLowerCase();
  if (ext === 'svg' || ext === 'svgz') return false;
  return ALLOWED_IMAGE_TYPES.has(type);
}
