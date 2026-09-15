/** Only return to this application's product list; never redirect to arbitrary URLs. */
export function productReturnUrl(value: string | null | undefined): string {
  if (!value || !/^\/products(?:\?|$)/.test(value) || /[\\\r\n]/.test(value)) return '/products';
  return value;
}

export function productEditorUrl(productId: string | null, returnTo: string, duplicateId?: string): string {
  const query = new URLSearchParams({ returnTo: productReturnUrl(returnTo) });
  if (duplicateId) query.set('duplicate', duplicateId);
  return `${productId ? `/products/${encodeURIComponent(productId)}/edit` : '/products/new'}?${query}`;
}
