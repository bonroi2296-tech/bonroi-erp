"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import type { TablesUpdate } from "@/lib/database.types";
import { ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Alloc {
  id: string;
  vendor_id: string | null;
  vendor_label: string | null;
  order_qty: number;
  unit_price: number | null;
  status: string;
  shipped_qty: number | null;
  note: string | null;
  vendor: { name: string } | null;
}
interface Demand {
  id: string;
  raw_name: string;
  product_id: string | null;
  required_qty: number;
  unit_label: string | null;
  purpose: string | null;
  sort_order: number | null;
  sourcing_allocations: Alloc[];
}
interface Job {
  id: string;
  title: string;
  requester: string | null;
  delivery_note: string | null;
  status: string;
  branch: { name: string } | null;
  demand_lines: Demand[];
}
interface Vendor {
  id: string;
  name: string;
}
interface VendorOption {
  vendor_id: string;
  vendor_name: string;
  price: number | null;
  available: boolean;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  ordered: { label: "주문", cls: "bg-gray-100 text-gray-600" },
  shipped: { label: "출고완료", cls: "bg-emerald-100 text-emerald-700" },
  partial: { label: "부분출고", cls: "bg-amber-100 text-amber-700" },
  unavailable: { label: "출고불가", cls: "bg-red-100 text-red-700" },
};

function securedOf(a: Alloc): number {
  if (a.status === "shipped") return a.order_qty;
  if (a.status === "partial") return a.shipped_qty ?? 0;
  return 0;
}

export default function SourcingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorOptions, setVendorOptions] = useState<Record<string, VendorOption[]>>({});
  const [loading, setLoading] = useState(true);

  // 품목(수요줄) 추가 폼
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("개");
  const [newPurpose, setNewPurpose] = useState("");

  const fetchJob = useCallback(async () => {
    const { data } = await supabase
      .from("sourcing_jobs")
      .select(
        "id, title, requester, delivery_note, status, branch:branches(name), demand_lines(id, raw_name, product_id, required_qty, unit_label, purpose, sort_order, sourcing_allocations(id, vendor_id, vendor_label, order_qty, unit_price, status, shipped_qty, note, vendor:vendors(name)))"
      )
      .eq("id", id)
      .single();
    if (data) {
      const j = data as unknown as Job;
      j.demand_lines = (j.demand_lines || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setJob(j);

      // 매칭된 품목의 거래처 옵션(주문가능·최저가) 구성 — 동기화한 단가·공급상태 활용
      const productIds = Array.from(
        new Set(j.demand_lines.map((d) => d.product_id).filter((x): x is string => !!x))
      );
      if (productIds.length) {
        const [vpRes, vssRes] = await Promise.all([
          supabase
            .from("vendor_products")
            .select("product_id, vendor_id, unit_price, vendor:vendors(name)")
            .in("product_id", productIds),
          supabase
            .from("vendor_supply_status")
            .select("product_id, vendor_id")
            .in("product_id", productIds),
        ]);
        const blocked = new Set(
          ((vssRes.data as { product_id: string; vendor_id: string }[]) || []).map(
            (s) => `${s.product_id}:${s.vendor_id}`
          )
        );
        const map: Record<string, VendorOption[]> = {};
        for (const r of (vpRes.data as unknown as {
          product_id: string;
          vendor_id: string;
          unit_price: number | null;
          vendor: { name: string } | null;
        }[]) || []) {
          (map[r.product_id] ||= []).push({
            vendor_id: r.vendor_id,
            vendor_name: r.vendor?.name ?? "?",
            price: r.unit_price,
            available: !blocked.has(`${r.product_id}:${r.vendor_id}`),
          });
        }
        for (const k in map)
          map[k].sort(
            (a, b) =>
              Number(b.available) - Number(a.available) ||
              (a.price ?? Infinity) - (b.price ?? Infinity)
          );
        setVendorOptions(map);
      } else {
        setVendorOptions({});
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchJob();
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVendors((data as Vendor[]) || []));
  }, [fetchJob]);

  const addDemand = async () => {
    if (!newName.trim()) return toast.error("품목명을 입력하세요.");
    const sort = job?.demand_lines.length ?? 0;
    const { error } = await supabase.from("demand_lines").insert({
      job_id: id,
      raw_name: newName.trim(),
      required_qty: Number(newQty) || 0,
      unit_label: newUnit.trim() || null,
      purpose: newPurpose.trim() || null,
      sort_order: sort,
    });
    if (error) return toast.error(error.message);
    setNewName("");
    setNewQty("1");
    setNewUnit("개");
    setNewPurpose("");
    fetchJob();
  };

  const deleteDemand = async (demandId: string) => {
    const { error } = await supabase.from("demand_lines").delete().eq("id", demandId);
    if (error) return toast.error(error.message);
    fetchJob();
  };

  const addAlloc = async (demandId: string, payload: { vendor_id: string | null; vendor_label: string | null; order_qty: number; unit_price: number | null }) => {
    const { error } = await supabase.from("sourcing_allocations").insert({
      demand_line_id: demandId,
      vendor_id: payload.vendor_id,
      vendor_label: payload.vendor_label,
      order_qty: payload.order_qty,
      unit_price: payload.unit_price,
      status: "ordered",
    });
    if (error) return toast.error(error.message);
    fetchJob();
  };

  const updateAlloc = async (allocId: string, patch: TablesUpdate<"sourcing_allocations">) => {
    const { error } = await supabase
      .from("sourcing_allocations")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", allocId);
    if (error) return toast.error(error.message);
    fetchJob();
  };

  const deleteAlloc = async (allocId: string) => {
    const { error } = await supabase.from("sourcing_allocations").delete().eq("id", allocId);
    if (error) return toast.error(error.message);
    fetchJob();
  };

  const onStatusChange = (a: Alloc, status: string) => {
    if (status === "shipped") updateAlloc(a.id, { status, shipped_qty: a.order_qty });
    else if (status === "partial") updateAlloc(a.id, { status, shipped_qty: a.shipped_qty ?? 0 });
    else updateAlloc(a.id, { status, shipped_qty: 0 });
  };

  if (loading) {
    return (
      <>
        <TopBar title="확보 관리" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </>
    );
  }

  if (!job) {
    return (
      <>
        <TopBar title="확보 관리" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
          <p>발주건을 찾을 수 없습니다.</p>
          <Link href="/sourcing" className="text-blue-600 text-sm">
            목록으로
          </Link>
        </div>
      </>
    );
  }

  const totalRequired = job.demand_lines.reduce((s, d) => s + d.required_qty, 0);
  const totalSecured = job.demand_lines.reduce(
    (s, d) => s + d.sourcing_allocations.reduce((a, x) => a + securedOf(x), 0),
    0
  );

  return (
    <>
      <TopBar title={job.title} subtitle={`확보 ${totalSecured} / 필요 ${totalRequired}`} />
      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        <div className="flex items-center justify-between">
          <Link href="/sourcing" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-4 h-4" /> 목록
          </Link>
          <div className="text-xs text-gray-500 flex gap-3">
            {job.branch?.name && <span>지점 {job.branch.name}</span>}
            {job.requester && <span>요청처 {job.requester}</span>}
            {job.delivery_note && <span>배송 {job.delivery_note}</span>}
          </div>
        </div>

        <div className="space-y-3">
          {job.demand_lines.map((d) => {
            const secured = d.sourcing_allocations.reduce((a, x) => a + securedOf(x), 0);
            const ordered = d.sourcing_allocations.reduce((a, x) => a + x.order_qty, 0);
            const shortfall = Math.max(0, d.required_qty - secured);
            const pct = d.required_qty > 0 ? Math.min(100, Math.round((secured / d.required_qty) * 100)) : 0;
            return (
              <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-sm md:text-base">{d.raw_name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      필요 {d.required_qty}
                      {d.unit_label ? ` ${d.unit_label}` : ""}
                      {d.purpose ? ` · ${d.purpose}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {shortfall > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <AlertTriangle className="w-3 h-3" /> 부족 {shortfall} · 재소싱 필요
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> 확보완료
                      </span>
                    )}
                    <button onClick={() => deleteDemand(d.id)} className="p-1 text-gray-300 hover:text-red-500" title="품목 삭제">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs mb-1 text-gray-500">
                  <span>확보 {secured} · 발주 {ordered}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div className={`h-full ${shortfall > 0 ? "bg-blue-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                </div>

                <AllocTable
                  allocs={d.sourcing_allocations}
                  vendors={vendors}
                  options={d.product_id ? vendorOptions[d.product_id] ?? [] : []}
                  onAdd={(p) => addAlloc(d.id, p)}
                  onStatus={onStatusChange}
                  onShipped={(a, qty) => updateAlloc(a.id, { shipped_qty: qty })}
                  onDelete={deleteAlloc}
                />
              </div>
            );
          })}
        </div>

        {/* 품목 추가 */}
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-4">
          <p className="text-xs font-medium text-gray-600 mb-2">품목 추가</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="품목명"
              className="flex-1 min-w-[160px] px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <input
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              type="number"
              min={0}
              placeholder="수량"
              className="w-20 px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <input
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="단위"
              className="w-20 px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <input
              value={newPurpose}
              onChange={(e) => setNewPurpose(e.target.value)}
              placeholder="용도"
              className="w-32 px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={addDemand}
              className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              <Plus className="w-4 h-4" /> 추가
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function AllocTable({
  allocs,
  vendors,
  options,
  onAdd,
  onStatus,
  onShipped,
  onDelete,
}: {
  allocs: Alloc[];
  vendors: Vendor[];
  options: VendorOption[];
  onAdd: (p: { vendor_id: string | null; vendor_label: string | null; order_qty: number; unit_price: number | null }) => void;
  onStatus: (a: Alloc, status: string) => void;
  onShipped: (a: Alloc, qty: number) => void;
  onDelete: (allocId: string) => void;
}) {
  const [vendorSel, setVendorSel] = useState("");
  const [vendorText, setVendorText] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const cheapestId = options.find((o) => o.available)?.vendor_id;

  const submit = () => {
    const isNew = vendorSel === "__new__";
    if (!isNew && !vendorSel) return;
    if (isNew && !vendorText.trim()) return;
    onAdd({
      vendor_id: isNew ? null : vendorSel,
      vendor_label: isNew ? vendorText.trim() : null,
      order_qty: Number(qty) || 0,
      unit_price: price ? Number(price) : null,
    });
    setVendorSel("");
    setVendorText("");
    setQty("");
    setPrice("");
  };

  return (
    <div className="space-y-2">
      {allocs.length > 0 && (
        <div className="space-y-1.5">
          {allocs.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-medium text-gray-900 min-w-[100px]">{a.vendor?.name ?? a.vendor_label ?? "미지정"}</span>
              <span className="text-gray-500">발주 {a.order_qty}</span>
              {a.unit_price != null && <span className="text-gray-400">@{a.unit_price.toLocaleString()}</span>}
              <select
                value={a.status}
                onChange={(e) => onStatus(a, e.target.value)}
                className={`ml-auto px-2 py-1 rounded-md text-xs font-medium border-0 outline-none ${STATUS[a.status]?.cls ?? ""}`}
              >
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              {a.status === "partial" && (
                <input
                  type="number"
                  min={0}
                  defaultValue={a.shipped_qty ?? 0}
                  onBlur={(e) => onShipped(a, Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-gray-200 rounded-md text-xs"
                  title="출고 수량"
                />
              )}
              <button onClick={() => onDelete(a.id)} className="p-1 text-gray-300 hover:text-red-500" title="삭제">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {options.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-gray-400">추천:</span>
          {options.map((o) => (
            <button
              key={o.vendor_id}
              disabled={!o.available}
              onClick={() => {
                setVendorSel(o.vendor_id);
                setPrice(o.price != null ? String(o.price) : "");
              }}
              title={o.available ? "클릭하면 단가 자동입력" : "품절/중단"}
              className={`px-2 py-1 rounded-md text-xs border transition ${
                !o.available
                  ? "border-gray-200 text-gray-300 line-through cursor-not-allowed"
                  : o.vendor_id === cheapestId
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100"
                  : "border-blue-200 text-blue-700 hover:bg-blue-50"
              }`}
            >
              {o.vendor_id === cheapestId && o.available ? "최저 " : ""}
              {o.vendor_name} {o.price != null ? o.price.toLocaleString() : "-"}
              {!o.available ? " ⛔" : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={vendorSel}
          onChange={(e) => setVendorSel(e.target.value)}
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">거래처 선택</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          <option value="__new__">+ 새 거래처 직접 입력</option>
        </select>
        {vendorSel === "__new__" && (
          <input
            value={vendorText}
            onChange={(e) => setVendorText(e.target.value)}
            placeholder="새 거래처명"
            className="w-32 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        )}
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          type="number"
          min={0}
          placeholder="발주수량"
          className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          type="number"
          min={0}
          placeholder="단가"
          className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          onClick={submit}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-3.5 h-3.5" /> 거래처 추가
        </button>
      </div>
    </div>
  );
}
