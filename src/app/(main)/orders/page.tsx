"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Filter } from "lucide-react";

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  total_purchase_amount: number;
  total_supply_amount: number;
  total_margin: number;
  branch: { name: string };
}

const statusColors: Record<string, string> = {
  "발주완료": "bg-green-100 text-green-700",
  "처리중": "bg-blue-100 text-blue-700",
  "대기": "bg-yellow-100 text-yellow-700",
  "확인필요": "bg-red-100 text-red-700",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, order_date, status, total_purchase_amount, total_supply_amount, total_margin, branch:branches(name)")
        .order("order_date", { ascending: false })
        .limit(50);
      setOrders((data as unknown as Order[]) || []);
      setLoading(false);
    }
    fetchOrders();
  }, []);

  return (
    <>
      <TopBar title="주문 관리" subtitle="병원별 주문 내역 조회 및 관리" />
      <div className="flex-1 p-6 space-y-4 overflow-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-72 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="주문번호, 지점명 검색..." />
            </div>
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Filter className="w-4 h-4" /> 필터
            </button>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 새 주문
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-5 py-3 font-medium">주문번호</th>
                  <th className="text-left px-5 py-3 font-medium">지점</th>
                  <th className="text-left px-5 py-3 font-medium">주문일</th>
                  <th className="text-left px-5 py-3 font-medium">상태</th>
                  <th className="text-right px-5 py-3 font-medium">매입가</th>
                  <th className="text-right px-5 py-3 font-medium">공급가</th>
                  <th className="text-right px-5 py-3 font-medium">마진</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-5 py-3 font-medium text-blue-600">{order.order_number}</td>
                    <td className="px-5 py-3 text-gray-600">{(order.branch as unknown as { name: string })?.name || "-"}</td>
                    <td className="px-5 py-3 text-gray-600">{order.order_date}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">₩{(order.total_purchase_amount || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-gray-900">₩{(order.total_supply_amount || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-emerald-600 font-medium">₩{(order.total_margin || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
