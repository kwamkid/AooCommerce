// Path: app/supplier-portal/layout.tsx
// Minimal layout for supplier portal — no sidebar, no auth required
export default function SupplierPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
