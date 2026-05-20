"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { Package, ShoppingCart, Truck, TrendingUp, ArrowUpRight, Send } from "lucide-react";

interface DashboardStats {
  productCount: number;
  orderCount: number;
  purchaseOrderCount: number;
  vendorCount: number;
  totalMargin: number;
}

interface RecentOrder {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  total_supply_amount: number;
  branch: { name: string };
}

interface MonthComparison {
  thisMonth: {
    purchase: number;
    supply: number;
    margin: number;
  };
  lastMonth: {
    purchase: number;
    supply: number;
    margin: number;
  };
}

interface BranchMonthStats {
  branchId: string;
  branchName: string;
  purchase: number;
  supply: number;
  margin: number;
}

interface DashboardStatsRpc {
  product_count: number;
  vendor_count: number;
  purchase_order_count: number;
  order_count: number;
  total_margin: number;
  this_month: { purchase: number; supply: number; margin: number };
  last_month: { purchase: number; supply: number; margin: number };
  branches: Array<{ branch_id: string; branch_name: string; purchase: number; supply: number; margin: number }>;
}

const statusColors: Record<string, string> = {
  "발주완료": "bg-green-100 text-green-700",
  "처리중": "bg-blue-100 text-blue-700",
  "대기": "bg-yellow-100 text-yellow-700",
  "확인필요": "bg-red-100 text-red-700",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({ productCount: 0, orderCount: 0, purchaseOrderCount: 0, vendorCount: 0, totalMargin: 0 });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [monthComparison, setMonthComparison] = useState<MonthComparison>({ thisMonth: { purchase: 0, supply: 0, margin: 0 }, lastMonth: { purchase: 0, supply: 0, margin: 0 } });
  const [branchMonthStats, setBranchMonthStats] = useState<BranchMonthStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
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
          setMonthComparison({ thisMonth: d.this_month, lastMonth: d.last_month });
          setBranchMonthStats(
            (d.branches || []).map((b) => ({
              branchId: b.branch_id,
              branchName: b.branch_name,
              purchase: b.purchase,
              supply: b.supply,
              margin: b.margin,
            }))
          );
          const { data: recent } = await supabase
            .from("orders")
            .select("id, order_number, order_date, status, total_supply_amount, branch:branches(name)")
            .order("order_date", { ascending: false })
            .limit(8);
          setRecentOrders((recent as unknown as RecentOrder[]) || []);
          return;
        }

        // 폴백: RPC 미적용 환경 — 기존 클라이언트 집계
        const [productsRes, ordersRes, vendorsRes, recentRes, branchesRes] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase.from("orders").select("id, total_margin, order_date, branch_id, total_purchase_amount, total_supply_amount", { count: "exact" }),
          supabase.from("vendors").select("id", { count: "exact", head: true }),
          supabase
            .from("orders")
            .select("id, order_number, order_date, status, total_supply_amount, branch:branches(name)")
            .order("order_date", { ascending: false })
            .limit(8),
          supabase.from("branches").select("id, name"),
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

        setRecentOrders((recentRes.data as unknown as RecentOrder[]) || []);

        // 월별 비교 데이터
        const today = new Date();
        const currentMonth = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthStr = lastMonth.getFullYear() + "-" + String(lastMonth.getMonth() + 1).padStart(2, "0");

        let thisMonthPurchase = 0,
          thisMonthSupply = 0,
          thisMonthMargin = 0;
        let lastMonthPurchase = 0,
          lastMonthSupply = 0,
          lastMonthMargin = 0;

        ordersRes.data?.forEach((o) => {
          const oMonth = o.order_date.substring(0, 7);
          if (oMonth === currentMonth) {
            thisMonthPurchase += o.total_purchase_amount || 0;
            thisMonthSupply += o.total_supply_amount || 0;
            thisMonthMargin += o.total_margin || 0;
          } else if (oMonth === lastMonthStr) {
            lastMonthPurchase += o.total_purchase_amount || 0;
            lastMonthSupply += o.total_supply_amount || 0;
            lastMonthMargin += o.total_margin || 0;
          }
        });

        setMonthComparison({
          thisMonth: { purchase: thisMonthPurchase, supply: thisMonthSupply, margin: thisMonthMargin },
          lastMonth: { purchase: lastMonthPurchase, supply: lastMonthSupply, margin: lastMonthMargin },
        });

        // 지점별 이번 달 현황
        const branches = (branchesRes.data || []) as Array<{ id: string; name: string }>;
        const branchStats: BranchMonthStats[] = [];

        branches.forEach((branch) => {
          let bPurchase = 0,
            bSupply = 0,
            bMargin = 0;
          ordersRes.data?.forEach((o) => {
            if (o.branch_id === branch.id && o.order_date.substring(0, 7) === currentMonth) {
              bPurchase += o.total_purchase_amount || 0;
              bSupply += o.total_supply_amount || 0;
              bMargin += o.total_margin || 0;
            }
          });
          branchStats.push({ branchId: branch.id, branchName: branch.name, purchase: bPurchase, supply: bSupply, margin: bMargin });
        });

        setBranchMonthStats(branchStats);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

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

        {/* Recent Orders Table */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 md:px-5 py-3 md:py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900 text-sm md:text-base">최근 주문</h2>
            <a href="/orders" className="text-xs md:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              전체보기 <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm min-w-[500px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">주문번호</th>
                  <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">지점</th>
                  <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">주문일</th>
                  <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">상태</th>
                  <th className="text-right px-4 md:px-5 py-2.5 md:py-3 font-medium">공급가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 md:px-5 py-2.5 md:py-3 font-medium text-gray-900">{order.order_number}</td>
                    <td className="px-4 md:px-5 py-2.5 md:py-3 text-gray-600">{(order.branch as unknown as { name: string })?.name || "-"}</td>
                    <td className="px-4 md:px-5 py-2.5 md:py-3 text-gray-600">{order.order_date}</td>
                    <td className="px-4 md:px-5 py-2.5 md:py-3">
                      <span className={`px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 md:px-5 py-2.5 md:py-3 text-right text-gray-900">{formatCurrency(order.total_supply_amount)}</td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400">주문 데이터가 없습니다</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 이번 달 vs 지난 달 비교 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <h2 className="font-bold text-gray-900 text-sm md:text-base mb-4">이번 달 vs 지난 달 비교</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 구매금액 */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs md:text-sm text-gray-500 mb-2">구매금액</p>
              <div className="flex items-end gap-2 mb-2">
                <div>
                  <p className="text-lg md:text-2xl font-bold text-gray-900">{formatCurrency(monthComparison.thisMonth.purchase)}</p>
                  <p className="text-xs text-gray-500 mt-1">이번 달</p>
                </div>
                <div className="flex-1 text-right">
                  {monthComparison.lastMonth.purchase > 0 ? (
                    <p className={`text-sm font-semibold ${
                      monthComparison.thisMonth.purchase >= monthComparison.lastMonth.purchase ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {((monthComparison.thisMonth.purchase / monthComparison.lastMonth.purchase - 1) * 100).toFixed(1)}%
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-gray-500">지난 달: {formatCurrency(monthComparison.lastMonth.purchase)}</p>
            </div>

            {/* 공급가 */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs md:text-sm text-gray-500 mb-2">공급가</p>
              <div className="flex items-end gap-2 mb-2">
                <div>
                  <p className="text-lg md:text-2xl font-bold text-gray-900">{formatCurrency(monthComparison.thisMonth.supply)}</p>
                  <p className="text-xs text-gray-500 mt-1">이번 달</p>
                </div>
                <div className="flex-1 text-right">
                  {monthComparison.lastMonth.supply > 0 ? (
                    <p className={`text-sm font-semibold ${
                      monthComparison.thisMonth.supply >= monthComparison.lastMonth.supply ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {((monthComparison.thisMonth.supply / monthComparison.lastMonth.supply - 1) * 100).toFixed(1)}%
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-gray-500">지난 달: {formatCurrency(monthComparison.lastMonth.supply)}</p>
            </div>

            {/* 마진 */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs md:text-sm text-gray-500 mb-2">마진</p>
              <div className="flex items-end gap-2 mb-2">
                <div>
                  <p className="text-lg md:text-2xl font-bold text-emerald-600">{formatCurrency(monthComparison.thisMonth.margin)}</p>
                  <p className="text-xs text-gray-500 mt-1">이번 달</p>
                </div>
                <div className="flex-1 text-right">
                  {monthComparison.lastMonth.margin > 0 ? (
                    <p className={`text-sm font-semibold ${
                      monthComparison.thisMonth.margin >= monthComparison.lastMonth.margin ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {((monthComparison.thisMonth.margin / monthComparison.lastMonth.margin - 1) * 100).toFixed(1)}%
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-gray-500">지난 달: {formatCurrency(monthComparison.lastMonth.margin)}</p>
            </div>
          </div>
        </div>

        {/* 지점별 이번 달 현황 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <h2 className="font-bold text-gray-900 text-sm md:text-base mb-4">지점별 이번 달 현황</h2>
          <div className="space-y-4">
            {branchMonthStats.map((branch) => {
              const maxPurchase = Math.max(...branchMonthStats.map((b) => b.purchase), 1);
              return (
                <div key={branch.branchId}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-900">{branch.branchName}</span>
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(branch.purchase)}</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${(branch.purchase / maxPurchase) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                    <span>공급: {formatCurrency(branch.supply)}</span>
                    <span>마진: {formatCurrency(branch.margin)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
