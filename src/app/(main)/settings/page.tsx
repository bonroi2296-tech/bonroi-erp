"use client";

import TopBar from "@/components/TopBar";
import { User, Building, Key } from "lucide-react";

export default function SettingsPage() {
  return (
    <>
      <TopBar title="설정" subtitle="시스템 및 계정 설정" />
      <div className="flex-1 p-6 overflow-auto space-y-4">
        {[
          { icon: User, title: "계정 설정", desc: "비밀번호 변경, 프로필 관리" },
          { icon: Building, title: "지점 관리", desc: "병원 지점 정보 수정" },
          { icon: Key, title: "API 연동", desc: "외부 시스템 연동 설정" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                <Icon className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
