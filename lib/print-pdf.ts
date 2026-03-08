/**
 * Generic PDF print utility.
 * Creates a hidden iframe, loads the PDF, and triggers browser print dialog directly.
 *
 * Usage:
 *   import { showPdfPreview } from '@/lib/print-pdf';
 *   showPdfPreview(blob, 'ใบปะหน้า Shopee');
 */

/**
 * Merge multiple PDF blobs into one using pdf-lib.
 * Use this when bulk-printing multiple orders into a single preview.
 */
export async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error('No PDFs to merge');
  if (blobs.length === 1) return blobs[0];

  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  for (const blob of blobs) {
    const buf = await blob.arrayBuffer();
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  const bytes = await merged.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

let currentIframe: HTMLIFrameElement | null = null;
let currentUrl: string | null = null;

function cleanup() {
  if (currentIframe) {
    currentIframe.remove();
    currentIframe = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export function closePdfPreview() {
  cleanup();
}

/**
 * Load PDF into a hidden iframe and trigger browser print dialog immediately.
 * Browser print dialog has its own preview — no need for custom overlay.
 */
export function showPdfPreview(blob: Blob, _title = 'PDF') {
  cleanup();

  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  currentUrl = url;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
  iframe.src = url;
  document.body.appendChild(iframe);
  currentIframe = iframe;

  iframe.onload = () => {
    try {
      iframe.contentWindow?.print();
    } catch {
      // Fallback: open in new tab if print fails (e.g. cross-origin)
      window.open(url, '_blank');
    }
    // Clean up after a delay (give print dialog time to use the iframe)
    setTimeout(cleanup, 60000);
  };
}
