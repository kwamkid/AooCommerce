// Utility: Save a PromptPay QR code as a PNG image with amount, ID text, and optional logo
export function saveQrImage(
  svgElement: SVGSVGElement,
  amount: number,
  promptPayId: string,
  filename?: string,
  logoUrl?: string,
) {
  const formatPPId = (id: string) =>
    id.length === 13
      ? id.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5')
      : id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

  const formatAmount = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const padding = 40;
  const qrSize = 300;
  const canvasWidth = qrSize + padding * 2;
  const topTextHeight = 50;
  const bottomTextHeight = 80;
  const canvasHeight = topTextHeight + qrSize + bottomTextHeight + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Title text
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PromptPay QR', canvasWidth / 2, padding + 30);

  // Serialize SVG to image
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgElement);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const qrX = (canvasWidth - qrSize) / 2;
    const qrY = padding + topTextHeight;
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
    URL.revokeObjectURL(url);

    const drawTextsAndDownload = () => {
      // Amount text
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatAmount(amount)} บาท`, canvasWidth / 2, qrY + qrSize + 35);

      // PromptPay ID text
      ctx.fillStyle = '#666666';
      ctx.font = '16px sans-serif';
      ctx.fillText(`PromptPay: ${formatPPId(promptPayId)}`, canvasWidth / 2, qrY + qrSize + 60);

      // Download
      const link = document.createElement('a');
      link.download = filename || `promptpay-qr-${formatAmount(amount)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    // Draw company logo in center of QR if provided
    if (logoUrl) {
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.onload = () => {
        const logoSize = 60;
        const logoX = qrX + (qrSize - logoSize) / 2;
        const logoY = qrY + (qrSize - logoSize) / 2;

        // White rounded-rect background behind logo
        const pad = 4;
        const r = 8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(logoX - pad, logoY - pad, logoSize + pad * 2, logoSize + pad * 2, r + pad);
        ctx.fill();

        // Clip to rounded rect and draw logo
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(logoX, logoY, logoSize, logoSize, r);
        ctx.clip();
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        ctx.restore();

        drawTextsAndDownload();
      };
      logo.onerror = () => {
        // If logo fails to load, just download without it
        drawTextsAndDownload();
      };
      logo.src = logoUrl;
    } else {
      drawTextsAndDownload();
    }
  };
  img.src = url;
}
