'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { getPageNumbers } from './types';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  startIdx: number;
  endIdx: number;
  recordsPerPage: number;
  setRecordsPerPage: (v: number) => void;
  setPage: (v: number) => void;
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
}: PaginationProps) {
  if (totalRecords <= 0) return null;

  return (
    <div className="data-pagination">
      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400">
        <span>{startIdx + 1} - {endIdx} จาก {totalRecords} รายการ</span>
        <select
          value={recordsPerPage}
          onChange={(e) => { setRecordsPerPage(Number(e.target.value)); setPage(1); }}
          className="mx-1 px-1 py-0.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
        >
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>/หน้า</span>
      </div>
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
                  className={`w-8 h-8 rounded text-sm font-medium ${currentPage === page ? 'bg-[#F4511E] text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300'}`}
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
    </div>
  );
}
