"use client";

import { Fragment, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { Package, ShoppingCart, Truck, TrendingUp, Send } from "lucide-react";
import { useToast } from "@/components/Toast";

interface DashboardStats {
  productCount: number;
  orderCount: number;
  purchaseOrderCount: number;
  vendorCount: number;
  totalMargin: number;
}

// purchase 는 부가세 포함 매입, purchase_supply 는 부가세 뺀 매입 공급가액.
// 마진은 공급가액끼리 뺀 값이라(supply - purchase_supply) 화면에서도 같은 기준을 같이 보여준다.
interface MonthAmounts {
  purchase: number;
  purchase_supply: number;
  supply: number;
  supply_vat: number;
  billed: number;
  margin: number;
}

interface BranchMonthStats {
  branchId: string;
  branchName: string;
  purchase: number;
  purchase_supply: number;
  supply: number;
  supply_vat: number;
  billed: number;
  margin: number;
}

interface DashboardStatsRpc {
  product_count: number;
  vendor_count: number;
  purchase_order_count: number;
  order_count: number;
  total_margin: number;
  this_month: MonthAmounts;
  last_month: MonthAmounts;
  branches: Array<{ branch_id: string; branch_name: string } & MonthAmounts>;
}

// "YYYY-MM" 다루기. 추이에서 기준 달을 앞뒤로 옮길 때 쓴다.
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const THIS_MONTH = ym(new Date());
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  return ym(new Date(y, mo - 1 + by, 1));
};

// 최근 3개월 추이 — 양방/한방을 나눠 본다. 두 갈래가 성격이 달라 합치면 흐름이 안 보인다.
// 매입·매출은 부가세 포함(거래처 지급액·병원 청구액 그대로).
// gross = 매출 − 매입 (부가세 포함 차액), margin = 부가세를 뺀 실제 순수익.
type TrendAmounts = MonthAmounts & { gross: number };

interface TrendMonth {
  month: string;                    // "2026-08"
  label: string;                    // "8월"
  양방: TrendAmounts;
  한방: TrendAmounts;
  합계: TrendAmounts;
}

const EMPTY_MONTH: MonthAmounts = {
  purchase: 0,
  purchase_supply: 0,
  supply: 0,
  supply_vat: 0,
  billed: 0,
  margin: 0,
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({ productCount: 0, orderCount: 0, purchaseOrderCount: 0, vendorCount: 0, totalMargin: 0 });
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [branchByMonth, setBranchByMonth] = useState<Record<string, BranchMonthStats[]>>({});
  const [selMonth, setSelMonth] = useState<string>("");
  // 추이에서 볼 "마지막 달". 이 달과 앞의 두 달, 모두 3개월을 보여준다.
  const [endMonth, setEndMonth] = useState<string>(THIS_MONTH);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    // 최근 3개월 추이(양방/한방)와 이번 달 거래처별 매입.
    // RPC 결과에는 없는 값이라 따로 읽는다. 3개월치라 양이 적다.
    async function fetchExtra() {
      const months = [shiftMonth(endMonth, -2), shiftMonth(endMonth, -1), endMonth];
      const from = `${months[0]}-01`;
      const to = `${shiftMonth(endMonth, 1)}-01`; // 고른 달 다음 달 1일 전까지

      const { data, error } = await supabase
        .from("orders")
        .select(
          "order_date, category, vendor_name, branch_id, total_purchase_amount, total_purchase_supply, total_supply_amount, total_supply_vat, total_billed, total_margin"
        )
        .gte("order_date", from)
        .lt("order_date", to);
      if (error || !data) return;

      type Row = {
        order_date: string; category: string | null; vendor_name: string | null; branch_id: string | null;
        total_purchase_amount: number | null; total_purchase_supply: number | null;
        total_supply_amount: number | null; total_supply_vat: number | null;
        total_billed: number | null; total_margin: number | null;
      };
      const rows = data as unknown as Row[];
      const add = (a: MonthAmounts, o: Row): MonthAmounts => ({
        purchase: a.purchase + (o.total_purchase_amount || 0),
        purchase_supply: a.purchase_supply + (o.total_purchase_supply || 0),
        supply: a.supply + (o.total_supply_amount || 0),
        supply_vat: a.supply_vat + (o.total_supply_vat || 0),
        billed: a.billed + (o.total_billed || 0),
        margin: a.margin + (o.total_margin || 0),
      });

      const withGross = (a: MonthAmounts): TrendAmounts => ({ ...a, gross: a.billed - a.purchase });

      setTrend(
        months.map((m) => {
          const inM = rows.filter((o) => o.order_date.substring(0, 7) === m);
          const ko = inM.filter((o) => o.category === "한방");
          const yang = inM.filter((o) => o.category !== "한방");
          return {
            month: m,
            label: `${Number(m.slice(5))}월`,
            양방: withGross(yang.reduce(add, { ...EMPTY_MONTH })),
            한방: withGross(ko.reduce(add, { ...EMPTY_MONTH })),
            합계: withGross(inM.reduce(add, { ...EMPTY_MONTH })),
          };
        })
      );

      // 월별 지점 현황 — 달을 골라 볼 수 있게 세 달치를 다 만들어 둔다
      const { data: brs } = await supabase.from("branches").select("id, name, short_name");
      const branchList = (brs || []) as Array<{ id: string; name: string; short_name: string | null }>;
      // 지점 순서는 고정 — 금액 순으로 흔들리면 매달 자리가 바뀌어 보기 불편하다
      const ORDER = ["강서", "광명", "성동", "신촌"];
      const rank = (b: { name: string; short_name: string | null }) => {
        const i = ORDER.findIndex((o) => (b.short_name || b.name).startsWith(o));
        return i === -1 ? ORDER.length : i;
      };
      branchList.sort((a, b) => rank(a) - rank(b));
      const byMonth: Record<string, BranchMonthStats[]> = {};
      for (const m of months) {
        const inM = rows.filter((o) => o.order_date.substring(0, 7) === m);
        byMonth[m] = branchList
          .map((br) => {
            const a = inM.filter((o) => o.branch_id === br.id).reduce(add, { ...EMPTY_MONTH });
            return { branchId: br.id, branchName: br.name, ...a };
          })
          .filter((b) => b.purchase !== 0 || b.billed !== 0);
      }
      setBranchByMonth(byMonth);
      setSelMonth(months[months.length - 1]);
    }

    async function fetchData() {
      try {
        fetchExtra();
        // 빠른 경로: DB에서 집계한 결과를 RPC로 받음 (마이그레이션 0003 적용 시)
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_dashboard_stats");
        if (!rpcError && rpcData) {
          const d = rpcData as unknown as DashboardStatsRpc;
          setStats({
            productCount: d.product_count,
            orderCount: d.order_count,
            purchaseOrderCount: d.purchase_order_count,
            vendorCount: d.vendor_count,
            totalMargin: d.total_margin,
          });
          return;
        }

        // 폴백: RPC 미적용 환경 — 기존 클라이언트 집계
        const [productsRes, ordersRes, vendorsRes] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase
            .from("orders")
            .select(
              "id, total_margin, order_date, branch_id, total_purchase_amount, total_purchase_supply, total_supply_amount, total_supply_vat, total_billed",
              { count: "exact" }
            ),
          supabase.from("vendors").select("id", { count: "exact", head: true }),
        ]);

        const totalMargin = ordersRes.data?.reduce((sum, o) => sum + (o.total_margin || 0), 0) || 0;
        // 실제 주문 건수 = 고유한 (날짜+지점) 조합 수
        const uniqueOrders = new Set(
          ordersRes.data?.map((o) => `${o.order_date}_${o.branch_id}`) || []
        );

        setStats({
          productCount: productsRes.count || 0,
          orderCount: uniqueOrders.size,
          purchaseOrderCount: ordersRes.count || 0,
          vendorCount: vendorsRes.count || 0,
          totalMargin,
        });

      } catch (err) {
        console.error("Dashboard fetch error:", err);
        toast.error("대시보드 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endMonth]);

  // 지점별 3개월 추이 — 위 전체 추이와 같은 3개월을 지점으로 쪼갠 것.
  // 막대 높이 기준(peak)은 네 지점 통틀어 가장 큰 값이라 지점끼리도 바로 비교된다.
  const branchTrend = (() => {
    const order: { id: string; name: string }[] = [];
    for (const t of trend) {
      for (const b of branchByMonth[t.month] || []) {
        if (!order.some((o) => o.id === b.branchId)) order.push({ id: b.branchId, name: b.branchName });
      }
    }
    return order.map((b) => ({
      id: b.id,
      name: b.name.replace("면력한방병원", ""),
      months: trend.map((t) => {
        const r = (branchByMonth[t.month] || []).find((x) => x.branchId === b.id);
        return {
          month: t.month,
          label: t.label,
          purchase: r?.purchase ?? 0,
          billed: r?.billed ?? 0,
          margin: r?.margin ?? 0,
          supply: r?.supply ?? 0,
        };
      }),
    }));
  })();
  const branchPeak = Math.max(
    ...branchTrend.flatMap((b) => b.months.flatMap((m) => [m.purchase, m.billed])),
    1
  );

  const statCards = [
    { label: "등록 품목", value: stats.productCount.toLocaleString(), icon: Package, color: "bg-blue-500", change: null },
    { label: "주문 건수", value: stats.orderCount.toLocaleString(), icon: ShoppingCart, color: "bg-emerald-500", change: null },
    { label: "발주 건수", value: stats.purchaseOrderCount.toLocaleString(), icon: Send, color: "bg-indigo-500", change: null },
    { label: "거래 벤더", value: stats.vendorCount.toLocaleString(), icon: Truck, color: "bg-purple-500", change: null },
    { label: "총 마진", value: formatCurrency(stats.totalMargin), icon: TrendingUp, color: "bg-amber-500", change: null },
  ];

  if (loading) {
    return (
      <>
        <TopBar title="대시보드" subtitle="의료소모품 통합 관리 현황" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="대시보드" subtitle="의료소모품 통합 관리 현황" />
      <div className="flex-1 p-4 md:p-6 space-y-4 md:space-y-6 overflow-auto">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <span className="text-xs md:text-sm text-gray-500 font-medium">{card.label}</span>
                  <div className={`${card.color} w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center`}>
                    <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </div>
                </div>
                <p className="text-lg md:text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            );
          })}
        </div>

        {/* 최근 3개월 추이(양방/한방) + 지점별 현황 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 3개월 추이 — 세로 막대, 최근 달이 맨 왼쪽 */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <div className="mb-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900 text-sm md:text-base">
                    {endMonth === THIS_MONTH ? "최근 3개월 추이" : "3개월 추이"}
                  </h2>
                  {/* 보고 싶은 달로 옮겨 본다. 고른 달과 그 앞 두 달이 나온다. */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEndMonth((m) => shiftMonth(m, -1))}
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                      title="앞 달로"
                    >
                      ‹
                    </button>
                    <input
                      type="month"
                      value={endMonth}
                      max={THIS_MONTH}
                      onChange={(e) => e.target.value && setEndMonth(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button
                      onClick={() => setEndMonth((m) => (m >= THIS_MONTH ? m : shiftMonth(m, 1)))}
                      disabled={endMonth >= THIS_MONTH}
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                      title="뒤 달로"
                    >
                      ›
                    </button>
                    {endMonth !== THIS_MONTH && (
                      <button
                        onClick={() => setEndMonth(THIS_MONTH)}
                        className="ml-1 px-2 py-1 rounded-md text-xs text-blue-600 hover:bg-blue-50"
                      >
                        이번 달로
                      </button>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400">매입·매출은 부가세 포함</span>
              </div>
              {/* 범례 — 막대가 4개라 크게 보여야 헷갈리지 않는다 */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {[
                  { cls: "bg-blue-300", label: "양방 매입" },
                  { cls: "bg-blue-600", label: "양방 매출" },
                  { cls: "bg-amber-300", label: "한방 매입" },
                  { cls: "bg-amber-600", label: "한방 매출" },
                ].map((l) => (
                  <span key={l.label} className="flex items-center gap-1.5 text-gray-700">
                    <span className={`inline-block w-4 h-4 rounded ${l.cls}`} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>

            {trend.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">데이터가 없습니다</p>
            ) : (
              <div className="grid grid-cols-3 gap-4 md:gap-6">
                {/* 최근 달을 맨 앞에 */}
                {[...trend].reverse().map((t, idx) => {
                  // 양방·한방의 매입/매출을 나란히 4개. 두 막대 높이 차이가 곧 마진이다.
                  // 기준은 세 달 통틀어 가장 큰 값이라 달끼리도 비교된다.
                  const peak = Math.max(
                    ...trend.flatMap((x) => [
                      x.양방.purchase, x.양방.billed,
                      x.한방.purchase, x.한방.billed,
                    ]),
                    1
                  );
                  const CHART = 150;                       // 막대 영역 높이(px)
                  const h = (v: number) => Math.max((v / peak) * CHART, 2);
                  const BARS = [
                    { key: "양방매입", v: t.양방.purchase, cls: "bg-blue-300", label: "양방 매입" },
                    { key: "양방매출", v: t.양방.billed, cls: "bg-blue-600", label: "양방 매출" },
                    { key: "한방매입", v: t.한방.purchase, cls: "bg-amber-300", label: "한방 매입" },
                    { key: "한방매출", v: t.한방.billed, cls: "bg-amber-600", label: "한방 매출" },
                  ];
                  const rate = t.합계.supply > 0 ? (t.합계.margin / t.합계.supply) * 100 : 0;
                  return (
                    <div key={t.month} className={idx === 0 ? "" : "opacity-90"}>
                      {/* 마진 — 가장 크게, 맨 위 */}
                      <p
                        className={`text-center text-base md:text-xl font-bold leading-tight ${
                          t.합계.margin >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(t.합계.margin)}
                      </p>
                      <p className="text-center text-xs text-gray-400 mb-2">
                        순수익 {rate.toFixed(1)}%
                      </p>

                      {/* 막대 */}
                      <div className="flex items-end justify-center gap-1 border-b border-gray-200" style={{ height: CHART }}>
                        {BARS.map((b, i) => (
                          <div
                            key={b.key}
                            className={`w-5 md:w-7 rounded-t-md ${b.cls} ${i === 2 ? "ml-2" : ""}`}
                            style={{ height: h(b.v) }}
                            title={`${b.label} ${formatCurrency(b.v)}`}
                          />
                        ))}
                      </div>

                      {/* 월 + 양방·한방 매입가 */}
                      <div className="border-t border-gray-200 mt-2 pt-2">
                        <p className="text-sm font-bold text-gray-900 text-center">
                          {t.label}
                          {t.month === THIS_MONTH && <span className="ml-1 text-[10px] font-medium text-blue-600">이번 달</span>}
                        </p>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

            {/* 매입·매출은 거래처 지급·병원 청구 실제 금액(부가세 포함).
                마진만 부가세를 뺀 값이라 (매출 − 매입) ÷ 1.1 = 마진 이 된다. */}
            {trend.length > 0 && (
              <div className="mt-6 pt-5 border-t border-gray-200 overflow-x-auto">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-900">매입 · 매출 · 마진</h3>
                  <span className="text-xs text-gray-400">매입·매출은 부가세 포함 · 마진은 부가세 뺀 실제 이익</span>
                </div>
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-left font-medium py-2 w-24">구분</th>
                      {[...trend].reverse().map((t) => (
                        <th key={t.month} className="text-right font-medium py-2">
                          {t.label}
                          {t.month === THIS_MONTH && <span className="ml-1 text-[10px] text-blue-600">이번 달</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["매입", "purchase"],
                      ["매출", "billed"],
                      ["마진", "gross"],
                      ["순수익", "margin"],
                    ] as const).map(([label, key]) => (
                      <Fragment key={key}>
                        {key === "margin" && (
                          <tr><td colSpan={trend.length + 1} className="pt-1 border-t-2 border-gray-300" /></tr>
                        )}
                        {(["양방", "한방", "합계"] as const).map((seg) => {
                          const isTotal = seg === "합계";
                          return (
                            <tr
                              key={seg}
                              className={
                                isTotal
                                  ? key === "margin"
                                    ? "border-b border-gray-200 bg-emerald-50/60"
                                    : "border-b border-gray-200 bg-gray-50/60"
                                  : "border-b border-gray-50"
                              }
                            >
                              <td className={`py-1.5 ${isTotal ? "font-bold text-gray-900" : "text-gray-500 pl-3"}`}>
                                {isTotal ? label : seg}
                              </td>
                              {[...trend].reverse().map((t) => {
                                const v = t[seg][key];
                                return (
                                  <td
                                    key={t.month}
                                    className={`py-1.5 text-right tabular-nums ${
                                      isTotal ? "font-bold" : ""
                                    } ${
                                      key === "margin"
                                        ? v >= 0 ? "text-emerald-600" : "text-red-600"
                                        : "text-gray-800"
                                    }`}
                                  >
                                    {formatCurrency(v)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>


          {/* 지점별 현황 (이번 달) — 그래프 옆. 숫자만 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-bold text-gray-900 text-sm md:text-base">지점별 현황</h2>
            </div>

            {/* 월 고르기 — 추이와 같은 3개월 */}
            <div className="flex gap-1 mb-4">
              {[...trend].reverse().map((t) => (
                <button
                  key={t.month}
                  onClick={() => setSelMonth(t.month)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    selMonth === t.month
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t.label}
                  {t.month === THIS_MONTH && <span className="ml-1 opacity-70">·이번 달</span>}
                </button>
              ))}
            </div>

            {(branchByMonth[selMonth] || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">이 달은 데이터가 없습니다</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {(branchByMonth[selMonth] || []).map((b) => {
                  const gross = b.billed - b.purchase;          // 매출 − 매입 (부가세 포함)
                  const rate = b.supply > 0 ? (b.margin / b.supply) * 100 : 0;
                  return (
                    <div key={b.branchId} className="py-2.5 first:pt-0 last:pb-0">
                      <p className="text-sm font-bold text-gray-900 mb-1.5">
                        {b.branchName.replace("면력한방병원", "")}
                      </p>
                      <div className="space-y-0.5">
                        {([
                          ["매입", b.purchase, "text-gray-800"],
                          ["매출", b.billed, "text-gray-800"],
                          ["마진", gross, "text-gray-800"],
                        ] as const).map(([label, v, cls]) => (
                          <div key={label} className="flex items-baseline justify-between">
                            <span className="text-xs text-gray-500">{label}</span>
                            <span className={`text-sm font-medium tabular-nums ${cls}`}>
                              {formatCurrency(v)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-baseline justify-between pt-1 mt-1 border-t border-gray-200">
                          <span className="text-xs font-medium text-gray-600">순수익</span>
                          <span className="text-sm font-bold tabular-nums text-emerald-600">
                            {formatCurrency(b.margin)}
                            <span className="ml-1 text-[11px] font-normal text-gray-400">
                              {rate.toFixed(1)}%
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 지점별 3개월 추이 — 지점명 왼쪽, 막대 오른쪽으로 한 줄씩. 두 개씩 나란히. */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-2">
            <h2 className="font-bold text-gray-900 text-sm md:text-base">지점별 3개월 추이</h2>
            <span className="text-xs text-gray-400">
              <span className="inline-block w-3 h-3 rounded-sm bg-slate-300 align-middle mr-1" />매입
              <span className="inline-block w-3 h-3 rounded-sm bg-blue-600 align-middle ml-3 mr-1" />매출
              <span className="ml-3">네 지점 공통 기준 · 부가세 포함</span>
            </span>
          </div>

          {branchTrend.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">이 기간은 데이터가 없습니다</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                {branchTrend.map((b) => {
                  const CHART = 40;
                  const h = (v: number) => Math.max((v / branchPeak) * CHART, 2);
                  return (
                    <div key={b.id} className="flex items-end gap-3 border-b border-gray-100 py-1.5">
                      <span className="w-10 text-xs font-bold text-gray-900 pb-0.5">{b.name}</span>
                      <div className="flex-1 flex items-end justify-around">
                        {[...b.months].reverse().map((m) => (
                          <div key={m.month} className="flex flex-col items-center">
                            <div className="flex items-end gap-0.5" style={{ height: CHART }}>
                              <div className="w-2.5 rounded-t-sm bg-slate-300" style={{ height: h(m.purchase) }} title={`${m.label} 매입 ${formatCurrency(m.purchase)}`} />
                              <div className="w-2.5 rounded-t-sm bg-blue-600" style={{ height: h(m.billed) }} title={`${m.label} 매출 ${formatCurrency(m.billed)}`} />
                            </div>
                            <span className="text-[10px] text-gray-400 leading-tight mt-0.5">{m.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200 overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-left font-medium py-1 w-16">지점</th>
                      {[...trend].reverse().map((t) => (
                        <th key={t.month} className="text-right font-medium py-1">
                          {t.label}
                          {t.month === THIS_MONTH && <span className="ml-1 text-[10px] text-blue-600">이번 달</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {branchTrend.map((b) => (
                      <tr key={b.id} className="border-b border-gray-50">
                        <td className="py-1 text-gray-700 font-medium">{b.name}</td>
                        {[...b.months].reverse().map((m) => (
                          <td key={m.month} className="py-1 text-right leading-tight">
                            <span className="block font-bold text-gray-900 tabular-nums">{formatCurrency(m.billed)}</span>
                            <span className={`block text-[11px] tabular-nums ${m.margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {formatCurrency(m.margin)}
                              <span className="text-gray-400 ml-1">{m.supply > 0 ? `${((m.margin / m.supply) * 100).toFixed(1)}%` : "-"}</span>
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-b border-gray-200 bg-gray-50/60">
                      <td className="py-1 font-bold text-gray-900">합계</td>
                      {[...trend].reverse().map((t) => {
                        const ms = branchTrend.map((b) => b.months.find((m) => m.month === t.month));
                        const billed = ms.reduce((a, m) => a + (m?.billed ?? 0), 0);
                        const margin = ms.reduce((a, m) => a + (m?.margin ?? 0), 0);
                        const supply = ms.reduce((a, m) => a + (m?.supply ?? 0), 0);
                        return (
                          <td key={t.month} className="py-1 text-right leading-tight">
                            <span className="block font-bold text-gray-900 tabular-nums">{formatCurrency(billed)}</span>
                            <span className={`block text-[11px] tabular-nums ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {formatCurrency(margin)}
                              <span className="text-gray-400 ml-1">{supply > 0 ? `${((margin / supply) * 100).toFixed(1)}%` : "-"}</span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 mt-1.5">위는 매출(부가세 포함), 아래 초록은 순수익과 마진율.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
