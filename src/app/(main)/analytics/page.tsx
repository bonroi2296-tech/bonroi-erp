"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { TrendingUp, Store, Package, Percent } from "lucide-react";

interface Order {
  id: string;
  order_date: string;
  branch_id: string;
  total_purchase_amount: number;
  total_supply_amount: number;
  total_margin: number;
  category: string;
  vendor_name: string;
}

interface Branch {
  id: string;
  name: string;
  short_name: string;
}

interface MonthlyData {
  month: string;
  purchase: number;
  supply: number;
  margin: number;
}

interface BranchStats {
  id: string;
  name: string;
  totalPurchase: number;
  totalSupply: number;
  totalMargin: number;
  orderCount: number;
}

interface VendorRank {
  vendor_name: string;
  total_purchase: number;
}

export default function AnalyticsPage() {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [branchStats, setBranchStats] = useState<BranchStats[]>([]);
  const [vendorRanks, setVendorRanks] = useState<VendorRank[]>([]);
  const [categoryData, setCategoryData] = useState<{ category: string; purchase: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    async function fetchData() {
      try {
        const [ordersRes, branchesRes] = await Promise.all([
          supabase.from("orders").select("*"),
          supabase.from("branches").select("*"),
        ]);

        const orders = (ordersRes.data || []) as Order[];
        const branches = (branchesRes.data || []) as Branch[];

        // 1. 월별 추이
        const monthMap = new Map<string, { purchase: number; supply: number; margin: number }>();
        orders.forEach((order) => {
          const month = order.order_date.substring(0, 7);
          const current = monthMap.get(month) || { purchase: 0, supply: 0, margin: 0 };
          monthMap.set(month, {
            purchase: current.purchase + (order.total_purchase_amount || 0),
            supply: current.supply + (order.total_supply_amount || 0),
            margin: current.margin + (order.total_margin || 0),
          });
        });

        const sortedMonths = Array.from(monthMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6);

        setMonthlyData(
          sortedMonths.map(([month, data]) => ({
            month: month.split("-")[1],
            purchase: data.purchase,
            supply: data.supply,
            margin: data.margin,
          }))
        );

        // 2. 지점별 비교
        const branchMap = new Map<string, BranchStats>();
        branches.forEach((branch) => {
          branchMap.set(branch.id, {
            id: branch.id,
            name: branch.name,
            totalPurchase: 0,
            totalSupply: 0,
            totalMargin: 0,
            orderCount: 0,
          });
        });

        orders.forEach((order) => {
          const branch = branchMap.get(order.branch_id);
          if (branch) {
            branch.totalPurchase += order.total_purchase_amount || 0;
            branch.totalSupply += order.total_supply_amount || 0;
            branch.totalMargin += order.total_margin || 0;
            branch.orderCount += 1;
          }
        });

        setBranchStats(Array.from(branchMap.values()));

        // 3. 벤더별 매입 랭킹
        const vendorMap = new Map<string, number>();
        orders.forEach((order) => {
          const current = vendorMap.get(order.vendor_name) || 0;
          vendorMap.set(order.vendor_name, current + (order.total_purchase_amount || 0));
        });

        const topVendors = Array.from(vendorMap.entries())
          .map(([vendor_name, total_purchase]) => ({ vendor_name, total_purchase }))
          .sort((a, b) => b.total_purchase - a.total_purchase)
          .slice(0, 10);

        setVendorRanks(topVendors);

        // 4. 카테고리별 비중 (양방 vs 한방)
        const categoryMap = new Map<string, number>();
        orders.forEach((order) => {
          const cat = order.category || "기타";
          const current = categoryMap.get(cat) || 0;
          categoryMap.set(cat, current + (order.total_purchase_amount || 0));
        });

        const catData = Array.from(categoryMap.entries())
          .map(([category, purchase]) => ({ category, purchase }))
          .sort((a, b) => b.purchase - a.purchase);

        setCategoryData(catData);
      } catch (err) {
        console.error("Analytics fetch error:", err);
        toast.error("분석 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <>
        <TopBar title="분석/리포트" subtitle="매출, 마진, 벤더별 분석" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </>
    );
  }

  const maxPurchase = Math.max(...monthlyData.map((m) => m.purchase), 1);
  const totalCategoryPurchase = categoryData.reduce((sum, c) => sum + c.purchase, 0);

  return (
    <>
      <TopBar title="분석/리포트" subtitle="매출, 마진, 벤더별 분석" />
      <div className="flex-1 p-4 md:p-6 space-y-6 overflow-auto">
        {/* 월별 추이 차트 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">월별 추이 (최근 6개월)</h2>
          <div className="space-y-3">
            {monthlyData.map((month) => (
              <div key={month.month} className="space-y-1">
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-gray-600">{month.month}월</span>
                  <div className="flex gap-4 text-gray-600">
                    <span>구매: ₩{month.purchase.toLocaleString()}</span>
                    <span>공급: ₩{month.supply.toLocaleString()}</span>
                    <span>마진: ₩{month.margin.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-1 h-6 bg-gray-100 rounded">
                  <div
                    className="bg-blue-500 rounded"
                    style={{ width: `${(month.purchase / maxPurchase) * 100}%` }}
                  />
                  <div
                    className="bg-emerald-500 rounded"
                    style={{ width: `${(month.supply / maxPurchase) * 100}%` }}
                  />
                  <div
                    className="bg-amber-500 rounded"
                    style={{ width: `${(month.margin / maxPurchase) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded" />
              <span className="text-gray-600">구매</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded" />
              <span className="text-gray-600">공급</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded" />
              <span className="text-gray-600">마진</span>
            </div>
          </div>
        </div>

        {/* 지점별 비교 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-600" /> 지점별 현황
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branchStats.map((branch) => (
              <div key={branch.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-gray-900 mb-2">{branch.name}</h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">구매금액</span>
                    <span className="font-medium text-gray-900">₩{branch.totalPurchase.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">공급가</span>
                    <span className="font-medium text-gray-900">₩{branch.totalSupply.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">마진</span>
                    <span className="font-medium text-emerald-600">₩{branch.totalMargin.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-gray-100">
                    <span className="text-gray-600">발주 건수</span>
                    <span className="font-medium text-gray-900">{branch.orderCount}건</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 벤더별 매입 랭킹 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-600" /> 벤더별 매입 Top 10
          </h2>
          <div className="space-y-2">
            {vendorRanks.map((vendor, idx) => (
              <div key={vendor.vendor_name} className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400 w-6">{idx + 1}.</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{vendor.vendor_name}</span>
                    <span className="text-sm font-semibold text-gray-900">₩{vendor.total_purchase.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${(vendor.total_purchase / vendorRanks[0].total_purchase) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 카테고리별 비중 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Percent className="w-5 h-5 text-orange-600" /> 카테고리별 매입 비중
          </h2>
          <div className="space-y-3">
            {categoryData.map((cat) => {
              const percentage = totalCategoryPurchase > 0 ? (cat.purchase / totalCategoryPurchase) * 100 : 0;
              return (
                <div key={cat.category}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{cat.category}</span>
                    <span className="text-sm font-semibold text-gray-900">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        cat.category === "양방" ? "bg-blue-500" : cat.category === "한방" ? "bg-red-500" : "bg-gray-400"
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">₩{cat.purchase.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 월별 마진율 추이 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" /> 월별 마진율 추이
          </h2>
          <div className="space-y-3">
            {monthlyData.map((month) => {
              const marginRate = month.supply > 0 ? (month.margin / month.supply) * 100 : 0;
              return (
                <div key={month.month}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{month.month}월</span>
                    <span className="text-sm font-semibold text-green-600">{marginRate.toFixed(2)}%</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${Math.min(marginRate, 100)}%` }}
                    />
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
