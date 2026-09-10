"use client";

import { Fragment, useEffect, useState, useMemo, useCallback } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Search, Download, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { branchColor, vendorColor } from "@/lib/colors";

interface OrderHistoryRow {
  id: string;
  order_date: string;
  branch_short: string;
  vendor_name: string;
  category: string;
  raw_product_name: string;
  quantity: number;
  // 매입가는 부가세 포함, 납품가는 부가세 별도가 기준이다.
  purchase_price: number;
  total_purchase: number;
  purchase_supply: number;
  supply_price: number;
  total_supply: number;
  supply_vat: number;
  billed_amount: number;
  margin: number;
  edi_code: string;
  note: string;
}

interface Branch {
  id: string;
  short_name: string;
}

// 칩 색은 @/lib/colors 의 공용 헬퍼 사용(같은 이름 → 항상 같은 색).

export default function OrderHistoryPage() {
  const [rows, setRows] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);

  // 필터
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"" | "양방" | "한방">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  // 메모: 값이 있는 줄만 보이고, 없으면 줄에 마우스를 올렸을 때만 + 가 뜬다.
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const saveNote = async (rowId: string) => {
    const text = noteDraft.trim();
    const { error } = await supabase
      .from("order_items")
      .update({ note: text || null })
      .eq("id", rowId);
    setEditingNote(null);
    if (error) return;
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, note: text } : r)));
  };
  const [showVendorPivot, setShowVendorPivot] = useState(false);

  // 마지막으로 쓴 필터를 기억(매번 다시 설정 안 하도록)
  const [filtersRestored, setFiltersRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("order-history-filters");
      if (raw) {
        const f = JSON.parse(raw);
        if (typeof f.dateFrom === "string") setDateFrom(f.dateFrom);
        if (typeof f.dateTo === "string") setDateTo(f.dateTo);
        if (typeof f.branchFilter === "string") setBranchFilter(f.branchFilter);
        if (typeof f.vendorFilter === "string") setVendorFilter(f.vendorFilter);
        if (f.categoryFilter === "양방" || f.categoryFilter === "한방") setCategoryFilter(f.categoryFilter);
        if (typeof f.searchQuery === "string") setSearchQuery(f.searchQuery);
      }
    } catch {
      /* 저장된 필터 없음/손상 — 무시 */
    }
    setFiltersRestored(true);
  }, []);
  useEffect(() => {
    if (!filtersRestored) return;
    try {
      localStorage.setItem(
        "order-history-filters",
        JSON.stringify({ dateFrom, dateTo, branchFilter, vendorFilter, categoryFilter, searchQuery })
      );
    } catch {
      /* 저장 실패 무시 */
    }
  }, [filtersRestored, dateFrom, dateTo, branchFilter, vendorFilter, categoryFilter, searchQuery]);

  // 정렬
  const [sortField, setSortField] = useState<keyof OrderHistoryRow>("order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);

    // 브랜치 목록
    const { data: branchData } = await supabase
      .from("branches")
      .select("id, short_name")
      .order("short_name");
    if (branchData) setBranches(branchData);

    // 주문 + 아이템 전체 조회
    const query = supabase
      .from("orders")
      .select(`
        order_date, vendor_name, category,
        branches!inner(short_name),
        order_items(id, raw_product_name, quantity, purchase_price, total_purchase, purchase_supply, supply_price, total_supply, supply_vat, billed_amount, margin, edi_code, note)
      `)
      .order("order_date", { ascending: false });

    const { data } = await query;

    if (data) {
      const flatRows: OrderHistoryRow[] = [];
      const vendorSet = new Set<string>();

      for (const order of data) {
        const branch = (order.branches as unknown as { short_name: string });
        const items = (order as unknown as { order_items: Array<{
          id: string;
          raw_product_name: string;
          quantity: number;
          purchase_price: number;
          total_purchase: number;
          purchase_supply: number | null;
          supply_price: number;
          total_supply: number;
          supply_vat: number | null;
          billed_amount: number | null;
          margin: number;
          edi_code: string;
          note: string | null;
        }> }).order_items || [];

        vendorSet.add(order.vendor_name || "");

        for (const item of items) {
          flatRows.push({
            id: item.id,
            order_date: order.order_date as string,
            branch_short: branch?.short_name || "",
            vendor_name: order.vendor_name || "",
            category: order.category || "양방",
            raw_product_name: item.raw_product_name || "",
            quantity: item.quantity,
            purchase_price: item.purchase_price || 0,
            total_purchase: item.total_purchase || 0,
            purchase_supply: item.purchase_supply || 0,
            supply_price: item.supply_price || 0,
            total_supply: item.total_supply || 0,
            supply_vat: item.supply_vat || 0,
            billed_amount: item.billed_amount || 0,
            margin: item.margin || 0,
            edi_code: item.edi_code || "",
            note: item.note || "",
          });
        }
      }

      setRows(flatRows);
      setVendors(Array.from(vendorSet).filter(Boolean).sort());
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 필터 적용
  const filteredRows = useMemo(() => {
    let result = rows;

    if (dateFrom) result = result.filter((r) => r.order_date >= dateFrom);
    if (dateTo) result = result.filter((r) => r.order_date <= dateTo);
    if (branchFilter) result = result.filter((r) => r.branch_short === branchFilter);
    if (vendorFilter) result = result.filter((r) => r.vendor_name === vendorFilter);
    if (categoryFilter) result = result.filter((r) => r.category === categoryFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.raw_product_name.toLowerCase().includes(q) ||
          r.edi_code.toLowerCase().includes(q)
      );
    }

    // 정렬
    result = [...result].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal || "");
      const bStr = String(bVal || "");
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });

    return result;
  }, [rows, dateFrom, dateTo, branchFilter, vendorFilter, categoryFilter, searchQuery, sortField, sortDir]);

  // 요약 통계
  const summary = useMemo(() => {
    const totalPurchase = filteredRows.reduce((s, r) => s + r.total_purchase, 0);
    const totalPurchaseSupply = filteredRows.reduce((s, r) => s + r.purchase_supply, 0);
    const totalSupply = filteredRows.reduce((s, r) => s + r.total_supply, 0);
    const totalSupplyVat = filteredRows.reduce((s, r) => s + r.supply_vat, 0);
    const totalBilled = filteredRows.reduce((s, r) => s + r.billed_amount, 0);
    const totalMargin = filteredRows.reduce((s, r) => s + r.margin, 0);
    return {
      count: filteredRows.length,
      totalPurchase,
      totalPurchaseSupply,
      totalSupply,
      totalSupplyVat,
      totalBilled,
      totalMargin,
    };
  }, [filteredRows]);

  // 거래처별 요약(현재 필터 기준) — 매입 큰 순
  const vendorSummary = useMemo(() => {
    const map = new Map<string, { count: number; purchase: number; supply: number; margin: number }>();
    for (const r of filteredRows) {
      const k = r.vendor_name || "(미지정)";
      const cur = map.get(k) || { count: 0, purchase: 0, supply: 0, margin: 0 };
      cur.count += 1;
      cur.purchase += r.total_purchase;
      cur.supply += r.total_supply;
      cur.margin += r.margin;
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .map(([vendor, v]) => ({ vendor, ...v }))
      .sort((a, b) => b.purchase - a.purchase);
  }, [filteredRows]);

  const toggleSort = (field: keyof OrderHistoryRow) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "order_date" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ field }: { field: keyof OrderHistoryRow }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    );
  };

  const formatPrice = (n: number) => {
    if (!n) return "-";
    return `₩${n.toLocaleString()}`;
  };

  const formatDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${y}.${m}.${day}`;
  };

  // 마진율은 마진 금액과 같은 기준(둘 다 부가세 뺀 공급가액)으로 계산해야 화면에서 앞뒤가 맞는다.
  const marginRate = (r: OrderHistoryRow) => {
    if (!r.total_supply) return "-";
    return `${((r.margin / r.total_supply) * 100).toFixed(1)}%`;
  };

  // CSV 다운로드
  const downloadCSV = () => {
    const header =
      "날짜,지점,구분,거래처,제품(규격),수량,매입가(부가세포함),총매입가,매입공급가액,납품가,공급가액,부가세,청구액,마진,마진율,EDI코드\n";
    const body = filteredRows
      .map((r) =>
        [
          r.order_date,
          r.branch_short,
          r.category,
          r.vendor_name,
          `"${r.raw_product_name}"`,
          r.quantity,
          r.purchase_price,
          r.total_purchase,
          r.purchase_supply,
          r.supply_price,
          r.total_supply,
          r.supply_vat,
          r.billed_amount,
          r.margin,
          marginRate(r),
          r.edi_code,
        ].join(",")
      )
      .join("\n");

    const bom = "\uFEFF";
    const blob = new Blob([bom + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `주문내역_${dateFrom || "전체"}_${dateTo || "전체"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <TopBar title="주문 내역" />
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900">주문 내역</h1>
            <p className="text-xs text-gray-500 mt-0.5">전체 납품 이력을 조회하고 필터링할 수 있습니다</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              <Filter className="w-4 h-4" />
              필터 {showFilters ? "숨기기" : "보기"}
            </button>
            <button
              onClick={downloadCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>

        {/* 필터 패널 */}
        {showFilters && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">시작일</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">종료일</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">지점</label>
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">전체</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.short_name}>{b.short_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">거래처</label>
                <select
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">전체</option>
                  {vendors.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">구분</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as "" | "양방" | "한방")}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">전체</option>
                  <option value="양방">양방</option>
                  <option value="한방">한방</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">제품 검색</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="제품명/EDI"
                    className="w-full pl-8 pr-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
            {(dateFrom || dateTo || branchFilter || vendorFilter || categoryFilter || searchQuery) && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setBranchFilter("");
                    setVendorFilter("");
                    setCategoryFilter("");
                    setSearchQuery("");
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  필터 초기화
                </button>
              </div>
            )}
          </div>
        )}

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">건수</p>
            <p className="text-xl font-bold text-gray-900">{summary.count.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">매입 <span className="text-gray-400">(부가세 포함)</span></p>
            <p className="text-xl font-bold text-gray-900">{formatPrice(summary.totalPurchase)}</p>
            <p className="text-xs text-gray-400 mt-0.5">공급가액 {formatPrice(summary.totalPurchaseSupply)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">납품 공급가액</p>
            <p className="text-xl font-bold text-gray-900">{formatPrice(summary.totalSupply)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">부가세</p>
            <p className="text-xl font-bold text-gray-700">{formatPrice(summary.totalSupplyVat)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">청구액 <span className="text-gray-400">(병원 청구)</span></p>
            <p className="text-xl font-bold text-blue-700">{formatPrice(summary.totalBilled)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">마진 <span className="text-gray-400">(공급가액 기준)</span></p>
            <p className={`text-xl font-bold ${summary.totalMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatPrice(summary.totalMargin)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {summary.totalSupply ? `${((summary.totalMargin / summary.totalSupply) * 100).toFixed(1)}%` : "-"}
            </p>
          </div>
        </div>

        {/* 거래처별 요약 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowVendorPivot((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span>거래처별 요약 ({vendorSummary.length}곳)</span>
            {showVendorPivot ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showVendorPivot && (
            <div className="overflow-x-auto border-t border-gray-100">
              {vendorSummary.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">데이터 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                      <th className="text-left px-3 py-2 whitespace-nowrap">거래처</th>
                      <th className="hidden md:table-cell text-right px-2 py-2 whitespace-nowrap">건수</th>
                      <th className="text-right px-2 py-2 whitespace-nowrap">총매입가</th>
                      <th className="hidden md:table-cell text-right px-2 py-2 whitespace-nowrap">공급가액</th>
                      <th className="text-right px-2 py-2 whitespace-nowrap">마진</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">마진율</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {vendorSummary.map((v) => (
                      <tr key={v.vendor} className="hover:bg-blue-50/40 transition-colors">
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${vendorColor(v.vendor)}`}>
                            {v.vendor}
                          </span>
                        </td>
                        <td className="hidden md:table-cell px-2 py-2 text-right text-gray-600 text-sm">{v.count.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right text-gray-700 text-sm">{formatPrice(v.purchase)}</td>
                        <td className="hidden md:table-cell px-2 py-2 text-right text-gray-700 text-sm">{formatPrice(v.supply)}</td>
                        <td className={`px-2 py-2 text-right font-semibold text-sm ${v.margin > 0 ? "text-emerald-600" : v.margin < 0 ? "text-red-600" : "text-gray-400"}`}>
                          {formatPrice(v.margin)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500 text-sm">
                          {v.supply ? `${((v.margin / v.supply) * 100).toFixed(1)}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">데이터 로딩 중...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center text-gray-400">조건에 맞는 주문 내역이 없습니다.</div>
          ) : (
            <>
            {/* 폰: 14열 표는 옆으로 못 본다. 줄마다 카드 하나로 편다(값은 하나도 빼지 않는다) */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredRows.map((r) => (
                <div key={r.id} className="px-3 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className="text-gray-500">{formatDate(r.order_date)}</span>
                    <span className={`inline-block px-2 py-0.5 rounded font-medium ${branchColor(r.branch_short)}`}>
                      {r.branch_short}
                    </span>
                    {r.vendor_name && (
                      <span className={`inline-block px-2 py-0.5 rounded font-medium ${vendorColor(r.vendor_name)}`}>
                        {r.vendor_name}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900 break-words">{r.raw_product_name}</div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">수량</span><span className="text-gray-700">{r.quantity}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">매입가</span><span className="text-gray-700">{formatPrice(r.purchase_price)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">총매입가</span><span className="text-gray-700">{formatPrice(r.total_purchase)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">납품가</span><span className="text-gray-700">{formatPrice(r.supply_price)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">공급가액</span><span className="text-gray-700">{formatPrice(r.total_supply)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">부가세</span><span className="text-gray-700">{formatPrice(r.supply_vat)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">청구액</span><span className="font-semibold text-blue-700">{formatPrice(r.billed_amount)}</span></div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">마진</span>
                      <span className={`font-semibold ${r.margin > 0 ? "text-emerald-600" : r.margin < 0 ? "text-red-600" : "text-gray-400"}`}>
                        {formatPrice(r.margin)} <span className="font-normal text-gray-400">{marginRate(r)}</span>
                      </span>
                    </div>
                  </div>
                  {r.edi_code && <div className="mt-1 text-[11px] text-gray-400">EDI {r.edi_code}</div>}
                  {editingNote === r.id ? (
                    <input
                      autoFocus
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onBlur={() => saveNote(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveNote(r.id);
                        if (e.key === "Escape") setEditingNote(null);
                      }}
                      placeholder="예: 144개 = 3카톤 (48개 기준)"
                      className="mt-2 w-full px-2.5 py-1.5 border border-blue-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingNote(r.id); setNoteDraft(r.note); }}
                      className="mt-2 text-left text-xs text-amber-900"
                    >
                      {r.note ? <><span className="text-amber-500 mr-1">↳</span>{r.note}</> : <span className="text-gray-400">+ 메모</span>}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                    <th
                      className="text-left px-3 py-2 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("order_date")}
                    >
                      날짜 <SortIcon field="order_date" />
                    </th>
                    <th
                      className="text-left px-2 py-2 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("branch_short")}
                    >
                      지점 <SortIcon field="branch_short" />
                    </th>
                    <th
                      className="text-left px-2 py-2 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("vendor_name")}
                    >
                      거래처 <SortIcon field="vendor_name" />
                    </th>
                    <th
                      className="text-left px-2 py-2 cursor-pointer hover:text-gray-700 whitespace-nowrap min-w-[200px]"
                      onClick={() => toggleSort("raw_product_name")}
                    >
                      제품(규격) <SortIcon field="raw_product_name" />
                    </th>
                    <th
                      className="text-right px-2 py-2 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("quantity")}
                    >
                      수량 <SortIcon field="quantity" />
                    </th>
                    <th className="text-right px-2 py-2 whitespace-nowrap">매입가</th>
                    <th className="text-right px-2 py-2 whitespace-nowrap">총매입가</th>
                    <th className="text-right px-2 py-2 whitespace-nowrap">납품가</th>
                    <th className="text-right px-2 py-2 whitespace-nowrap">공급가액</th>
                    <th className="text-right px-2 py-2 whitespace-nowrap">부가세</th>
                    <th className="text-right px-2 py-2 whitespace-nowrap">청구액</th>
                    <th
                      className="text-right px-2 py-2 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("margin")}
                    >
                      마진 <SortIcon field="margin" />
                    </th>
                    <th className="text-right px-2 py-2 whitespace-nowrap">마진율</th>
                    <th className="text-left px-2 py-2 whitespace-nowrap">EDI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRows.map((r) => (
                    <Fragment key={r.id}>
                    <tr className="group hover:bg-blue-50/40 transition-colors">
                      <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap text-sm">{formatDate(r.order_date)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${branchColor(r.branch_short)}`}>
                          {r.branch_short}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {r.vendor_name && (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${vendorColor(r.vendor_name)}`}>
                            {r.vendor_name}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-900 font-medium max-w-[340px] text-sm">
                        <div className="flex items-center gap-1">
                          <span className="truncate">{r.raw_product_name}</span>
                          {!r.note && editingNote !== r.id && (
                            <button
                              onClick={() => { setEditingNote(r.id); setNoteDraft(""); }}
                              title="메모 추가"
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-1.5 rounded text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            >
                              + 메모
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-gray-700 text-sm">{r.quantity}</td>
                      <td className="px-2 py-2 text-right text-gray-500 text-sm">{formatPrice(r.purchase_price)}</td>
                      <td className="px-2 py-2 text-right text-gray-700 text-sm">{formatPrice(r.total_purchase)}</td>
                      <td className="px-2 py-2 text-right text-gray-500 text-sm">{formatPrice(r.supply_price)}</td>
                      <td className="px-2 py-2 text-right text-gray-700 text-sm">{formatPrice(r.total_supply)}</td>
                      <td className="px-2 py-2 text-right text-gray-500 text-sm">{formatPrice(r.supply_vat)}</td>
                      <td className="px-2 py-2 text-right text-blue-700 font-semibold text-sm">{formatPrice(r.billed_amount)}</td>
                      <td
                        className={`px-2 py-2 text-right font-semibold text-sm ${
                          r.margin > 0 ? "text-emerald-600" : r.margin < 0 ? "text-red-600" : "text-gray-400"
                        }`}
                      >
                        {formatPrice(r.margin)}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-500 text-sm">{marginRate(r)}</td>
                      <td className="px-2 py-2 text-gray-400 text-xs">{r.edi_code}</td>
                    </tr>
                    {/* 메모는 줄 아래에 한 칸 통째로 깔린다. 값이 있거나 지금 쓰는 중일 때만 나온다. */}
                    {(r.note || editingNote === r.id) && (
                      <tr className="bg-amber-50/50">
                        {/* 앞 3열(날짜·지점·거래처)을 비워 제품명 바로 아래에서 시작하게 한다 */}
                        <td colSpan={3} />
                        <td colSpan={11} className="px-2 pb-2 pt-0">
                          {editingNote === r.id ? (
                            <input
                              autoFocus
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              onBlur={() => saveNote(r.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveNote(r.id);
                                if (e.key === "Escape") setEditingNote(null);
                              }}
                              placeholder="예: 144개 = 3카톤 (48개 기준).  Enter 저장 · Esc 취소"
                              className="w-full max-w-2xl px-2.5 py-1.5 border border-blue-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <button
                              onClick={() => { setEditingNote(r.id); setNoteDraft(r.note); }}
                              title="눌러서 고치기"
                              className="text-left text-sm text-amber-900 hover:underline"
                            >
                              <span className="text-amber-500 mr-1">↳</span>
                              {r.note}
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
