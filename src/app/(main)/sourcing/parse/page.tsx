"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { ArrowLeft, Sparkles, Trash2, ImageUp, Plus, AlertTriangle } from "lucide-react";

interface Cand {
  id: string;
  name: string;
  spec: string | null;
}
interface Line {
  raw_name: string;
  quantity: number;
  unit: string;
  purpose: string;
  confidence: "high" | "medium" | "low";
  note: string;
  candidates: Cand[];
  product_id: string;
  best_vendor: string | null;
  best_price: number | null;
  sourceable: boolean;
}
interface Branch {
  id: string;
  name: string;
}

const CONF: Record<string, { label: string; cls: string }> = {
  high: { label: "확정", cls: "bg-emerald-100 text-emerald-700" },
  medium: { label: "후보 확인", cls: "bg-amber-100 text-amber-700" },
  low: { label: "미확정/신규", cls: "bg-gray-100 text-gray-500" },
};

export default function ParseOrderPage() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [title, setTitle] = useState("");
  const [branchId, setBranchId] = useState("");
  const [requester, setRequester] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.from("branches").select("id, name").order("name").then(({ data }) => setBranches((data as Branch[]) || []));
  }, []);

  const onPickImage = (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result);
      const base64 = res.split(",")[1] ?? "";
      setImage({ base64, mime: file.type || "image/png", name: file.name || "캡처 이미지" });
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.type.startsWith("image/")) {
        onPickImage(it.getAsFile());
        e.preventDefault();
        return;
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onPickImage(e.dataTransfer.files?.[0]);
  };

  const analyze = async () => {
    if (!text.trim() && !image) return toast.error("주문 텍스트나 이미지를 넣으세요.");
    setAnalyzing(true);
    try {
      const res = await fetch("/api/parse-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim() || undefined,
          imageBase64: image?.base64,
          imageMimeType: image?.mime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "분석 실패");
      const parsed: Line[] = data.lines || [];
      if (parsed.length === 0) toast.info("추출된 품목이 없습니다.");
      setLines(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "분석 중 오류");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const create = async () => {
    const valid = lines.filter((l) => l.raw_name.trim());
    if (!title.trim()) return toast.error("발주건 제목을 입력하세요.");
    if (valid.length === 0) return toast.error("품목이 없습니다.");
    setCreating(true);
    try {
      const { data: job, error: jobErr } = await supabase
        .from("sourcing_jobs")
        .insert({
          title: title.trim(),
          branch_id: branchId || null,
          requester: requester.trim() || null,
          delivery_note: deliveryNote.trim() || null,
          note: "AI 파싱 인입",
        })
        .select("id")
        .single();
      if (jobErr || !job) throw jobErr ?? new Error("발주건 생성 실패");

      const rows = valid.map((l, i) => ({
        job_id: job.id,
        raw_name: l.raw_name.trim(),
        product_id: l.product_id || null,
        required_qty: Number(l.quantity) || 0,
        unit_label: l.unit.trim() || null,
        purpose: l.purpose.trim() || null,
        sort_order: i,
      }));
      const { error: dErr } = await supabase.from("demand_lines").insert(rows);
      if (dErr) throw dErr;

      toast.success("발주건 생성 완료");
      router.push(`/sourcing/${job.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 오류");
      setCreating(false);
    }
  };

  return (
    <>
      <TopBar title="주문 붙여넣기" subtitle="카톡 텍스트·주문서 이미지를 던지면 AI가 카탈로그에 매칭해 정리합니다" />
      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        <Link href="/sourcing" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> 확보 관리
        </Link>

        {/* 입력 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`bg-white rounded-xl border p-4 space-y-3 transition ${
            dragOver ? "border-blue-400 border-dashed bg-blue-50/40" : "border-gray-200"
          }`}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            rows={5}
            placeholder="여기에 주문 텍스트 붙여넣기 — 또는 이미지를 Ctrl+V로 붙여넣거나 끌어다 놓으세요.&#10;예) 알콜스왑 30통, 5cc 주사기 5박스, 0.5cc 인슐린주사기 5박스 / 성동점 보내주세요"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
          />
          {image && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              <ImageUp className="w-4 h-4" /> 이미지 첨부됨: {image.name}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
              <ImageUp className="w-4 h-4" />
              이미지 파일 선택
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
            </label>
            {image && (
              <button onClick={() => setImage(null)} className="text-xs text-gray-400 hover:text-red-500">
                이미지 제거
              </button>
            )}
            <button
              onClick={analyze}
              disabled={analyzing}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> {analyzing ? "분석 중..." : "AI 분석"}
            </button>
          </div>
        </div>

        {/* 결과 초안 */}
        {lines.length > 0 && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">추출 {lines.length}건 — 매칭·거래처를 AI가 제안. 확인/수정만 하세요.</p>
              <div className="space-y-3">
                {lines.map((l, i) => (
                  <div key={i} className="border-b border-gray-100 pb-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={l.raw_name}
                        onChange={(e) => updateLine(i, { raw_name: e.target.value })}
                        className="flex-1 min-w-[150px] px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                      />
                      <input
                        value={l.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        placeholder="단위"
                        className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                      />
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONF[l.confidence]?.cls ?? ""}`}>
                        {CONF[l.confidence]?.label}
                      </span>
                      <button onClick={() => setLines((p) => p.filter((_, j) => j !== i))} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 pl-0.5">
                      <select
                        value={l.product_id}
                        onChange={(e) => updateLine(i, { product_id: e.target.value })}
                        className="flex-1 min-w-[200px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="">매칭 안 함 (미확정)</option>
                        {l.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.spec ? ` (${c.spec})` : ""}
                          </option>
                        ))}
                      </select>
                      {l.product_id && l.best_vendor && (
                        <span className="text-xs text-emerald-700">
                          추천: {l.best_vendor} {l.best_price != null ? l.best_price.toLocaleString() : "-"}
                        </span>
                      )}
                      {l.product_id && !l.sourceable && (
                        <span className="text-xs text-red-500">주문가능 거래처 없음(품절/미등록)</span>
                      )}
                    </div>
                    {l.note && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                        <AlertTriangle className="w-3 h-3" /> {l.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 발주건 정보 */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="발주건 제목 *" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                <option value="">지점 선택 안 함</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <input value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="요청처" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              <input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="배송 메모" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              <button
                onClick={create}
                disabled={creating}
                className="sm:col-span-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> {creating ? "생성 중..." : "확보 발주건 생성"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
