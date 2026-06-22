"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import type { TablesUpdate, TablesInsert } from "@/lib/database.types";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Truck, Upload, X, Sparkles, Copy, ChevronDown, ChevronUp } from "lucide-react";

interface Alloc {
  id: string;
  demand_line_id: string;
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
  product: { name: string; spec: string | null; supply_price: number | null } | null;
  required_qty: number;
  unit_label: string | null;
  purpose: string | null;
  sort_order: number | null;
  supply_price: number | null;
  sourcing_allocations: Alloc[];
}
interface Job {
  id: string;
  title: string;
  requester: string | null;
  delivery_note: string | null;
  status: string;
  branch_id: string | null;
  created_at: string | null;
  branch: { name: string } | null;
  demand_lines: Demand[];
}
interface Vendor {
  id: string;
  name: string;
  shipping_fee?: number | null;
  free_shipping_min?: number | null;
  shipping_policy?: string | null;
}
interface VendorOption {
  vendor_id: string;
  vendor_name: string;
  price: number | null;
  available: boolean;
}
interface Settlement {
  id: string;
  vendor_id: string | null;
  vendor_label: string | null;
  shipping_fee: number;
  settled: boolean;
  order_id: string | null;
}
// 거래처별 정산 묶음(발주건 전체의 할당을 거래처로 모음)
interface VendorItem {
  name: string;
  unit: string | null;
  qty: number;
  price: number | null;
  status: string;
}
interface VendorGroup {
  key: string;
  vendor_id: string | null;
  vendor_label: string | null;
  name: string;
  policy: string;
  freeMin: number;
  flatFee: number;
  subtotal: number;
  allocs: Alloc[];
  items: VendorItem[];
}
interface ReconcileRow {
  demand_line_id: string | null;
  product_id: string | null;
  matched_name: string | null;
  doc_name: string;
  qty: number;
  unit_price: number | null;
  edi_code: string | null;
  pack_size: number | null;
  pack_unit: string | null;
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
// 병원에 알릴 사유. 빈 문자열이면 정상.
function reasonOf(d: Demand): string {
  const allocs = d.sourcing_allocations;
  const secured = allocs.reduce((s, a) => s + securedOf(a), 0);
  const ordered = allocs.reduce((s, a) => s + a.order_qty, 0);
  const hasShipped = allocs.some((a) => a.status === "shipped" || a.status === "partial");
  const allUnavail = allocs.length > 0 && allocs.every((a) => a.status === "unavailable");
  if (allUnavail) return "재고 없음";
  if (hasShipped && secured < d.required_qty) return `부족 출고 (-${d.required_qty - secured})`;
  if (allocs.length === 0) return "거래처 배정 필요";
  if (ordered < d.required_qty) return `발주 부족 (-${d.required_qty - ordered})`;
  return "";
}
// 정산 금액 기준 수량: 출고 확정 전(주문)이면 발주수량, 확정 후엔 실제 출고수량
function billedQty(a: Alloc): number {
  if (a.status === "shipped") return a.order_qty;
  if (a.status === "partial") return a.shipped_qty ?? 0;
  if (a.status === "unavailable") return 0;
  return a.order_qty;
}
const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
// 규칙형 거래처 자동 배송비: 소계가 무료기준 이상이면 0, 아니면 정액
function autoShip(g: { policy: string; freeMin: number; flatFee: number; subtotal: number }): number {
  if (g.policy !== "auto") return 0;
  if (g.freeMin > 0 && g.subtotal >= g.freeMin) return 0;
  return g.flatFee || 0;
}

export default function SourcingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorOptions, setVendorOptions] = useState<Record<string, VendorOption[]>>({});
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [reconcileFor, setReconcileFor] = useState<VendorGroup | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedRows((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const [loading, setLoading] = useState(true);

  // 거래처 일괄배정용 선택 상태
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [bulkVendor, setBulkVendor] = useState("");
  const toggleSelect = (lineId: string) => {
    setSelectedLines((s) => {
      const n = new Set(s);
      if (n.has(lineId)) n.delete(lineId);
      else n.add(lineId);
      return n;
    });
  };

  // 품목(수요줄) 추가 폼
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("개");
  const [newPurpose, setNewPurpose] = useState("");

  const fetchJob = useCallback(async () => {
    const { data } = await supabase
      .from("sourcing_jobs")
      .select(
        "id, title, requester, delivery_note, status, branch_id, created_at, branch:branches(name), demand_lines(id, raw_name, product_id, supply_price, product:products(name, spec, supply_price), required_qty, unit_label, purpose, sort_order, sourcing_allocations(id, demand_line_id, vendor_id, vendor_label, order_qty, unit_price, status, shipped_qty, note, vendor:vendors(name)))"
      )
      .eq("id", id)
      .single();
    if (data) {
      const j = data as unknown as Job;
      j.demand_lines = (j.demand_lines || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setJob(j);

      supabase
        .from("sourcing_settlements")
        .select("id, vendor_id, vendor_label, shipping_fee, settled, order_id")
        .eq("job_id", id)
        .then(({ data: stl }) => setSettlements((stl as Settlement[]) || []));

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
      .select("id, name, shipping_fee, free_shipping_min, shipping_policy")
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

  // 품목별 납품가(병원가) 덮어쓰기. 빈값이면 null → 품목마스터 기본값 사용.
  const updateDemandSupply = async (d: Demand, raw: string) => {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v !== null && Number.isNaN(v)) return;
    if (v === (d.supply_price ?? null)) return;
    const { error } = await supabase.from("demand_lines").update({ supply_price: v }).eq("id", d.id);
    if (error) return toast.error(error.message);
    fetchJob();
  };

  // 병원용 변경 내역(거래처·단가 제외) 텍스트를 클립보드로
  const copyForHospital = async () => {
    if (!job) return;
    const rows: string[][] = [["주문 제품", "주문 수량", "배송 제품", "배송 수량", "사유"]];
    for (const d of job.demand_lines) {
      const secured = d.sourcing_allocations.reduce((s, a) => s + securedOf(a), 0);
      const reason = reasonOf(d);
      const productLabel = d.product
        ? `${d.product.name}${d.product.spec ? ` ${d.product.spec}` : ""}`
        : d.raw_name;
      const orderQty = `${d.required_qty}${d.unit_label ? ` ${d.unit_label}` : ""}`;
      const showShipped = reason !== "재고 없음";
      rows.push([
        d.raw_name,
        orderQty,
        showShipped ? productLabel : "—",
        showShipped ? String(secured) : "—",
        reason,
      ]);
    }
    const text = rows.map((r) => r.join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`병원용 변경 내역 ${rows.length - 1}건 복사됨`);
    } catch {
      toast.error("복사 실패 — 표를 직접 선택해 복사하세요.");
    }
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

  // 선택한 여러 품목에 거래처를 한 번에 배정(수량=필요수량, 단가=거래처 추천가 자동)
  const bulkAssignVendor = async () => {
    if (!bulkVendor || !job) return;
    const v = vendors.find((x) => x.id === bulkVendor);
    if (!v) return;
    const ids = Array.from(selectedLines);
    if (ids.length === 0) return;
    const rows = ids.map((did) => {
      const d = job.demand_lines.find((x) => x.id === did);
      const price = d?.product_id
        ? (vendorOptions[d.product_id] ?? []).find((o) => o.vendor_id === bulkVendor)?.price ?? null
        : null;
      return {
        demand_line_id: did,
        vendor_id: bulkVendor,
        vendor_label: null,
        order_qty: d?.required_qty ?? 0,
        unit_price: price,
        status: "ordered",
      };
    });
    const { error } = await supabase.from("sourcing_allocations").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length}개 품목을 ${v.name}에 배정했어요. 수량·단가는 개별 수정 가능.`);
    setSelectedLines(new Set());
    setBulkVendor("");
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

  const settlementOf = (g: VendorGroup) =>
    settlements.find((s) => (g.vendor_id ? s.vendor_id === g.vendor_id : s.vendor_label === g.vendor_label));

  const upsertSettlement = async (g: VendorGroup, patch: { shipping_fee?: number; settled?: boolean }) => {
    const existing = settlementOf(g);
    if (existing) {
      const { error } = await supabase
        .from("sourcing_settlements")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("sourcing_settlements").insert({
        job_id: id,
        vendor_id: g.vendor_id,
        vendor_label: g.vendor_id ? null : g.vendor_label,
        shipping_fee: patch.shipping_fee ?? 0,
        settled: patch.settled ?? false,
      });
      if (error) return toast.error(error.message);
    }
    fetchJob();
  };

  // 발주건의 "주문 날짜": 제목이 날짜면 그걸, 아니면 생성일, 그래도 없으면 오늘
  const orderDateOf = (): string => {
    const t = (job?.title ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    if (job?.created_at) return job.created_at.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  };
  const nextOrderNumber = async (): Promise<string> => {
    const { data, error } = await supabase.rpc("next_order_number");
    if (!error && typeof data === "string") return data;
    const { data: maxOrder } = await supabase
      .from("orders")
      .select("order_number")
      .order("order_number", { ascending: false })
      .limit(1);
    let n = 0;
    const m = maxOrder?.[0]?.order_number?.match(/ORD-\d{4}-(\d+)/);
    if (m) n = parseInt(m[1]);
    return `ORD-${new Date().getFullYear()}-${String(n + 1).padStart(4, "0")}`;
  };

  // 거래처 "완료" → 주문 내역(orders/order_items)에 반영, "완료 취소" → 제거.
  // toast/refetch 없이 DB만 처리(applyReconcile 와 완료 버튼이 공유). 최신 할당을 다시 읽어 실제 수량으로 구성.
  const writeVendorOrder = async (g: VendorGroup, complete: boolean, fee: number) => {
    const existing = settlementOf(g);
    // 이전에 생성한 주문이 있으면 먼저 제거(order_items 는 ON DELETE CASCADE)
    if (existing?.order_id) {
      await supabase.from("orders").delete().eq("id", existing.order_id);
    }

    let newOrderId: string | null = null;
    if (complete) {
      const { data: dls } = await supabase
        .from("demand_lines")
        .select(
          "id, raw_name, product_id, supply_price, product:products(name, spec, category, supply_price), sourcing_allocations(id, vendor_id, vendor_label, order_qty, unit_price, status, shipped_qty)"
        )
        .eq("job_id", id);
      type DRow = {
        raw_name: string;
        product_id: string | null;
        supply_price: number | null;
        product: { name: string; spec: string | null; category: string | null; supply_price: number | null } | null;
        sourcing_allocations: Alloc[];
      };
      const lineItems: TablesInsert<"order_items">[] = [];
      let category = "양방";
      for (const d of ((dls as unknown as DRow[]) || [])) {
        for (const a of d.sourcing_allocations || []) {
          const inGroup = g.vendor_id ? a.vendor_id === g.vendor_id : a.vendor_label === g.vendor_label;
          if (!inGroup) continue;
          const qty = billedQty(a);
          if (qty <= 0) continue;
          if (d.product?.category) category = d.product.category;
          const label = d.product ? `${d.product.name}${d.product.spec ? ` ${d.product.spec}` : ""}` : d.raw_name;
          const price = a.unit_price ?? 0;
          const supply = d.supply_price ?? d.product?.supply_price ?? 0; // 품목별 덮어쓰기 우선, 없으면 품목마스터
          lineItems.push({
            order_id: "",
            product_id: d.product_id,
            vendor_id: g.vendor_id,
            raw_product_name: label,
            quantity: qty,
            purchase_price: price,
            total_purchase: qty * price,
            supply_price: supply,
            total_supply: qty * supply,
            margin: (supply - price) * qty,
          });
        }
      }
      // 배송비는 매입만 있고 납품가 0 → 마진 -배송비 (주문 관리와 동일 규칙)
      if (fee > 0) {
        lineItems.push({
          order_id: "",
          product_id: null,
          vendor_id: g.vendor_id,
          raw_product_name: "배송비",
          quantity: 1,
          purchase_price: fee,
          total_purchase: fee,
          supply_price: 0,
          total_supply: 0,
          margin: -fee,
        });
      }
      if (lineItems.length > 0) {
        const totalPurchase = lineItems.reduce((s, it) => s + (it.total_purchase ?? 0), 0);
        const totalSupply = lineItems.reduce((s, it) => s + (it.total_supply ?? 0), 0);
        const { data: ord, error: oErr } = await supabase
          .from("orders")
          .insert({
            order_number: await nextOrderNumber(),
            branch_id: job?.branch_id ?? null,
            order_date: orderDateOf(),
            status: "완료",
            category,
            vendor_name: g.name,
            total_purchase_amount: totalPurchase,
            total_supply_amount: totalSupply,
            total_margin: totalSupply - totalPurchase,
            note: `소싱 자동 반영${job?.title ? ` · ${job.title}` : ""}`,
          })
          .select("id")
          .single();
        if (oErr || !ord) throw oErr ?? new Error("주문 생성 실패");
        newOrderId = ord.id;
        const { error: iErr } = await supabase
          .from("order_items")
          .insert(lineItems.map((it) => ({ ...it, order_id: newOrderId! })));
        if (iErr) throw iErr;
      }
    }

    if (existing) {
      const { error } = await supabase
        .from("sourcing_settlements")
        .update({ settled: complete, order_id: newOrderId, shipping_fee: fee, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("sourcing_settlements").insert({
        job_id: id,
        vendor_id: g.vendor_id,
        vendor_label: g.vendor_id ? null : g.vendor_label,
        shipping_fee: fee,
        settled: complete,
        order_id: newOrderId,
      });
      if (error) throw error;
    }
  };

  // 완료 버튼 핸들러(피드백 + 새로고침 포함)
  const toggleComplete = async (g: VendorGroup, complete: boolean, fee: number) => {
    try {
      await writeVendorOrder(g, complete, fee);
      toast.success(complete ? `${g.name} 완료 — 주문 내역에 올렸어요.` : `${g.name} 완료를 취소했어요.`);
      fetchJob();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 중 오류");
    }
  };

  // 출고확인서 분석 결과를 거래처별 할당에 반영(출고수량·단가·상태) + 배송비 정산
  const applyReconcile = async (g: VendorGroup, rows: ReconcileRow[], shippingFee: number) => {
    try {
      for (const r of rows) {
        if (!r.demand_line_id) continue;
        const dline = job?.demand_lines.find((d) => d.id === r.demand_line_id);
        const existing = dline?.sourcing_allocations.find((a) =>
          g.vendor_id ? a.vendor_id === g.vendor_id : a.vendor_label === g.vendor_label
        );
        const qty = Number(r.qty) || 0;
        const status = qty <= 0 ? "unavailable" : existing && qty < existing.order_qty ? "partial" : "shipped";
        if (existing) {
          const patch: TablesUpdate<"sourcing_allocations"> = {
            unit_price: r.unit_price ?? existing.unit_price,
            status,
            shipped_qty: qty,
            updated_at: new Date().toISOString(),
          };
          if (status === "shipped" && qty > existing.order_qty) patch.order_qty = qty;
          const { error } = await supabase.from("sourcing_allocations").update(patch).eq("id", existing.id);
          if (error) throw error;
        } else if (qty > 0) {
          const { error } = await supabase.from("sourcing_allocations").insert({
            demand_line_id: r.demand_line_id,
            vendor_id: g.vendor_id,
            vendor_label: g.vendor_id ? null : g.vendor_label,
            order_qty: qty,
            unit_price: r.unit_price,
            status,
            shipped_qty: qty,
          });
          if (error) throw error;
        }
      }
      // 출고확인서 반영 = 이 거래처 완료 → 주문 내역(orders/order_items)에 누적
      await writeVendorOrder(g, true, shippingFee);

      // 명세서에서 EDI/박스 정보가 잡혔으면 품목마스터의 빈 칸만 자동 채움(덮어쓰지 않음)
      const enriched = rows.filter((r) => r.product_id && (r.edi_code || r.pack_size != null || r.pack_unit));
      if (enriched.length) {
        const productIds = Array.from(new Set(enriched.map((r) => r.product_id!).filter((x): x is string => !!x)));
        const { data: existing } = await supabase
          .from("products")
          .select("id, edi_code, pack_size, pack_unit")
          .in("id", productIds);
        const byId = new Map(
          ((existing as { id: string; edi_code: string | null; pack_size: number | null; pack_unit: string | null }[]) ?? [])
            .map((p) => [p.id, p] as const)
        );
        let filled = 0;
        for (const r of enriched) {
          const cur = byId.get(r.product_id!);
          if (!cur) continue;
          const patch: TablesUpdate<"products"> = {};
          if (!cur.edi_code && r.edi_code) patch.edi_code = r.edi_code;
          if (cur.pack_size == null && r.pack_size != null) patch.pack_size = r.pack_size;
          if (!cur.pack_unit && r.pack_unit) patch.pack_unit = r.pack_unit;
          if (Object.keys(patch).length > 0) {
            await supabase.from("products").update(patch).eq("id", r.product_id!);
            filled++;
          }
        }
        if (filled > 0) toast.info(`품목마스터 ${filled}건 자동 보완(EDI·박스수량).`);
      }

      toast.success("출고확인서를 반영하고 주문 내역에 올렸습니다.");
      setReconcileFor(null);
      fetchJob();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "반영 중 오류");
    }
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

  // 거래처별 정산 묶음(발주건 전체의 할당을 거래처로 모음)
  const groupMap = new Map<string, VendorGroup>();
  for (const d of job.demand_lines) {
    for (const a of d.sourcing_allocations) {
      const key = a.vendor_id ? `v:${a.vendor_id}` : `l:${a.vendor_label ?? "미지정"}`;
      let g = groupMap.get(key);
      if (!g) {
        const vinfo = a.vendor_id ? vendors.find((v) => v.id === a.vendor_id) : undefined;
        g = {
          key,
          vendor_id: a.vendor_id,
          vendor_label: a.vendor_id ? null : a.vendor_label ?? "미지정",
          name: a.vendor?.name ?? a.vendor_label ?? "미지정",
          policy: vinfo?.shipping_policy ?? "later",
          freeMin: vinfo?.free_shipping_min ?? 0,
          flatFee: vinfo?.shipping_fee ?? 0,
          subtotal: 0,
          allocs: [],
          items: [],
        };
        groupMap.set(key, g);
      }
      const qty = billedQty(a);
      g.subtotal += qty * (a.unit_price ?? 0);
      g.allocs.push(a);
      const label = d.product ? `${d.product.name}${d.product.spec ? ` ${d.product.spec}` : ""}` : d.raw_name;
      g.items.push({ name: label, unit: d.unit_label, qty, price: a.unit_price, status: a.status });
    }
  }
  const groups = Array.from(groupMap.values()).sort((x, y) => y.subtotal - x.subtotal);
  const shipOf = (g: VendorGroup) => {
    const s = settlementOf(g);
    return s ? s.shipping_fee : autoShip(g);
  };
  const jobItems = groups.reduce((s, g) => s + g.subtotal, 0);
  const jobShip = groups.reduce((s, g) => s + shipOf(g), 0);

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

        {/* 거래처별 주문서 · 정산 — 거래처 가서 그대로 보고 주문 */}
        {groups.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-bold text-gray-900">거래처별 주문서</h2>
              <span className="text-xs text-gray-400">거래처마다 이 목록대로 주문하고, 출고확인서를 반영하면 완료 → 주문 내역에 쌓입니다</span>
              <span className="ml-auto text-sm text-gray-900 font-bold">총 매입원가 {won(jobItems + jobShip)}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {groups.map((g) => (
                <VendorOrderCard
                  key={g.key}
                  group={g}
                  settlement={settlementOf(g)}
                  autoFee={autoShip(g)}
                  onSaveShip={(fee) => upsertSettlement(g, { shipping_fee: fee })}
                  onComplete={(v) => toggleComplete(g, v, shipOf(g))}
                  onReconcile={() => setReconcileFor(g)}
                />
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-500">물품비 <b className="text-gray-900">{won(jobItems)}</b></span>
              <span className="text-gray-500">배송비 <b className="text-gray-900">{won(jobShip)}</b></span>
              <span className="text-gray-900 font-bold">합계 {won(jobItems + jobShip)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-2 mb-2">
          <h2 className="text-sm font-bold text-gray-900">
            병원 주문 vs 실제 출고
            <span className="ml-2 text-xs font-normal text-gray-400">한 줄을 누르면 거래처/단가가 펼쳐집니다</span>
          </h2>
          <button
            onClick={copyForHospital}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50"
            title="병원에 보낼 변경 내역(거래처·단가 제외) 텍스트를 클립보드에 복사"
          >
            <Copy className="w-3.5 h-3.5" /> 병원용 변경 내역 복사
          </button>
        </div>
        {selectedLines.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-2">
            <span className="text-sm font-medium text-blue-800">{selectedLines.size}개 품목 선택됨</span>
            <select
              value={bulkVendor}
              onChange={(e) => setBulkVendor(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">거래처 선택</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <button
              onClick={bulkAssignVendor}
              disabled={!bulkVendor}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> 선택 품목에 일괄 배정
            </button>
            <button
              onClick={() => setSelectedLines(new Set())}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              선택 해제
            </button>
            <span className="w-full text-[11px] text-blue-700/80">
              수량은 각 품목의 필요수량, 단가는 거래처 추천가로 채워집니다. 추가 후 개별 수정 가능.
            </span>
          </div>
        )}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase">
                <th className="w-8 px-2">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={job.demand_lines.length > 0 && selectedLines.size === job.demand_lines.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedLines.size > 0 && selectedLines.size < job.demand_lines.length;
                    }}
                    onChange={(e) =>
                      setSelectedLines(e.target.checked ? new Set(job.demand_lines.map((d) => d.id)) : new Set())
                    }
                    className="align-middle cursor-pointer"
                  />
                </th>
                <th className="w-6"></th>
                <th className="text-left px-3 py-2">주문 제품(병원)</th>
                <th className="text-right px-2 py-2 whitespace-nowrap">주문 수량</th>
                <th className="text-left px-3 py-2">출고 제품(실제)</th>
                <th className="text-right px-2 py-2 whitespace-nowrap">출고 수량</th>
                <th className="text-left px-2 py-2">사유</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {job.demand_lines.map((d) => {
                const secured = d.sourcing_allocations.reduce((a, x) => a + securedOf(x), 0);
                const ordered = d.sourcing_allocations.reduce((a, x) => a + x.order_qty, 0);
                const reason = reasonOf(d);
                const productLabel = d.product
                  ? `${d.product.name}${d.product.spec ? ` ${d.product.spec}` : ""}`
                  : "(매칭 필요)";
                const showShipped = reason !== "재고 없음";
                const expanded = expandedRows.has(d.id);
                const reasonCls = reason === "재고 없음"
                  ? "bg-red-100 text-red-700"
                  : reason
                  ? "bg-amber-100 text-amber-700"
                  : "";
                return (
                  <Fragment key={d.id}>
                    <tr
                      onClick={() => toggleExpand(d.id)}
                      className="cursor-pointer hover:bg-blue-50/40"
                    >
                      <td className="px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="품목 선택"
                          checked={selectedLines.has(d.id)}
                          onChange={() => toggleSelect(d.id)}
                          className="align-middle cursor-pointer"
                        />
                      </td>
                      <td className="px-2 text-gray-400 text-xs">{expanded ? "▾" : "▸"}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-900 font-medium">{d.raw_name}</td>
                      <td className="px-2 py-1.5 text-right text-xs whitespace-nowrap">
                        {d.required_qty}{d.unit_label ? ` ${d.unit_label}` : ""}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700">
                        {showShipped ? productLabel : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs whitespace-nowrap">
                        {showShipped ? secured : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-xs">
                        {reason && (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${reasonCls}`}>
                            {reason}
                          </span>
                        )}
                      </td>
                      <td className="px-1 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteDemand(d.id); }}
                          className="p-1 text-gray-300 hover:text-red-500"
                          title="품목 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50/70 px-4 py-3">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                              <span className="text-gray-500">발주 {ordered} · 확보 {secured} / 필요 {d.required_qty}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-400">납품가(병원가)</span>
                                <input
                                  type="number"
                                  min={0}
                                  defaultValue={d.supply_price ?? ""}
                                  placeholder={d.product?.supply_price != null ? String(d.product.supply_price) : "0"}
                                  onBlur={(e) => updateDemandSupply(d, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-24 px-2 py-1 border border-gray-200 rounded-md text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="text-gray-400">원</span>
                                {d.supply_price == null && (
                                  <span className="text-[10px] text-gray-400">
                                    {d.product?.supply_price != null ? "품목마스터 기본값" : "미설정"}
                                  </span>
                                )}
                              </div>
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
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
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

      {reconcileFor && (
        <ReconcileModal
          jobId={id}
          group={reconcileFor}
          demandLines={job.demand_lines.map((d) => ({ id: d.id, raw_name: d.raw_name }))}
          initialFee={shipOf(reconcileFor)}
          onClose={() => setReconcileFor(null)}
          onApply={(rows, fee) => applyReconcile(reconcileFor, rows, fee)}
        />
      )}
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
  const [open, setOpen] = useState(false);
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
    setOpen(false);
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

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        {allocs.length > 0 ? "거래처 바꾸기 · 추가" : "거래처 고르기"}
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <>
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
        </>
      )}
    </div>
  );
}

function VendorOrderCard({
  group,
  settlement,
  autoFee,
  onSaveShip,
  onComplete,
  onReconcile,
}: {
  group: VendorGroup;
  settlement: Settlement | undefined;
  autoFee: number;
  onSaveShip: (fee: number) => void;
  onComplete: (v: boolean) => void;
  onReconcile: () => void;
}) {
  const toast = useToast();
  const effectiveFee = settlement ? settlement.shipping_fee : autoFee;
  const [fee, setFee] = useState(String(effectiveFee));
  useEffect(() => {
    setFee(String(effectiveFee));
  }, [effectiveFee]);
  const isLater = group.policy === "later";
  const done = settlement?.settled ?? false;
  const orderItems = group.items.filter((it) => it.qty > 0);
  const total = group.subtotal + (Number(fee) || 0);
  const commit = () => {
    const v = Number(fee) || 0;
    if (v !== effectiveFee) onSaveShip(v);
  };
  const copyOrder = async () => {
    const text = orderItems.map((it) => `${it.name} ${it.qty}${it.unit ?? ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${group.name} 주문 ${orderItems.length}건 복사됨`);
    } catch {
      toast.error("복사 실패 — 직접 선택해 복사하세요.");
    }
  };
  return (
    <div className={`rounded-lg border ${done ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-100">
        <span className="font-bold text-gray-900">{group.name}</span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isLater ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
          }`}
          title={isLater ? "후책정: 주문량 보고 거래처가 배송비를 책정 → 직접 입력" : "규칙형: 무료기준 이상이면 0, 아니면 정액 자동"}
        >
          {isLater ? "후책정" : "자동"}
        </span>
        <span className="text-xs text-gray-400">{orderItems.length}품목</span>
        {done && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-medium">
            <CheckCircle2 className="w-3 h-3" /> 완료
          </span>
        )}
        <button
          onClick={copyOrder}
          className="ml-auto flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-700 hover:bg-gray-50"
          title="이 거래처 주문 목록을 복사 — 사이트·카톡에 붙여넣기"
        >
          <Copy className="w-3.5 h-3.5" /> 복사
        </button>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {orderItems.map((it, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              <td className="px-3 py-1.5 text-gray-900">{it.name}</td>
              <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap">
                {it.qty}
                {it.unit ?? ""}
              </td>
              <td className="px-2 py-1.5 text-right text-gray-400 whitespace-nowrap">
                {it.price != null ? `@${it.price.toLocaleString()}` : "-"}
              </td>
              <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">
                {it.price != null ? won(it.qty * it.price) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-t border-gray-100 text-sm">
        <span className="text-gray-500">물품 {won(group.subtotal)}</span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">배송비</span>
          <input
            type="number"
            min={0}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            onBlur={commit}
            className="w-20 px-2 py-1 border border-gray-200 rounded-md text-sm text-right"
          />
          {!isLater && !settlement && autoFee === 0 && group.freeMin > 0 && (
            <span className="text-[10px] text-emerald-600">무료</span>
          )}
        </div>
        <span className="font-bold text-gray-900">합계 {won(total)}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onReconcile}
            className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-700 hover:bg-gray-50"
            title="출고확인서/명세서를 올려 실제 출고수량·단가·배송비를 반영 → 완료 처리"
          >
            <Upload className="w-3.5 h-3.5" /> 출고확인서
          </button>
          {done ? (
            <button
              onClick={() => onComplete(false)}
              className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-500 hover:bg-gray-50"
              title="완료를 취소하고 주문 내역에서 내립니다"
            >
              완료 취소
            </button>
          ) : (
            <button
              onClick={() => onComplete(true)}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700"
              title="이 거래처 발주를 완료하고 주문 내역에 올립니다"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> 완료
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReconcileModal({
  jobId,
  group,
  demandLines,
  initialFee,
  onClose,
  onApply,
}: {
  jobId: string;
  group: VendorGroup;
  demandLines: { id: string; raw_name: string }[];
  initialFee: number;
  onClose: () => void;
  onApply: (rows: ReconcileRow[], fee: number) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [rows, setRows] = useState<ReconcileRow[] | null>(null);
  const [fee, setFee] = useState(initialFee);

  const onPickFile = (f: File | undefined | null) => {
    if (!f) return;
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf";
    if (!isImage && !isPdf) return toast.error("이미지 또는 PDF 파일만 올릴 수 있어요.");
    if (f.size > 15 * 1024 * 1024) return toast.error("파일이 너무 커요. 15MB 이하로 올려주세요.");
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result);
      setFile({
        base64: res.split(",")[1] ?? "",
        mime: f.type || (isPdf ? "application/pdf" : "image/png"),
        name: f.name || "파일",
      });
    };
    reader.readAsDataURL(f);
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    for (const it of Array.from(e.clipboardData?.items ?? [])) {
      if (it.type.startsWith("image/") || it.type === "application/pdf") {
        onPickFile(it.getAsFile());
        e.preventDefault();
        return;
      }
    }
  };

  const analyze = async () => {
    if (!text.trim() && !file) return toast.error("출고확인서 텍스트·이미지·PDF 중 하나를 넣어주세요.");
    setAnalyzing(true);
    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          text: text.trim() || undefined,
          imageBase64: file?.base64,
          imageMimeType: file?.mime,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || "분석에 실패했어요. 잠시 후 다시 시도해 주세요.");
      const items = (data.items as ReconcileRow[]) || [];
      setRows(items);
      if (typeof data.shipping_fee === "number" && data.shipping_fee > 0) setFee(data.shipping_fee);
      if (items.length === 0) toast.info("추출된 품목이 없습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "분석 오류");
    } finally {
      setAnalyzing(false);
    }
  };

  const setRow = (i: number, patch: Partial<ReconcileRow>) =>
    setRows((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, ...patch } : r)) : prev));

  const itemsTotal = (rows ?? []).reduce((s, r) => s + (Number(r.qty) || 0) * (r.unit_price ?? 0), 0);
  const matchedCount = (rows ?? []).filter((r) => r.demand_line_id).length;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onDragOver={(e) => {
        e.preventDefault();
        if (!rows) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!rows) onPickFile(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex justify-between items-center">
          <h2 className="text-base font-bold text-gray-900">{group.name} · 출고확인서 반영</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {!rows && (
            <div
              className={`space-y-4 rounded-lg transition ${
                dragOver ? "ring-2 ring-blue-400 ring-offset-2" : ""
              }`}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={handlePaste}
                rows={5}
                placeholder="거래처 출고확인서/거래명세서 텍스트를 붙여넣거나, 이미지·PDF 파일을 여기로 끌어다 놓으세요(Ctrl+V도 가능)."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
              />
              {dragOver && (
                <div className="text-xs text-blue-700 bg-blue-50 border border-dashed border-blue-300 rounded-lg px-3 py-2 text-center">
                  여기에 놓으면 파일이 첨부됩니다
                </div>
              )}
              {file && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                  <span className="flex-1 truncate">첨부됨: {file.name}</span>
                  <button onClick={() => setFile(null)} className="text-emerald-700 hover:text-emerald-900">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                  <Upload className="w-4 h-4" /> 파일 선택
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0])}
                  />
                </label>
                <button
                  onClick={analyze}
                  disabled={analyzing}
                  className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" /> {analyzing ? "분석 중..." : "AI 분석"}
                </button>
              </div>
            </div>
          )}

          {rows && (
            <>
              <p className="text-xs text-gray-500">
                추출 {rows.length}건 · 자동매칭 {matchedCount}건
                {rows.length - matchedCount > 0 ? (
                  <span className="text-amber-600 font-medium"> · 확인 필요 {rows.length - matchedCount}건(주황칸)</span>
                ) : (
                  <span className="text-emerald-600 font-medium"> · 모두 매칭됨</span>
                )}
                {" "}— 수량·단가를 확인하고 반영하세요.
              </p>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm border-b border-gray-100 pb-2 last:border-0">
                    <select
                      value={r.demand_line_id ?? ""}
                      onChange={(e) => setRow(i, { demand_line_id: e.target.value || null })}
                      className={`flex-1 min-w-[170px] px-2 py-1.5 border rounded-lg text-sm ${
                        r.demand_line_id ? "border-gray-200" : "border-amber-300 bg-amber-50"
                      }`}
                    >
                      <option value="">매칭 안 함 (무시)</option>
                      {demandLines.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.raw_name}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-400 min-w-[70px] max-w-[120px] truncate" title={r.doc_name}>
                      {r.doc_name}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={r.qty}
                      onChange={(e) => setRow(i, { qty: Number(e.target.value) })}
                      title="출고수량"
                      className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right"
                    />
                    <input
                      type="number"
                      min={0}
                      value={r.unit_price ?? ""}
                      onChange={(e) => setRow(i, { unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="단가"
                      className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right"
                    />
                    <button onClick={() => setRows((prev) => prev?.filter((_, j) => j !== i) ?? prev)} className="p-1 text-gray-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm pt-1">
                <span className="text-gray-500">배송비</span>
                <input
                  type="number"
                  min={0}
                  value={fee}
                  onChange={(e) => setFee(Number(e.target.value) || 0)}
                  className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right"
                />
                <span className="ml-auto text-gray-500">
                  물품 {won(itemsTotal)} · 합계 <b className="text-gray-900">{won(itemsTotal + fee)}</b>
                </span>
              </div>
            </>
          )}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-3 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            취소
          </button>
          {rows && (
            <button onClick={() => onApply(rows, fee)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              반영
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
