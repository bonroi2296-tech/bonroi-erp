"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { FileSpreadsheet, Download, Building2, Calendar, Loader2, CheckCircle2 } from "lucide-react";

interface Branch {
  id: string;
  name: string;
}

interface MonthSummary {
  month: string;
  order_count: number;
  item_count: number;
  total_supply: number;
}

// "YYYY-MM" → "YYYY년 M월"
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}

export default function DocumentsPage() {
  const toast = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string[]>([]);

  useEffect(() => {
    async function fetchBranches() {
      const { data } = await supabase.from("branches").select("id, name").order("name");
      setBranches(data || []);
    }
    fetchBranches();
  }, []);

  useEffect(() => {
    if (!selectedBranch) {
      setSummaries([]);
      return;
    }
    async function fetchSummaries() {
      const { data: orders } = await supabase
        .from("orders")
        .select("order_date, order_items(total_supply)")
        .eq("branch_id", selectedBranch);

      if (orders) {
        const monthMap: Record<string, { orders: Set<string>; items: number; supply: number }> = {};
        for (const o of orders) {
          const m = o.order_date.substring(0, 7);
          if (!monthMap[m]) monthMap[m] = { orders: new Set(), items: 0, supply: 0 };
          monthMap[m].orders.add(o.order_date);
          const items = o.order_items || [];
          monthMap[m].items += items.length;
          monthMap[m].supply += items.reduce((s, i) => s + (i.total_supply || 0), 0);
        }
        setSummaries(
          Object.entries(monthMap)
            .map(([month, d]) => ({
              month,
              order_count: d.orders.size,
              item_count: d.items,
              total_supply: d.supply,
            }))
            .sort((a, b) => a.month.localeCompare(b.month))
        );
      }
    }
    fetchSummaries();
  }, [selectedBranch]);

  const handleDownload = async (month?: string, branch?: string) => {
    const m = month || selectedMonth;
    const b = branch || selectedBranch;
    if (!m || !b) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/invoice?month=${m}&branch=${b}`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "거래명세서 생성 실패");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const branchName = branches.find((br) => br.id === b)?.name || "";
      const [y, mo] = m.split("-");
      a.href = url;
      a.download = `${branchName}_${y}년${mo}월_거래명세서.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchDownload = async () => {
    if (!selectedBranch) return;
    setBatchLoading(true);
    setBatchProgress([]);

    const targetMonths = [...summaries].map((s) => s.month).sort();
    const branchName = branches.find((b) => b.id === selectedBranch)?.name || "";

    for (const m of targetMonths) {
      setBatchProgress((prev) => [...prev, `${m} 생성 중...`]);
      try {
        const res = await fetch(`/api/invoice?month=${m}&branch=${selectedBranch}`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const [y, mo] = m.split("-");
          a.href = url;
          a.download = `${branchName}_${y}년${mo}월_거래명세서.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
          setBatchProgress((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = `${m} ✓ 완료`;
            return updated;
          });
        } else {
          setBatchProgress((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = `${m} ✗ 데이터 없음`;
            return updated;
          });
        }
      } catch {
        setBatchProgress((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = `${m} ✗ 오류`;
          return updated;
        });
      }
      // Small delay between downloads
      await new Promise((r) => setTimeout(r, 500));
    }
    setBatchLoading(false);
  };

  const selectedBranchName = branches.find((b) => b.id === selectedBranch)?.name;
  // 데이터가 있는 월 목록(최신순) — 하드코딩 대신 실제 주문 데이터에서 도출
  const monthOptions = [...summaries].map((s) => s.month).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <TopBar title="거래명세서" subtitle="월별 병원 납품 거래명세서 생성 및 다운로드" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* 선택 영역 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-4">거래명세서 생성</h3>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                <Building2 className="w-4 h-4 inline mr-1" />병원 선택
              </label>
              <select
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="">병원을 선택하세요</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1" />월 선택
              </label>
              <select
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="">
                  {selectedBranch ? "월을 선택하세요" : "병원을 먼저 선택하세요"}
                </option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => handleDownload()}
              disabled={!selectedBranch || !selectedMonth || loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              거래명세서 다운로드
            </button>
          </div>
        </div>

        {/* 일괄 다운로드 — 데이터가 있는 전체 기간 */}
        {selectedBranch && monthOptions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">전체 기간 일괄 다운로드</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedBranchName}의 {monthLabel(monthOptions[monthOptions.length - 1])} ~ {monthLabel(monthOptions[0])} 거래명세서를 한번에 생성합니다.
                </p>
              </div>
              <button
                onClick={handleBatchDownload}
                disabled={batchLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {batchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {monthOptions.length}개월 일괄 생성
              </button>
            </div>
            {batchProgress.length > 0 && (
              <div className="space-y-1.5 mt-3">
                {batchProgress.map((p, i) => (
                  <div key={i} className={`flex items-center gap-2 text-sm ${p.includes("✓") ? "text-emerald-600" : p.includes("✗") ? "text-red-500" : "text-gray-500"}`}>
                    {p.includes("✓") ? <CheckCircle2 className="w-4 h-4" /> : p.includes("✗") ? <span className="w-4 h-4 text-center">✗</span> : <Loader2 className="w-4 h-4 animate-spin" />}
                    {p}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 월별 요약 테이블 */}
        {selectedBranch && summaries.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">{selectedBranchName} 월별 현황</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-6 py-3 font-medium">월</th>
                  <th className="text-right px-6 py-3 font-medium">주문 수</th>
                  <th className="text-right px-6 py-3 font-medium">품목 수</th>
                  <th className="text-right px-6 py-3 font-medium">총 납품가</th>
                  <th className="text-center px-6 py-3 font-medium">거래명세서</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaries.map((s) => (
                  <tr key={s.month} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {s.month.replace("-", "년 ")}월
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">{s.order_count}건</td>
                    <td className="px-6 py-3 text-right text-gray-600">{s.item_count}건</td>
                    <td className="px-6 py-3 text-right text-gray-900 font-medium">
                      ₩{(s.total_supply || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <button
                        onClick={() => handleDownload(s.month, selectedBranch)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> 다운로드
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
