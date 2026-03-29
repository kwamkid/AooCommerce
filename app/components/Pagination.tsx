'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { ReactNode } from 'react';
import FormSelect from '@/components/ui/FormSelect';

function getPageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = [];
  if (totalPages <= 3) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const start = Math.max(1, currentPage - 1);
    const end = Math.min(totalPages, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    if (end < totalPages) pages.push(totalPages);
    if (start > 2) pages.unshift('...');
    if (start > 1) pages.unshift(1);
  }
  return pages;
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  startIdx: number;
  endIdx: number;
  recordsPerPage: number;
  setRecordsPerPage: (v: number) => void;
  setPage: (v: number) => void;
  loadTime?: number | null;
  children?: ReactNode;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalRecords,
  startIdx,
  endIdx,
  recordsPerPage,
  setRecordsPerPage,
  setPage,
  loadTime,
  children,
}: PaginationProps) {
  if (totalRecords <= 0) return null;

  return (
    <div className="data-pagination">
      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400">
        <span>{startIdx + 1} - {endIdx} จาก {totalRecords} รายการ</span>
        <div className="mx-1 w-[70px]">
          <FormSelect
            value={String(recordsPerPage)}
            onChange={(val) => { setRecordsPerPage(Number(val)); setPage(1); }}
            options={[
              { id: '20', label: '20' },
              { id: '50', label: '50' },
              { id: '100', label: '100' },
            ]}
            searchThreshold={99}
          />
        </div>
        <span>/หน้า</span>
        {loadTime != null && (
          <span className="text-xs text-gray-400 dark:text-slate-500 ml-1">({loadTime.toFixed(1)}s)</span>
        )}
      </div>
      <div className="flex items-center gap-2">
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(1)} disabled={currentPage === 1} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าแรก">
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าก่อน">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
            {getPageNumbers(currentPage, totalPages).map((page, index) => {
              if (page === '...') return <span key={`e-${index}`} className="px-2 text-gray-500 dark:text-slate-400">...</span>;
              return (
                <button
                  key={page}
                  onClick={() => setPage(page as number)}
                  className={`w-8 h-8 rounded text-sm font-medium ${currentPage === page ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300'}`}
                >
                  {page}
                </button>
              );
            })}
          </div>
          <button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าถัดไป">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าสุดท้าย">
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}
      {children}
      </div>
    </div>
  );
}
