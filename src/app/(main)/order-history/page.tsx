"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Search, Download, Filter, ChevronDown, ChevronUp } from "lucide-react";

interface OrderHistoryRow {
  id: string;
  order_date: string;
  branch_short: string;
  vendor_name: string;
  category: string;
  raw_product_name: string;
  quantity: number;
  purchase_price: number;
  total_purchase: number;
  supply_price: number;
  total_supply: number;
  margin: number;
  edi_code: string;
}

interface Branch {
  id: string;
  short_name: string;
}

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
        order_items(id, raw_product_name, quantity, purchase_price, total_purchase, supply_price, total_supply, margin, edi_code)
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
          supply_price: number;
          total_supply: number;
          margin: number;
          edi_code: string;
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
            supply_price: item.supply_price || 0,
            total_supply: item.total_supply || 0,
            margin: item.margin || 0,
            edi_code: item.edi_code || "",
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
    const totalSupply = filteredRows.reduce((s, r) => s + r.total_supply, 0);
    const totalMargin = filteredRows.reduce((s, r) => s + r.margin, 0);
    return { count: filteredRows.length, totalPurchase, totalSupply, totalMargin };
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

  const marginRate = (r: OrderHistoryRow) => {
    if (!r.total_supply || !r.total_purchase) return "-";
    const rate = ((r.total_supply - r.total_purchase) / r.total_supply) * 100;
    return `${rate.toFixed(1)}%`;
  };

  // CSV 다운로드
  const downloadCSV = () => {
    const header = "날짜,지점,구분,거래처,제품(규격),수량,매입가,총매입가,납품가,총납품가,마진,마진율,EDI코드\n";
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
          r.supply_price,
          r.total_supply,
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
                <label className="text-[11px] text-gray-500 mb-1 block">시작일</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">종료일</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">지점</label>
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
                <label className="text-[11px] text-gray-500 mb-1 block">거래처</label>
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
                <label className="text-[11px] text-gray-500 mb-1 block">구분</label>
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
                <label className="text-[11px] text-gray-500 mb-1 block">제품 검색</label>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[11px] text-gray-500">건수</p>
            <p className="text-lg font-bold text-gray-900">{summary.count.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[11px] text-gray-500">총 매입가</p>
            <p className="text-lg font-bold text-gray-900">{formatPrice(summary.totalPurchase)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[11px] text-gray-500">총 납품가</p>
            <p className="text-lg font-bold text-gray-900">{formatPrice(summary.totalSupply)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[11px] text-gray-500">총 마진</p>
            <p className={`text-lg font-bold ${summary.totalMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatPrice(summary.totalMargin)}
            </p>
          </div>
        </div>

        {/* 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">데이터 로딩 중...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center text-gray-400">조건에 맞는 주문 내역이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase">
                    <th
                      className="text-left px-3 py-2.5 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("order_date")}
                    >
                      날짜 <SortIcon field="order_date" />
                    </th>
                    <th
                      className="text-left px-2 py-2.5 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("branch_short")}
                    >
                      지점 <SortIcon field="branch_short" />
                    </th>
                    <th
                      className="text-left px-2 py-2.5 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("vendor_name")}
                    >
                      거래처 <SortIcon field="vendor_name" />
                    </th>
                    <th
                      className="text-left px-2 py-2.5 cursor-pointer hover:text-gray-700 whitespace-nowrap min-w-[200px]"
                      onClick={() => toggleSort("raw_product_name")}
                    >
                      제품(규격) <SortIcon field="raw_product_name" />
                    </th>
                    <th
                      className="text-right px-2 py-2.5 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("quantity")}
                    >
                      수량 <SortIcon field="quantity" />
                    </th>
                    <th className="text-right px-2 py-2.5 whitespace-nowrap">매입가</th>
                    <th className="text-right px-2 py-2.5 whitespace-nowrap">총매입가</th>
                    <th className="text-right px-2 py-2.5 whitespace-nowrap">납품가</th>
                    <th className="text-right px-2 py-2.5 whitespace-nowrap">총납품가</th>
                    <th
                      className="text-right px-2 py-2.5 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                      onClick={() => toggleSort("margin")}
                    >
                      마진 <SortIcon field="margin" />
                    </th>
                    <th className="text-right px-2 py-2.5 whitespace-nowrap">마진율</th>
                    <th className="text-left px-2 py-2.5 whitespace-nowrap">EDI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(r.order_date)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            r.branch_short === "강서"
                              ? "bg-blue-100 text-blue-700"
                              : r.branch_short === "광명"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {r.branch_short}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap text-xs">{r.vendor_name}</td>
                      <td className="px-2 py-2 text-gray-900 font-medium max-w-[280px] truncate">{r.raw_product_name}</td>
                      <td className="px-2 py-2 text-right text-gray-700">{r.quantity}</td>
                      <td className="px-2 py-2 text-right text-gray-600 text-xs">{formatPrice(r.purchase_price)}</td>
                      <td className="px-2 py-2 text-right text-gray-700">{formatPrice(r.total_purchase)}</td>
                      <td className="px-2 py-2 text-right text-gray-600 text-xs">{formatPrice(r.supply_price)}</td>
                      <td className="px-2 py-2 text-right text-gray-700">{formatPrice(r.total_supply)}</td>
                      <td
                        className={`px-2 py-2 text-right font-medium ${
                          r.margin > 0 ? "text-emerald-600" : r.margin < 0 ? "text-red-600" : "text-gray-400"
                        }`}
                      >
                        {formatPrice(r.margin)}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-500 text-xs">{marginRate(r)}</td>
                      <td className="px-2 py-2 text-gray-400 text-xs">{r.edi_code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
