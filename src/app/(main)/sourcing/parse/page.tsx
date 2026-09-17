"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import QuickProductCreate from "@/components/QuickProductCreate";
import { ArrowLeft, Sparkles, Trash2, ImageUp, Plus, AlertTriangle, Search } from "lucide-react";

interface Cand {
  id: string;
  name: string;
  spec: string | null;
  // 주문에 적힌 규격과의 관계. 서버가 매겨서 내려준다.
  spec_match?: "match" | "conflict" | "unknown";
  // 이 후보의 최저가 거래처(서버가 품절 거래처를 뺀 결과)
  vendor?: string | null;
  vendor_id?: string | null;
  price?: number | null;
  sourceable?: boolean;
}
interface Line {
  raw_name: string;
  quantity: number;
  unit: string;
  purpose: string;
  confidence: number;
  reason: string;
  note: string;
  candidates: Cand[];
  // 규격이 갈려서 사람이 골라야 하는 줄
  needs_spec: boolean;
  product_id: string;
  best_vendor: string | null;
  best_vendor_id: string | null;
  best_price: number | null;
  sourceable: boolean;
}
interface Branch {
  id: string;
  name: string;
}

const confCls = (c: number) =>
  c >= 70 ? "bg-emerald-100 text-emerald-700" : c >= 40 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500";

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
  const [autoAssign, setAutoAssign] = useState(true);

  // 사람이 직접 제품을 DB에서 찾아 교정
  const [searchFor, setSearchFor] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Cand[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    supabase.from("branches").select("id, name").order("name").then(({ data }) => setBranches((data as Branch[]) || []));
  }, []);

  useEffect(() => {
    if (searchFor === null) return;
    const q = searchQ.trim().replace(/[%_]/g, " ");
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, spec")
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(20);
      setSearchResults((data as Cand[]) || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ, searchFor]);

  const openSearch = (i: number, prefill: string) => {
    setSearchFor(i);
    setSearchQ(prefill);
    setSearchResults([]);
  };
  const [registering, setRegistering] = useState(false);
  const closeSearch = () => {
    setSearchFor(null);
    setSearchQ("");
    setSearchResults([]);
    setRegistering(false);
  };
  const pickProduct = (i: number, p: Cand) => {
    setLines((prev) =>
      prev.map((l, j) => {
        if (j !== i) return l;
        // 이미 후보에 있던 제품이면 서버가 붙여준 거래처·단가를 살린다(검색 결과엔 그 정보가 없다).
        const c = l.candidates.find((x) => x.id === p.id) ?? p;
        return {
          ...l,
          product_id: c.id,
          candidates: [c, ...l.candidates.filter((x) => x.id !== c.id)],
          best_vendor: c.vendor ?? null,
          best_vendor_id: c.vendor_id ?? null,
          best_price: c.price ?? null,
          sourceable: c.sourceable ?? false,
        };
      })
    );
    closeSearch();
  };

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
          branchId: branchId || undefined,
        }),
      });
      let data: { lines?: Line[]; error?: string; detectedBranch?: Branch | null } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok || !data) {
        throw new Error(
          data?.error ||
            (res.status === 504 || res.status === 502
              ? "서버 응답이 지연됐어요(혼잡/시간초과 가능). 잠시 후 다시 'AI 분석'을 눌러주세요."
              : "분석에 실패했어요. 잠시 후 다시 시도해 주세요.")
        );
      }
      if (!branchId && data.detectedBranch?.id) {
        setBranchId(data.detectedBranch.id);
        toast.info(`지점 자동 감지: ${data.detectedBranch.name}`);
      }
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

  // 제품을 고르면 그 제품의 거래처·단가도 같이 따라오게 한다.
  // 규격을 물어본 줄은 서버가 단가를 비워 보내므로, 사용자가 고른 형제의 값이 여기서 채워진다.
  const chooseProduct = (i: number, productId: string) =>
    setLines((prev) =>
      prev.map((l, j) => {
        if (j !== i) return l;
        const c = l.candidates.find((x) => x.id === productId);
        return {
          ...l,
          product_id: productId,
          best_vendor: c?.vendor ?? null,
          best_vendor_id: c?.vendor_id ?? null,
          best_price: c?.price ?? null,
          sourceable: c?.sourceable ?? false,
        };
      })
    );

  // AI 추천(1순위 후보)을 미매칭 품목에 한 번에 적용.
  // 규격을 물어본 줄은 건너뛴다 — 한 번 눌러서 질문이 무시되면 물어보는 의미가 없다.
  const applyRecommendations = () => {
    let n = 0;
    let skipped = 0;
    setLines((prev) =>
      prev.map((l) => {
        if (l.product_id || l.candidates.length === 0) return l;
        if (l.needs_spec) {
          skipped += 1;
          return l;
        }
        n += 1;
        const c = l.candidates[0];
        return {
          ...l,
          product_id: c.id,
          best_vendor: c.vendor ?? l.best_vendor,
          best_vendor_id: c.vendor_id ?? l.best_vendor_id,
          best_price: c.price ?? l.best_price,
          sourceable: c.sourceable ?? l.sourceable,
        };
      })
    );
    if (n > 0) toast.success(`추천 ${n}건 적용${skipped > 0 ? ` · 규격 확인 필요 ${skipped}건은 건너뜀` : ""}`);
    else if (skipped > 0) toast.info(`규격을 직접 골라야 하는 ${skipped}건만 남았습니다.`);
    else toast.success("적용할 추천이 없습니다.");
  };
  const recommendable = lines.filter((l) => !l.product_id && !l.needs_spec && l.candidates.length > 0).length;

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
      const { data: inserted, error: dErr } = await supabase
        .from("demand_lines")
        .insert(rows)
        .select("id, sort_order");
      if (dErr) throw dErr;

      // AI 추천 거래처로 자동 발주(켜둔 경우) — 매칭된 품목 + 추천 거래처가 있을 때만
      let assignedCount = 0;
      if (autoAssign && inserted) {
        const allocRows = (inserted as { id: string; sort_order: number | null }[])
          .map((row) => {
            const l = valid[row.sort_order ?? -1];
            if (!l || !l.product_id || !l.best_vendor_id) return null;
            return {
              demand_line_id: row.id,
              vendor_id: l.best_vendor_id,
              vendor_label: null,
              order_qty: Number(l.quantity) || 0,
              unit_price: l.best_price,
              status: "ordered",
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (allocRows.length > 0) {
          const { error: aErr } = await supabase.from("sourcing_allocations").insert(allocRows);
          if (aErr) toast.error(`자동 배정 일부 실패: ${aErr.message}`);
          else assignedCount = allocRows.length;
        }
      }

      toast.success(
        assignedCount > 0
          ? `발주건 생성 완료 · ${assignedCount}건 추천 거래처로 자동 발주`
          : "발주건 생성 완료"
      );
      const unresolved = valid.filter((l) => l.needs_spec && !l.product_id).length;
      if (unresolved > 0) toast.info(`규격을 못 정한 ${unresolved}건은 확보 관리에서 직접 지정해 주세요.`);
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
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              title="비워두면 주문 내용에서 지점을 자동 감지해 그 지점 이력으로 매칭합니다"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700"
            >
              <option value="">지점 자동 감지</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
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
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <p className="text-sm font-medium text-gray-700">추출 {lines.length}건 — 매칭·거래처를 AI가 제안. 확인/수정만 하세요.</p>
                {recommendable > 0 && (
                  <button
                    onClick={applyRecommendations}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> 추천 일괄 적용 ({recommendable})
                  </button>
                )}
              </div>
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
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${confCls(l.confidence)}`}>
                        {l.confidence > 0 ? `${l.confidence}%` : "신규"}
                      </span>
                      <button onClick={() => setLines((p) => p.filter((_, j) => j !== i))} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 pl-0.5">
                      <select
                        value={l.product_id}
                        onChange={(e) => {
                          if (e.target.value === "__search__") openSearch(i, l.raw_name);
                          else chooseProduct(i, e.target.value);
                        }}
                        className={`flex-1 min-w-[200px] px-2 py-1.5 border rounded-lg text-sm ${
                          l.needs_spec && !l.product_id ? "border-amber-400 bg-amber-50" : "border-gray-200"
                        }`}
                      >
                        <option value="">매칭 안 함 (미확정)</option>
                        {l.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.spec ? ` (${c.spec})` : ""}
                            {c.price != null ? ` · ₩${c.price.toLocaleString()}` : ""}
                            {c.spec_match === "conflict" ? " · 규격 다름" : ""}
                          </option>
                        ))}
                        <option value="__search__">+ 직접 검색…</option>
                      </select>
                      {!l.product_id && !l.needs_spec && l.candidates.length > 0 && (
                        <button
                          onClick={() => chooseProduct(i, l.candidates[0].id)}
                          title={`추천 적용: ${l.candidates[0].name}`}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> 추천
                        </button>
                      )}
                      {l.reason && <span className="text-xs text-gray-400">{l.reason}</span>}
                      {l.product_id && l.best_vendor && (
                        <span className="text-xs text-emerald-700">
                          추천: {l.best_vendor} {l.best_price != null ? l.best_price.toLocaleString() : "-"}
                        </span>
                      )}
                      {l.product_id && !l.sourceable && (
                        <span className="text-xs text-red-500">주문가능 거래처 없음(품절/미등록)</span>
                      )}
                    </div>
                    {searchFor === i && (
                      <div className="mt-2 p-2 border border-blue-200 rounded-lg bg-blue-50/40">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <input
                            autoFocus
                            value={searchQ}
                            onChange={(e) => setSearchQ(e.target.value)}
                            placeholder="제품명으로 카탈로그 검색…"
                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                          />
                          <button onClick={closeSearch} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
                            닫기
                          </button>
                        </div>
                        <div className="mt-1.5 max-h-44 overflow-auto">
                          {searching && <p className="text-xs text-gray-400 px-1 py-1">검색 중…</p>}
                          {!searching && searchQ.trim() && searchResults.length === 0 && (
                            <p className="text-xs text-gray-400 px-1 py-1">결과 없음</p>
                          )}
                          {searchResults.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => pickProduct(i, p)}
                              className="block w-full text-left px-2 py-1.5 text-sm rounded hover:bg-white"
                            >
                              {p.name}{p.spec ? ` (${p.spec})` : ""}
                            </button>
                          ))}
                        </div>
                        {!registering ? (
                          <button
                            onClick={() => setRegistering(true)}
                            className="mt-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                          >
                            + 찾는 제품이 없으면 새로 등록
                          </button>
                        ) : (
                          <QuickProductCreate
                            defaultName={searchQ.trim() || l.raw_name}
                            onCancel={() => setRegistering(false)}
                            onCreated={(p) =>
                              pickProduct(i, {
                                id: p.id,
                                name: p.name,
                                spec: p.spec,
                                vendor: p.vendor,
                                vendor_id: p.vendor_id,
                                price: p.price,
                                sourceable: p.vendor_id != null,
                              })
                            }
                          />
                        )}
                      </div>
                    )}
                    {l.note && (
                      <div
                        className={`flex items-start gap-1 mt-1 text-xs ${
                          l.needs_spec && !l.product_id ? "text-amber-700 font-medium" : "text-amber-600"
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {l.note}
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
              <label className="sm:col-span-2 flex items-center gap-2 px-1 text-sm text-gray-700 cursor-pointer select-none">
                <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} className="cursor-pointer" />
                AI 추천 거래처로 자동 발주 (매칭된 품목을 최저가·재고 있는 거래처로 바로 배정 — 소싱 화면에서 수정 가능)
              </label>
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
