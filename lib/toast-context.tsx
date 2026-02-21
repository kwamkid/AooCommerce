'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Check, AlertCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error';

interface ToastData {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-5 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-sm font-medium transition-all animate-in fade-in slide-in-from-bottom-4 ${
              toast.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
            }`}
          >
            {toast.type === 'success' ? (
              <Check className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className={`ml-1 p-0.5 rounded ${
                toast.type === 'success'
                  ? 'hover:bg-green-200/50 dark:hover:bg-green-800/50'
                  : 'hover:bg-red-200/50 dark:hover:bg-red-800/50'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
