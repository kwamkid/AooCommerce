/**
 * Trigger a browser download for a Blob — single source of truth.
 * ห้ามเขียน createElement('a') + createObjectURL inline (เดิม copy 11 จุด
 * และบางจุดลืม revokeObjectURL = blob ค้างใน memory ทั้ง session)
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link); // Safari/iOS ต้องอยู่ใน DOM ก่อน click
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
