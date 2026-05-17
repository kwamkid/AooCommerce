/**
 * Generic PDF print utility.
 *
 * Desktop: load PDF in a hidden iframe and trigger browser print dialog directly.
 * Mobile: open PDF Blob URL in a new tab (the user can save/share/print from there).
 *         The tab MUST be opened in the click handler (preOpenPrintWindow) before any
 *         await, otherwise iOS Safari blocks it as a popup.
 *
 * Usage (mobile-safe pattern):
 *   const win = preOpenPrintWindow();          // synchronous, inside click handler
 *   const blob = await generatePdf();           // any number of awaits OK now
 *   showPdfPreview(blob, 'ใบกำกับภาษี', win);   // uses preopened tab on mobile
 */

/** Returns true on touch-first mobile browsers where iframe.print() is unreliable. */
export function isMobilePrint(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iOS Safari (incl. iPad pretending to be Mac) + Android
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  const android = /Android/i.test(ua);
  return iOS || android;
}

/**
 * Open a blank tab synchronously inside a click handler. Returns the window reference
 * (or null if popup-blocked / not on mobile). On desktop this is unnecessary; caller
 * may still call it but should pass the result to showPdfPreview so the same code path
 * works everywhere.
 */
export function preOpenPrintWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  if (!isMobilePrint()) return null;
  try {
    const w = window.open('', '_blank');
    if (w) {
      // Friendly loader while PDF generates
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>กำลังเตรียมเอกสาร...</title>
<style>html,body{height:100%;margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6}
.box{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#374151}
.spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#F4511E;border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div class="box"><div class="spinner"></div><div>กำลังเตรียมเอกสาร...</div></div></body></html>`);
    }
    return w;
  } catch {
    return null;
  }
}

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
 * Generate-and-preview helper that's safe on mobile.
 *
 * Wraps a `() => Promise<Blob>` so the new tab is opened *synchronously* inside
 * the click handler (before any await), then the PDF is dropped into it once
 * generation completes. Use this from list-page / detail-page click handlers
 * to avoid the iOS Safari popup blocker.
 *
 * Usage:
 *   onClick={() => printWithPreOpen(() => generateInvoicePdf(data), 'ใบกำกับ')}
 */
export function printWithPreOpen(produceBlob: () => Promise<Blob>, title = 'PDF'): Promise<void> {
  const win = preOpenPrintWindow();
  return produceBlob()
    .then(blob => showPdfPreview(blob, title, win))
    .catch(err => {
      win?.close();
      throw err;
    });
}

/**
 * Show the generated PDF. On mobile, swaps the location of a pre-opened blank tab
 * (caller should pass `preOpenPrintWindow()` result). On desktop, loads into a hidden
 * iframe and fires the print dialog.
 */
export function showPdfPreview(blob: Blob, title = 'PDF', preopened?: Window | null) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));

  // Mobile path — Blob URL into a real tab (the only thing iOS Safari handles reliably).
  if (isMobilePrint()) {
    const win = preopened ?? window.open(url, '_blank');
    if (win) {
      try {
        win.location.href = url;
        win.document.title = title;
      } catch {
        // Cross-document write may be restricted on some browsers; navigating already worked.
      }
    } else {
      // Popup blocked or pre-open failed — fall back to navigating current tab.
      // (Not ideal — loses app state — but better than silent failure.)
      window.location.href = url;
    }
    // Don't revoke immediately: the new tab still needs the URL. Revoke after 5 min.
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    return;
  }

  // Desktop path — hidden iframe + browser print dialog.
  cleanup();
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
      window.open(url, '_blank');
    }
    setTimeout(cleanup, 60000);
  };
}
