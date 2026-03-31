"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Package, ShoppingCart, Truck, TrendingUp, ArrowUpRight } from "lucide-react";

interface DashboardStats {
  productCount: number;
  orderCount: number;
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

const statusColors: Record<string, string> = {
  "발주완료": "bg-green-100 text-green-700",
  "처리중": "bg-blue-100 text-blue-700",
  "대기": "bg-yellow-100 text-yellow-700",
  "확인필요": "bg-red-100 text-red-700",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({ productCount: 0, orderCount: 0, vendorCount: 0, totalMargin: 0 });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsRes, ordersRes, vendorsRes, recentRes] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase.from("orders").select("id, total_margin", { count: "exact" }),
          supabase.from("vendors").select("id", { count: "exact", head: true }),
          supabase
            .from("orders")
            .select("id, order_number, order_date, status, total_supply_amount, branch:branches(name)")
            .order("order_date", { ascending: false })
            .limit(8),
        ]);

        const totalMargin = ordersRes.data?.reduce((sum, o) => sum + (o.total_margin || 0), 0) || 0;

        setStats({
          productCount: productsRes.count || 0,
          orderCount: ordersRes.count || 0,
          vendorCount: vendorsRes.count || 0,
          totalMargin,
        });

        setRecentOrders((recentRes.data as unknown as RecentOrder[]) || []);
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
    { label: "총 주문", value: stats.orderCount.toLocaleString(), icon: ShoppingCart, color: "bg-emerald-500", change: null },
    { label: "거래 벤더", value: stats.vendorCount.toLocaleString(), icon: Truck, color: "bg-purple-500", change: null },
    { label: "총 마진", value: `₩${stats.totalMargin.toLocaleString()}`, icon: TrendingUp, color: "bg-amber-500", change: null },
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
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500 font-medium">{card.label}</span>
                  <div className={`${card.color} w-10 h-10 rounded-xl flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            );
          })}
        </div>

        {/* Recent Orders Table */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">최근 주문</h2>
            <a href="/orders" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              전체보기 <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-5 py-3 font-medium">주문번호</th>
                  <th className="text-left px-5 py-3 font-medium">지점</th>
                  <th className="text-left px-5 py-3 font-medium">주문일</th>
                  <th className="text-left px-5 py-3 font-medium">상태</th>
                  <th className="text-right px-5 py-3 font-medium">공급가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{order.order_number}</td>
                    <td className="px-5 py-3 text-gray-600">{(order.branch as unknown as { name: string })?.name || "-"}</td>
                    <td className="px-5 py-3 text-gray-600">{order.order_date}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-900">₩{(order.total_supply_amount || 0).toLocaleString()}</td>
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
      </div>
    </>
  );
}
