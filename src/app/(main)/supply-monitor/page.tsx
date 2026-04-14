"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import {
  Package, TrendingUp, TrendingDown, AlertTriangle, Clock, CheckCircle2,
  Truck, XCircle, ChevronRight, Search, X, Save, RefreshCw
} from "lucide-react";

// ============================
// Types
// ============================
type Tab = "fulfillment" | "price" | "supply";

interface FulfillmentOrder {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  vendor_name: string;
  category: string;
  total_purchase_amount: number;
  branch: { short_name: string } | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  estimated_delivery_days: number | null;
  note: string | null;
  item_count: number;
}

interface FulfillmentItem {
  id: string;
  raw_product_name: string;
  quantity: number;
  confirmed_qty: number | null;
  shipped_qty: number | null;
  item_status: string;
  purchase_price: number;
}

interface StatusLog {
  id: string;
  old_status: string | null;
  new_status: string;
  note: string | null;
  changed_at: string;
}

interface PriceChange {
  id: string;
  product_id: string;
  vendor_id: string | null;
  old_price: number | null;
  new_price: number | null;
  price_field: string;
  source_table: string;
  changed_at: string;
  product_name?: string;
  vendor_name?: string;
}

interface SupplyStatus {
  id: string;
  vendor_id: string;
  product_id: string;
  supply_status: string;
  lead_time_days: number | null;
  note: string | null;
  updated_at: string;
  vendor_name?: string;
  product_name?: string;
  product_spec?: string;
}

// ============================
// Constants
// ============================
const ORDER_STATUSES = ["접수", "확인", "출고", "도착", "완료", "부분취소", "취소"];
const ITEM_STATUSES = ["대기", "확인", "출고", "도착", "수량조정", "취소"];
const SUPPLY_STATUSES = ["정상", "품절", "부족", "지연", "가격변동"];

const STATUS_COLORS: Record<string, string> = {
  접수: "bg-gray-100 text-gray-700",
  확인: "bg-blue-100 text-blue-700",
  출고: "bg-indigo-100 text-indigo-700",
  도착: "bg-emerald-100 text-emerald-700",
  완료: "bg-green-100 text-green-700",
  부분취소: "bg-orange-100 text-orange-700",
  취소: "bg-red-100 text-red-700",
  대기: "bg-gray-100 text-gray-700",
  수량조정: "bg-yellow-100 text-yellow-700",
  정상: "bg-green-100 text-green-700",
  품절: "bg-red-100 text-red-700",
  부족: "bg-orange-100 text-orange-700",
  지연: "bg-yellow-100 text-yellow-700",
  가격변동: "bg-purple-100 text-purple-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  접수: <Clock className="w-3.5 h-3.5" />,
  확인: <CheckCircle2 className="w-3.5 h-3.5" />,
  출고: <Truck className="w-3.5 h-3.5" />,
  도착: <Package className="w-3.5 h-3.5" />,
  완료: <CheckCircle2 className="w-3.5 h-3.5" />,
  취소: <XCircle className="w-3.5 h-3.5" />,
  부분취소: <AlertTriangle className="w-3.5 h-3.5" />,
};

// ============================
// Page
// ============================
export default function SupplyMonitorPage() {
  const [activeTab, setActiveTab] = useState<Tab>("fulfillment");

  return (
    <>
      <TopBar title="공급망 관리" subtitle="주문 이행, 가격 변동, 공급 리스크 통합 모니터링" />
      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        {/* 탭 */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {([
            { key: "fulfillment" as Tab, label: "주문 이행 현황", icon: <Truck className="w-4 h-4" /> },
            { key: "price" as Tab, label: "가격 변동", icon: <TrendingUp className="w-4 h-4" /> },
            { key: "supply" as Tab, label: "공급 리스크", icon: <AlertTriangle className="w-4 h-4" /> },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "fulfillment" && <FulfillmentTab />}
        {activeTab === "price" && <PriceMonitorTab />}
        {activeTab === "supply" && <SupplyRiskTab />}
      </div>
    </>
  );
}

// ============================
// Tab 1: 주문 이행 현황
// ============================
function FulfillmentTab() {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailOrder, setDetailOrder] = useState<FulfillmentOrder | null>(null);
  const [detailItems, setDetailItems] = useState<FulfillmentItem[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, order_date, status, vendor_name, category, total_purchase_amount, note, confirmed_at, shipped_at, delivered_at, estimated_delivery_days, branches(short_name), order_items(id)")
      .order("order_date", { ascending: false })
      .limit(200);

    if (data) {
      setOrders(
        data.map((o: Record<string, unknown>) => ({
          ...o,
          branch: o.branches as { short_name: string } | null,
          item_count: (o.order_items as unknown[])?.length || 0,
        })) as FulfillmentOrder[]
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const openDetail = useCallback(async (order: FulfillmentOrder) => {
    setDetailOrder(order);

    const [itemsRes, logsRes] = await Promise.all([
      supabase.from("order_items")
        .select("id, raw_product_name, quantity, confirmed_qty, shipped_qty, item_status, purchase_price")
        .eq("order_id", order.id),
      supabase.from("order_status_log")
        .select("id, old_status, new_status, note, changed_at")
        .eq("order_id", order.id)
        .order("changed_at", { ascending: false }),
    ]);

    if (itemsRes.data) setDetailItems(itemsRes.data as FulfillmentItem[]);
    if (logsRes.data) setStatusLogs(logsRes.data as StatusLog[]);
  }, []);

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: string) => {
    setSaving(true);
    await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    // 로컬 업데이트
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
    if (detailOrder?.id === orderId) {
      setDetailOrder((prev) => prev ? { ...prev, status: newStatus } : prev);
      // 이력 새로고침
      const { data: logs } = await supabase.from("order_status_log")
        .select("id, old_status, new_status, note, changed_at")
        .eq("order_id", orderId).order("changed_at", { ascending: false });
      if (logs) setStatusLogs(logs as StatusLog[]);
    }
    setSaving(false);
  }, [detailOrder]);

  const updateItemStatus = useCallback(async (itemId: string, field: string, value: string | number | null) => {
    setSaving(true);
    await supabase.from("order_items").update({ [field]: value }).eq("id", itemId);
    setDetailItems((prev) =>
      prev.map((i) => i.id === itemId ? { ...i, [field]: value } : i)
    );
    setSaving(false);
  }, []);

  const filtered = useMemo(() => {
    let result = orders;
    if (statusFilter) result = result.filter((o) => o.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) =>
        o.vendor_name?.toLowerCase().includes(q) ||
        o.order_number?.toLowerCase().includes(q) ||
        o.branch?.short_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, statusFilter, searchQuery]);

  // 상태별 카운트
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [orders]);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "-";

  return (
    <div className="space-y-4">
      {/* 상태 요약 카드 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {ORDER_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`rounded-xl border p-3 text-center transition-all ${
              statusFilter === s ? "ring-2 ring-blue-500 border-blue-300" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-lg font-bold text-gray-900">{statusCounts[s] || 0}</p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[s]}`}>
              {STATUS_ICONS[s]}
              {s}
            </span>
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="거래처, 주문번호, 지점 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button onClick={fetchOrders} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* 주문 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">주문 데이터가 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 text-xs">
                  <th className="text-left px-4 py-3 font-medium">주문일</th>
                  <th className="text-left px-3 py-3 font-medium">지점</th>
                  <th className="text-left px-3 py-3 font-medium">거래처</th>
                  <th className="text-center px-3 py-3 font-medium">품목수</th>
                  <th className="text-right px-3 py-3 font-medium">매입액</th>
                  <th className="text-center px-3 py-3 font-medium">상태</th>
                  <th className="text-center px-3 py-3 font-medium">상태 변경</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-900 font-medium whitespace-nowrap">{formatDate(o.order_date)}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{o.branch?.short_name || "-"}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{o.vendor_name}</td>
                    <td className="px-3 py-2.5 text-center text-gray-500">{o.item_count}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">₩{o.total_purchase_amount?.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_ICONS[o.status]}
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select
                        value={o.status}
                        onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                        disabled={saving}
                        className="px-2 py-1 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => openDetail(o)} className="p-1 hover:bg-gray-100 rounded transition-colors">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailOrder(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {detailOrder.vendor_name} — {detailOrder.branch?.short_name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{detailOrder.order_date} · {detailOrder.order_number}</p>
              </div>
              <button onClick={() => setDetailOrder(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* 아이템별 이행 상태 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">품목별 이행 상태</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">품목</th>
                        <th className="text-center px-2 py-2 font-medium">주문량</th>
                        <th className="text-center px-2 py-2 font-medium">확인량</th>
                        <th className="text-center px-2 py-2 font-medium">출고량</th>
                        <th className="text-center px-2 py-2 font-medium">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detailItems.map((item) => {
                        const qtyMismatch = item.confirmed_qty !== null && item.confirmed_qty !== item.quantity;
                        const shipMismatch = item.shipped_qty !== null && item.shipped_qty !== item.quantity;
                        return (
                          <tr key={item.id} className={`${qtyMismatch || shipMismatch ? "bg-yellow-50/50" : ""}`}>
                            <td className="px-3 py-2 text-gray-900 font-medium max-w-[200px] truncate">{item.raw_product_name}</td>
                            <td className="px-2 py-2 text-center text-gray-700">{item.quantity}</td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="number"
                                value={item.confirmed_qty ?? ""}
                                placeholder={String(item.quantity)}
                                onChange={(e) => updateItemStatus(item.id, "confirmed_qty", e.target.value ? parseInt(e.target.value) : null)}
                                className={`w-14 px-1 py-0.5 border rounded text-center text-xs outline-none focus:ring-1 focus:ring-blue-500 ${qtyMismatch ? "border-yellow-400 bg-yellow-50" : "border-gray-200"}`}
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="number"
                                value={item.shipped_qty ?? ""}
                                placeholder={String(item.quantity)}
                                onChange={(e) => updateItemStatus(item.id, "shipped_qty", e.target.value ? parseInt(e.target.value) : null)}
                                className={`w-14 px-1 py-0.5 border rounded text-center text-xs outline-none focus:ring-1 focus:ring-blue-500 ${shipMismatch ? "border-orange-400 bg-orange-50" : "border-gray-200"}`}
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <select
                                value={item.item_status}
                                onChange={(e) => updateItemStatus(item.id, "item_status", e.target.value)}
                                className={`px-1 py-0.5 border border-gray-200 rounded text-[10px] outline-none ${STATUS_COLORS[item.item_status] || ""}`}
                              >
                                {ITEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 상태 변경 이력 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">상태 변경 이력</p>
                {statusLogs.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">아직 상태 변경 이력이 없습니다</p>
                ) : (
                  <div className="space-y-2">
                    {statusLogs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400 whitespace-nowrap w-24">
                          {new Date(log.changed_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[log.old_status || ""] || "bg-gray-100 text-gray-500"}`}>
                          {log.old_status || "없음"}
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[log.new_status] || "bg-gray-100 text-gray-500"}`}>
                          {log.new_status}
                        </span>
                        {log.note && <span className="text-gray-500">— {log.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================
// Tab 2: 가격 변동 모니터링
// ============================
function PriceMonitorTab() {
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30); // days

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - dateRange);

      const { data } = await supabase
        .from("price_history")
        .select("id, product_id, vendor_id, old_price, new_price, price_field, source_table, changed_at")
        .gte("changed_at", since.toISOString())
        .order("changed_at", { ascending: false })
        .limit(300);

      if (!data || data.length === 0) {
        setChanges([]);
        setLoading(false);
        return;
      }

      // 제품명, 벤더명 조회
      const productIds = Array.from(new Set(data.map((d) => d.product_id).filter(Boolean)));
      const vendorIds = Array.from(new Set(data.map((d) => d.vendor_id).filter(Boolean)));

      const [prodRes, vendRes] = await Promise.all([
        productIds.length > 0 ? supabase.from("products").select("id, name").in("id", productIds) : { data: [] },
        vendorIds.length > 0 ? supabase.from("vendors").select("id, name").in("id", vendorIds) : { data: [] },
      ]);

      const prodMap: Record<string, string> = {};
      const vendMap: Record<string, string> = {};
      (prodRes.data || []).forEach((p: { id: string; name: string }) => { prodMap[p.id] = p.name; });
      (vendRes.data || []).forEach((v: { id: string; name: string }) => { vendMap[v.id] = v.name; });

      setChanges(
        data.map((d) => ({
          ...d,
          product_name: prodMap[d.product_id] || "알 수 없음",
          vendor_name: d.vendor_id ? vendMap[d.vendor_id] || "" : "",
        })) as PriceChange[]
      );
      setLoading(false);
    }
    fetch();
  }, [dateRange]);

  // 요약 통계
  const stats = useMemo(() => {
    const total = changes.length;
    const increases = changes.filter((c) => (c.new_price || 0) > (c.old_price || 0)).length;
    const decreases = changes.filter((c) => (c.new_price || 0) < (c.old_price || 0)).length;
    const bigChanges = changes.filter((c) => {
      if (!c.old_price || !c.new_price) return false;
      return Math.abs(c.new_price - c.old_price) / c.old_price > 0.1;
    }).length;
    return { total, increases, decreases, bigChanges };
  }, [changes]);

  const formatPrice = (p: number | null) => p != null ? `₩${p.toLocaleString()}` : "-";

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">총 변동 건수</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-red-500" /> 인상</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.increases}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5 text-emerald-500" /> 인하</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.decreases}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> 10%+ 급변</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{stats.bigChanges}</p>
        </div>
      </div>

      {/* 기간 필터 */}
      <div className="flex gap-2">
        {[7, 14, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDateRange(d)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              dateRange === d ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {d}일
          </button>
        ))}
      </div>

      {/* 변동 이력 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : changes.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            최근 {dateRange}일 내 가격 변동이 없습니다
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 text-xs">
                  <th className="text-left px-4 py-3 font-medium">변동일시</th>
                  <th className="text-left px-3 py-3 font-medium">품목</th>
                  <th className="text-left px-3 py-3 font-medium">벤더/구분</th>
                  <th className="text-right px-3 py-3 font-medium">변경 전</th>
                  <th className="text-right px-3 py-3 font-medium">변경 후</th>
                  <th className="text-right px-3 py-3 font-medium">변동률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {changes.map((c) => {
                  const pctChange = c.old_price && c.new_price
                    ? Math.round(((c.new_price - c.old_price) / c.old_price) * 100)
                    : null;
                  const isIncrease = pctChange !== null && pctChange > 0;
                  const isDecrease = pctChange !== null && pctChange < 0;
                  const isBig = pctChange !== null && Math.abs(pctChange) > 10;

                  return (
                    <tr key={c.id} className={`hover:bg-gray-50/50 ${isBig ? "bg-yellow-50/30" : ""}`}>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(c.changed_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2.5 text-gray-900 font-medium">{c.product_name}</td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {c.source_table === "vendor_products" ? c.vendor_name : "납품가"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{formatPrice(c.old_price)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-900">{formatPrice(c.new_price)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {pctChange !== null ? (
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            isIncrease ? "bg-red-100 text-red-700" : isDecrease ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                          }`}>
                            {isIncrease ? <TrendingUp className="w-3 h-3" /> : isDecrease ? <TrendingDown className="w-3 h-3" /> : null}
                            {isIncrease ? "+" : ""}{pctChange}%
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================
// Tab 3: 공급 리스크 관리
// ============================
function SupplyRiskTab() {
  const [statuses, setStatuses] = useState<SupplyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editModal, setEditModal] = useState<SupplyStatus | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // 폼 상태
  const [formVendorId, setFormVendorId] = useState("");
  const [formProductId, setFormProductId] = useState("");
  const [formStatus, setFormStatus] = useState("정상");
  const [formLeadTime, setFormLeadTime] = useState("");
  const [formNote, setFormNote] = useState("");

  // 벤더/제품 목록
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; spec: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [supplyRes, vendorRes, productRes] = await Promise.all([
      supabase.from("vendor_supply_status")
        .select("id, vendor_id, product_id, supply_status, lead_time_days, note, updated_at")
        .order("updated_at", { ascending: false }),
      supabase.from("vendors").select("id, name").order("name"),
      supabase.from("products").select("id, name, spec").order("name"),
    ]);

    if (vendorRes.data) setVendors(vendorRes.data);
    if (productRes.data) setProducts(productRes.data);

    if (supplyRes.data && vendorRes.data && productRes.data) {
      const vMap: Record<string, string> = {};
      const pMap: Record<string, { name: string; spec: string }> = {};
      vendorRes.data.forEach((v) => { vMap[v.id] = v.name; });
      productRes.data.forEach((p) => { pMap[p.id] = { name: p.name, spec: p.spec }; });

      setStatuses(
        supplyRes.data.map((s) => ({
          ...s,
          vendor_name: vMap[s.vendor_id] || "알 수 없음",
          product_name: pMap[s.product_id]?.name || "알 수 없음",
          product_spec: pMap[s.product_id]?.spec || "",
        })) as SupplyStatus[]
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let result = statuses;
    if (filterStatus) result = result.filter((s) => s.supply_status === filterStatus);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.product_name?.toLowerCase().includes(q) ||
        s.vendor_name?.toLowerCase().includes(q) ||
        s.note?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [statuses, filterStatus, searchQuery]);

  // 상태별 카운트
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    SUPPLY_STATUSES.forEach((s) => { counts[s] = 0; });
    statuses.forEach((s) => { counts[s.supply_status] = (counts[s.supply_status] || 0) + 1; });
    return counts;
  }, [statuses]);

  const openEditModal = (s: SupplyStatus) => {
    setEditModal(s);
    setFormVendorId(s.vendor_id);
    setFormProductId(s.product_id);
    setFormStatus(s.supply_status);
    setFormLeadTime(s.lead_time_days != null ? String(s.lead_time_days) : "");
    setFormNote(s.note || "");
  };

  const openAddModal = () => {
    setAddModal(true);
    setFormVendorId("");
    setFormProductId("");
    setFormStatus("품절");
    setFormLeadTime("");
    setFormNote("");
  };

  const closeModals = () => { setEditModal(null); setAddModal(false); };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      vendor_id: formVendorId,
      product_id: formProductId,
      supply_status: formStatus,
      lead_time_days: formLeadTime ? parseInt(formLeadTime) : null,
      note: formNote || null,
      updated_at: new Date().toISOString(),
    };

    if (editModal) {
      await supabase.from("vendor_supply_status").update(payload).eq("id", editModal.id);
    } else {
      await supabase.from("vendor_supply_status").upsert(payload, { onConflict: "vendor_id,product_id" });
    }

    setSaving(false);
    closeModals();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("vendor_supply_status").delete().eq("id", id);
    fetchData();
  };

  return (
    <div className="space-y-4">
      {/* 상태 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {SUPPLY_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
            className={`rounded-xl border p-3 text-center transition-all ${
              filterStatus === s ? "ring-2 ring-blue-500 border-blue-300" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-lg font-bold text-gray-900">{statusCounts[s]}</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[s]}`}>
              {s}
            </span>
          </button>
        ))}
      </div>

      {/* 검색 + 추가 */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="품목, 벤더 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
        >
          <AlertTriangle className="w-4 h-4" />
          공급 이슈 등록
        </button>
      </div>

      {/* 리스크 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {statuses.length === 0 ? "등록된 공급 이슈가 없습니다. 이슈 발생 시 등록해주세요." : "필터 조건에 맞는 항목이 없습니다"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 text-xs">
                  <th className="text-left px-4 py-3 font-medium">품목</th>
                  <th className="text-left px-3 py-3 font-medium">벤더</th>
                  <th className="text-center px-3 py-3 font-medium">공급 상태</th>
                  <th className="text-center px-3 py-3 font-medium">리드타임</th>
                  <th className="text-left px-3 py-3 font-medium">비고</th>
                  <th className="text-left px-3 py-3 font-medium">업데이트</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => openEditModal(s)}>
                    <td className="px-4 py-2.5">
                      <p className="text-gray-900 font-medium">{s.product_name}</p>
                      <p className="text-[10px] text-gray-400">{s.product_spec}</p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{s.vendor_name}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.supply_status]}`}>
                        {s.supply_status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">
                      {s.lead_time_days != null ? `${s.lead_time_days}일` : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-[200px] truncate">{s.note || "-"}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(s.updated_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                        className="p-1 hover:bg-red-50 rounded transition-colors"
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 공급 이슈 등록/수정 모달 */}
      {(editModal || addModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeModals}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900">{editModal ? "공급 이슈 수정" : "공급 이슈 등록"}</h2>
              <button onClick={closeModals} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">벤더 *</label>
                <select
                  value={formVendorId}
                  onChange={(e) => setFormVendorId(e.target.value)}
                  disabled={!!editModal}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">선택</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">품목 *</label>
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(e.target.value)}
                  disabled={!!editModal}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">선택</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.spec})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">공급 상태</label>
                <div className="flex gap-2 flex-wrap">
                  {SUPPLY_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setFormStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        formStatus === s
                          ? STATUS_COLORS[s] + " ring-2 ring-offset-1 ring-gray-300"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">예상 리드타임 (일)</label>
                <input
                  type="number"
                  value={formLeadTime}
                  onChange={(e) => setFormLeadTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="예: 7"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">비고</label>
                <textarea
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  rows={2}
                  placeholder="예: 전쟁 영향으로 원자재 수급 불안정, 출고 2주 이상 소요"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <button onClick={closeModals} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition-colors">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formVendorId || !formProductId}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
