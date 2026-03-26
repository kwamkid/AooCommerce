# Migrate to DataTable

Automatically detect and help migrate legacy manual table pages to the shared `DataTable` component.

## Trigger
When the user opens or edits a list page that uses manual `<table>` with `data-table-wrap` / `data-thead` / `data-tbody` instead of the `DataTable` component.

## Detection
Look for these patterns in the current file:
- `<table` + `data-table-wrap` without importing `DataTable`
- Manual `<thead className="data-thead">`
- Manual `<tbody className="data-tbody">`
- Manual `Pagination` import alongside manual table
- Manual mobile card `<div className="md:hidden">`

## Migration Steps

### 1. Define columns
Convert each `<th>` + corresponding `<td>` into a `DataTableColumn` definition:
```typescript
const columns: DataTableColumn<RowType>[] = [
  {
    key: 'name',
    label: 'ชื่อ',
    alwaysVisible: true,
    render: (row) => row.name,
    // mobileRender: if mobile card shows differently
  },
  // ... for each column
];
```

### 2. Identify special cells
- **Focus action button** → separate column with `stopPropagation: true`
- **ActionMenu** → separate column with `stopPropagation: true`
- **Checkbox** → use `selectedIds` + `onSelectionChange` props instead

### 3. Replace table + mobile cards + pagination
Remove:
- `<div className="hidden md:block">` wrapper + `<table>` block
- `<div className="md:hidden">` mobile cards block
- `<Pagination>` component
- `ColumnSettingsDropdown` (DataTable includes this)

Replace with:
```typescript
<DataTable
  storageKey="page-name"
  columns={columns}
  data={items}
  loading={loading}
  getRowId={(row) => row.id}
  onRowClick={(row) => router.push(`/xxx/${row.id}`)}
  currentPage={page}
  totalPages={totalPages}
  totalRecords={totalRecords}
  recordsPerPage={limit}
  onPageChange={setPage}
  onRecordsPerPageChange={setLimit}
  loadTime={loadTime}
  // optional:
  mobileCardRender={(row) => <CustomCard row={row} />}
  selectedIds={selectedIds}
  onSelectionChange={setSelectedIds}
/>
```

### 4. Keep existing logic
- `getFocusAction()` / `getMenuItems()` — keep as-is, use inside column render
- Filter bar (`data-filter-card`) — keep above DataTable
- Tab filters — keep above DataTable

### 5. Clean up imports
Remove: `Pagination`, `ColumnSettingsDropdown`, `useColumnToggle`
Add: `DataTable, { type DataTableColumn }` from `@/components/ui/DataTable`

## Output
Show a diff summary of what changed and confirm the migration is complete.
