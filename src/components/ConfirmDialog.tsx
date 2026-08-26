"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmRequest {
  title: string;
  message: string;
  // 무엇이 지워지는지 한 줄씩. 품목명·거래처명처럼 사용자가 눈으로 확인할 값.
  details?: string[];
  // 되돌릴 수 없는 위험 요소(확보 진행 중 등)
  warning?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDialog({
  request,
  busy,
  onCancel,
}: {
  request: ConfirmRequest | null;
  busy?: boolean;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onCancel]);

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="bg-white rounded-2xl w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className="flex-shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900">{request.title}</h2>
            <p className="mt-1 text-sm text-gray-600">{request.message}</p>
          </div>
        </div>

        {request.details && request.details.length > 0 && (
          <ul className="mx-5 mt-3 rounded-lg bg-gray-50 border border-gray-200 divide-y divide-gray-200 text-sm">
            {request.details.map((line, i) => (
              <li key={i} className="px-3 py-2 text-gray-800 break-words">
                {line}
              </li>
            ))}
          </ul>
        )}

        {request.warning && (
          <p className="mx-5 mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            {request.warning}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            취소
          </button>
          <button
            autoFocus
            onClick={() => request.onConfirm()}
            disabled={busy}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "처리 중..." : request.confirmLabel ?? "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}
