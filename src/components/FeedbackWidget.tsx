"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { MessageSquarePlus, X, Check, Clock } from "lucide-react";
import type { Tables } from "@/lib/database.types";

type Feedback = Pick<Tables<"feedback">, "id" | "message" | "page" | "status" | "created_at">;

export default function FeedbackWidget() {
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState<Feedback[]>([]);

  const loadRecent = async () => {
    const { data } = await supabase
      .from("feedback")
      .select("id, message, page, status, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    setRecent((data as Feedback[]) || []);
  };

  useEffect(() => {
    if (open) loadRecent();
  }, [open]);

  const submit = async () => {
    const msg = message.trim();
    if (!msg) return toast.error("바꾸고 싶은 점을 적어주세요.");
    setSending(true);
    const { error } = await supabase.from("feedback").insert({ message: msg, page: pathname });
    setSending(false);
    if (error) return toast.error(`저장 실패: ${error.message}`);
    toast.success("접수됐어요. 다음에 꼭 반영할게요!");
    setMessage("");
    loadRecent();
  };

  return (
    <>
      {/* 떠 있는 버튼 — 어느 화면에서나 보임 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 text-sm font-medium"
        title="이 화면에서 불편한 점·바꾸고 싶은 점을 바로 남기세요"
      >
        <MessageSquarePlus className="w-4 h-4" />
        <span className="hidden sm:inline">개선 요청</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-lg w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900">개선 요청</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">
                쓰다가 &ldquo;이건 좀 아닌데&rdquo; 싶은 걸 그냥 편하게 적으세요. 어느 화면인지는 자동으로 같이 저장돼요.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                autoFocus
                placeholder="예) 여기 표가 너무 빽빽해서 한눈에 안 들어와. 거래처별로 묶어서 보여줘."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
              />
              <button
                onClick={submit}
                disabled={sending}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <MessageSquarePlus className="w-4 h-4" /> {sending ? "보내는 중..." : "보내기"}
              </button>

              {recent.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">최근 보낸 요청</p>
                  <ul className="space-y-1.5">
                    {recent.map((f) => (
                      <li key={f.id} className="flex items-start gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                        {f.status === "done" ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        )}
                        <span className="flex-1 text-gray-700">
                          {f.message}
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            {f.status === "done" ? "반영됨" : "접수됨"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
