"use client";

import TopBar from "@/components/TopBar";
import { FileText, FileSpreadsheet, Download } from "lucide-react";

export default function DocumentsPage() {
  return (
    <>
      <TopBar title="문서 생성" subtitle="지출품의서, 거래명세서 자동 생성" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">지출품의서</h3>
            <p className="text-sm text-gray-500 mb-4">주문 건별 지출품의서를 자동으로 생성합니다. 기존 엑셀 양식을 그대로 활용합니다.</p>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 opacity-50 cursor-not-allowed" disabled>
              <Download className="w-4 h-4" /> 준비 중
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">거래명세서</h3>
            <p className="text-sm text-gray-500 mb-4">벤더별 거래명세서를 자동으로 생성합니다. 배송 완료 후 정산에 활용됩니다.</p>
            <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 opacity-50 cursor-not-allowed" disabled>
              <Download className="w-4 h-4" /> 준비 중
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
