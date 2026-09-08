"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import type { TablesUpdate } from "@/lib/database.types";
import { User, Building, Key } from "lucide-react";

interface Branch {
  id: string;
  name: string;
  short_name: string;
  address: string | null;
  fax: string | null;
}

export default function SettingsPage() {
  const toast = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("branches")
      .select("id, name, short_name, address, fax")
      .order("short_name")
      .then(({ data }) => {
        setBranches((data as Branch[]) || []);
        setLoading(false);
      });
  }, []);

  // 거래명세서 공급받는자 칸에 그대로 들어가므로 층·병동은 빼고 주소만 넣는다.
  const saveField = async (b: Branch, field: "address" | "fax", raw: string) => {
    const value = raw.trim() || null;
    if (value === (b[field] ?? null)) return;
    const patch: TablesUpdate<"branches"> = field === "address" ? { address: value } : { fax: value };
    const { error } = await supabase.from("branches").update(patch).eq("id", b.id);
    if (error) return toast.error(error.message);
    setBranches((prev) => prev.map((x) => (x.id === b.id ? { ...x, [field]: value } : x)));
    toast.success(`${b.short_name} 저장했어요.`);
  };

  return (
    <>
      <TopBar title="설정" subtitle="시스템 및 계정 설정" />
      <div className="flex-1 p-4 md:p-6 overflow-auto space-y-3 md:space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
          <div className="flex items-center gap-3 md:gap-4 mb-4">
            <div className="w-9 h-9 md:w-10 md:h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Building className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-sm md:text-base">지점 관리</h3>
              <p className="text-xs md:text-sm text-gray-500">
                여기 주소가 거래명세서 &ldquo;공급받는자&rdquo; 칸에 그대로 들어갑니다
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {branches.map((b) => (
                <div key={b.id} className="grid grid-cols-1 md:grid-cols-[8rem_1fr_12rem] gap-2 md:items-center">
                  <span className="text-sm font-medium text-gray-900">{b.name}</span>
                  <input
                    defaultValue={b.address ?? ""}
                    onBlur={(e) => saveField(b, "address", e.target.value)}
                    placeholder="주소 (예: 서울 성동구 천호대로 320)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    defaultValue={b.fax ?? ""}
                    onBlur={(e) => saveField(b, "fax", e.target.value)}
                    placeholder="팩스"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              ))}
              <p className="text-[11px] text-gray-400">칸 밖을 누르면 저장됩니다</p>
            </div>
          )}
        </div>

        {[
          { icon: User, title: "계정 설정", desc: "준비 중" },
          { icon: Key, title: "API 연동", desc: "준비 중" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 flex items-center gap-3 md:gap-4 opacity-60">
              <div className="w-9 h-9 md:w-10 md:h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 text-sm md:text-base">{item.title}</h3>
                <p className="text-xs md:text-sm text-gray-500">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
