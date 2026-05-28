"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { branchColor } from "@/lib/colors";
import { Plus, X, Trash2, PackageSearch, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

interface AllocRow {
  order_qty: number;
  status: string;
  shipped_qty: number | null;
}
interface DemandRow {
  id: string;
  required_qty: number;
  sourcing_allocations: AllocRow[];
}
interface JobRow {
  id: string;
  title: string;
  requester: string | null;
  delivery_note: string | null;
  status: string;
  created_at: string | null;
  branch: { name: string; short_name: string | null } | null;
  demand_lines: DemandRow[];
}

interface Branch {
  id: string;
  name: string;
}

// 할당 1건의 실제 확보 수량(출고 기준). 주문/출고불가는 0.
function securedOf(a: AllocRow): number {
  if (a.status === "shipped") return a.order_qty;
  if (a.status === "partial") return a.shipped_qty ?? 0;
  return 0;
}

interface NewDemand {
  raw_name: string;
  required_qty: string;
  unit_label: string;
  purpose: string;
}

const emptyDemand = (): NewDemand => ({ raw_name: "", required_qty: "1", unit_label: "개", purpose: "" });

export default function SourcingPage() {
  const toast = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [branchId, setBranchId] = useState("");
  const [requester, setRequester] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [demands, setDemands] = useState<NewDemand[]>([emptyDemand()]);
  const [saving, setSaving] = useState(false);

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase
      .from("sourcing_jobs")
      .select(
        "id, title, requester, delivery_note, status, created_at, branch:branches(name, short_name), demand_lines(id, required_qty, sourcing_allocations(order_qty, status, shipped_qty))"
      )
      .order("created_at", { ascending: false });
    setJobs((data as unknown as JobRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchJobs();
    supabase
      .from("branches")
      .select("id, name")
      .order("name")
      .then(({ data }) => setBranches((data as Branch[]) || []));
  }, [fetchJobs]);

  const resetForm = () => {
    setTitle("");
    setBranchId("");
    setRequester("");
    setDeliveryNote("");
    setDemands([emptyDemand()]);
  };

  const handleCreate = async () => {
    const validDemands = demands.filter((d) => d.raw_name.trim());
    if (!title.trim()) return toast.error("발주건 제목을 입력하세요.");
    if (validDemands.length === 0) return toast.error("품목을 1개 이상 입력하세요.");

    setSaving(true);
    try {
      const { data: job, error: jobErr } = await supabase
        .from("sourcing_jobs")
        .insert({
          title: title.trim(),
          branch_id: branchId || null,
          requester: requester.trim() || null,
          delivery_note: deliveryNote.trim() || null,
        })
        .select("id")
        .single();
      if (jobErr || !job) throw jobErr ?? new Error("발주건 생성 실패");

      const rows = validDemands.map((d, i) => ({
        job_id: job.id,
        raw_name: d.raw_name.trim(),
        required_qty: Number(d.required_qty) || 0,
        unit_label: d.unit_label.trim() || null,
        purpose: d.purpose.trim() || null,
        sort_order: i,
      }));
      const { error: dErr } = await supabase.from("demand_lines").insert(rows);
      if (dErr) throw dErr;

      toast.success("발주건이 생성되었습니다.");
      setModalOpen(false);
      resetForm();
      fetchJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const summarize = (job: JobRow) => {
    let required = 0;
    let secured = 0;
    let shortLines = 0;
    for (const d of job.demand_lines || []) {
      required += d.required_qty;
      const s = (d.sourcing_allocations || []).reduce((acc, a) => acc + securedOf(a), 0);
      secured += s;
      if (s < d.required_qty) shortLines += 1;
    }
    return { required, secured, shortLines, lineCount: (job.demand_lines || []).length };
  };

  return (
    <>
      <TopBar title="확보 관리" subtitle="병원 발주건을 여러 거래처로 쪼개 발주하고 확보 현황을 추적" />
      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">총 {jobs.length}건</p>
          <div className="flex items-center gap-2">
            <Link
              href="/sourcing/parse"
              className="flex items-center gap-2 px-4 py-2 border border-blue-200 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50"
            >
              <Sparkles className="w-4 h-4" /> 주문 붙여넣기
            </Link>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> 새 발주건
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <PackageSearch className="w-12 h-12 mb-3" />
            <p className="text-sm">아직 발주건이 없습니다. &quot;새 발주건&quot;으로 시작하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {jobs.map((job) => {
              const s = summarize(job);
              const pct = s.required > 0 ? Math.min(100, Math.round((s.secured / s.required) * 100)) : 0;
              const done = s.shortLines === 0 && s.required > 0;
              return (
                <Link
                  key={job.id}
                  href={`/sourcing/${job.id}`}
                  className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 hover:shadow-md transition-shadow block"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-gray-900 text-sm md:text-base truncate">{job.title}</h3>
                    {done ? (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> 확보완료
                      </span>
                    ) : s.shortLines > 0 ? (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <AlertTriangle className="w-3 h-3" /> 부족 {s.shortLines}건
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5 mb-3">
                    {job.branch?.name && (
                      <p className="flex items-center gap-1.5">
                        <span>지점:</span>
                        {job.branch.short_name ? (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${branchColor(job.branch.short_name)}`}>
                            {job.branch.short_name}
                          </span>
                        ) : null}
                        <span className="text-gray-700">{job.branch.name}</span>
                      </p>
                    )}
                    {job.requester && <p>요청처: {job.requester}</p>}
                    {job.delivery_note && <p className="truncate">배송: {job.delivery_note}</p>}
                    <p>품목 {s.lineCount}종</p>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500">확보</span>
                    <span className="font-medium text-gray-900">
                      {s.secured} / {s.required}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${done ? "bg-emerald-500" : "bg-blue-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">새 발주건</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">제목 *</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 성동점 5/20 발주"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">지점</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">선택 안 함</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">요청처</label>
                  <input
                    value={requester}
                    onChange={(e) => setRequester(e.target.value)}
                    placeholder="예: 4층 병동"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">배송 메모</label>
                  <input
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    placeholder="예: 4층으로 배송"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600">품목 (자유 입력 — 매칭은 나중에)</label>
                  <button
                    onClick={() => setDemands((prev) => [...prev, emptyDemand()])}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> 줄 추가
                  </button>
                </div>
                <div className="space-y-2">
                  {demands.map((d, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-12 gap-2">
                        <input
                          value={d.raw_name}
                          onChange={(e) =>
                            setDemands((prev) => prev.map((x, j) => (j === i ? { ...x, raw_name: e.target.value } : x)))
                          }
                          placeholder="품목명 (예: Airway 8cm)"
                          className="col-span-5 px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <input
                          value={d.required_qty}
                          onChange={(e) =>
                            setDemands((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, required_qty: e.target.value } : x))
                            )
                          }
                          type="number"
                          min={0}
                          placeholder="수량"
                          className="col-span-2 px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <input
                          value={d.unit_label}
                          onChange={(e) =>
                            setDemands((prev) => prev.map((x, j) => (j === i ? { ...x, unit_label: e.target.value } : x)))
                          }
                          placeholder="단위"
                          className="col-span-2 px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <input
                          value={d.purpose}
                          onChange={(e) =>
                            setDemands((prev) => prev.map((x, j) => (j === i ? { ...x, purpose: e.target.value } : x)))
                          }
                          placeholder="용도"
                          className="col-span-3 px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <button
                        onClick={() => setDemands((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}
                        className="p-2 text-gray-400 hover:text-red-500"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "생성 중..." : "생성"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
