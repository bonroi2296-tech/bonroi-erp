"use client";

import TopBar from "@/components/TopBar";
import { Send, Clock, CheckCircle, AlertCircle } from "lucide-react";

export default function PurchasePage() {
  return (
    <>
      <TopBar title="발주 관리" subtitle="벤더별 발주 현황 및 자동 발주" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[
            { label: "대기 중", count: 0, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" },
            { label: "발주 완료", count: 0, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
            { label: "확인 필요", count: 0, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`${item.bg} rounded-xl p-5 border border-gray-100`}>
                <div className="flex items-center gap-3">
                  <Icon className={`w-8 h-8 ${item.color}`} />
                  <div>
                    <p className="text-sm text-gray-500">{item.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{item.count}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Send className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">발주 관리 기능 준비 중</h3>
          <p className="text-sm text-gray-500">주문 접수 후 벤더별 자동 발주 기능이 곧 추가됩니다.</p>
        </div>
      </div>
    </>
  );
}
