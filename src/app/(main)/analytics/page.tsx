"use client";

import TopBar from "@/components/TopBar";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <>
      <TopBar title="분석/리포트" subtitle="매출, 마진, 벤더별 분석" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">분석 기능 준비 중</h3>
          <p className="text-sm text-gray-500">주문 데이터 기반 매출/마진 분석, 벤더별 가격 비교 리포트가 곧 추가됩니다.</p>
        </div>
      </div>
    </>
  );
}
