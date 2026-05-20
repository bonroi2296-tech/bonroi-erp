"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast는 ToastProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}

const styles: Record<ToastType, { ring: string; icon: ReactNode }> = {
  success: { ring: "border-emerald-200", icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" /> },
  error: { ring: "border-red-200", icon: <XCircle className="w-5 h-5 text-red-600" /> },
  info: { ring: "border-blue-200", icon: <Info className="w-5 h-5 text-blue-600" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`flex items-start gap-3 bg-white border ${styles[t.type].ring} rounded-xl shadow-lg px-4 py-3`}
          >
            <span className="flex-shrink-0 mt-0.5">{styles[t.type].icon}</span>
            <p className="flex-1 text-sm text-gray-800 break-words">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
