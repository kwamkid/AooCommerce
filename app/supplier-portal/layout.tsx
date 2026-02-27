// Path: app/supplier-portal/layout.tsx
// Minimal layout for supplier portal — no sidebar, no auth required
export default function SupplierPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {children}
    </div>
  );
}
