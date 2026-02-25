/**
 * Generic PDF print utility.
 * Opens a centered modal PDF preview with print/close buttons.
 *
 * Usage:
 *   import { showPdfPreview } from '@/lib/print-pdf';
 *   showPdfPreview(blob, 'ใบปะหน้า Shopee');
 *
 * This creates a global overlay — only one can be open at a time.
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

let currentOverlay: HTMLDivElement | null = null;
let currentUrl: string | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

function cleanup() {
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
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
 * Show a PDF in a centered modal with print/close buttons.
 * Works with any PDF source: pdfMake blob, Shopee API response, etc.
 */
export function showPdfPreview(blob: Blob, title = 'PDF') {
  cleanup();

  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  currentUrl = url;

  // Backdrop
  const overlay = document.createElement('div');
  overlay.id = 'pdf-preview-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);padding:24px;';
  overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };

  // Modal container
  const modal = document.createElement('div');
  modal.style.cssText = 'display:flex;flex-direction:column;width:100%;max-width:800px;height:90vh;max-height:90vh;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);';

  // Top bar
  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;flex-shrink:0;';

  const titleEl = document.createElement('span');
  titleEl.textContent = title;
  titleEl.style.cssText = 'color:#111827;font-size:14px;font-weight:600;';

  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.cssText = 'display:flex;align-items:center;gap:8px;';

  // Print button
  const printBtn = document.createElement('button');
  printBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span style="margin-left:6px">พิมพ์</span>`;
  printBtn.style.cssText = 'display:flex;align-items:center;padding:6px 14px;font-size:13px;font-weight:500;border-radius:8px;background:#2563eb;color:white;border:none;cursor:pointer;';
  printBtn.onmouseenter = () => { printBtn.style.background = '#1d4ed8'; };
  printBtn.onmouseleave = () => { printBtn.style.background = '#2563eb'; };
  printBtn.onclick = () => {
    const iframe = document.getElementById('pdf-preview-frame') as HTMLIFrameElement;
    try {
      iframe?.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
  };

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.style.cssText = 'display:flex;align-items:center;padding:6px;color:#6b7280;border:none;background:none;cursor:pointer;border-radius:6px;';
  closeBtn.onmouseenter = () => { closeBtn.style.background = '#f3f4f6'; closeBtn.style.color = '#111827'; };
  closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; closeBtn.style.color = '#6b7280'; };
  closeBtn.onclick = cleanup;

  buttonsDiv.appendChild(printBtn);
  buttonsDiv.appendChild(closeBtn);
  topBar.appendChild(titleEl);
  topBar.appendChild(buttonsDiv);

  // PDF iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'pdf-preview-frame';
  iframe.src = url;
  iframe.style.cssText = 'flex:1;width:100%;border:none;background:#f3f4f6;';

  modal.appendChild(topBar);
  modal.appendChild(iframe);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  currentOverlay = overlay;

  // ESC key to close
  escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cleanup();
  };
  document.addEventListener('keydown', escHandler);
}
