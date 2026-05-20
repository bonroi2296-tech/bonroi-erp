"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Send,
  FileText, BarChart3, Settings, X, TrendingDown, RotateCcw, ClipboardList, ShieldAlert, LogOut, PackageSearch
} from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { href: "/orders", icon: ShoppingCart, label: "주문 관리" },
  { href: "/sourcing", icon: PackageSearch, label: "확보 관리" },
  { href: "/order-history", icon: ClipboardList, label: "주문 내역" },
  { href: "/products", icon: Package, label: "품목 마스터" },
  { href: "/price-compare", icon: TrendingDown, label: "단가 비교" },
  { href: "/vendors", icon: Truck, label: "벤더 관리" },
  { href: "/supply-monitor", icon: ShieldAlert, label: "공급망 관리" },
  { href: "/purchase", icon: Send, label: "발주 관리" },
  { href: "/returns", icon: RotateCcw, label: "반품 관리" },
  { href: "/documents", icon: FileText, label: "문서 생성" },
  { href: "/analytics", icon: BarChart3, label: "분석/리포트" },
  { href: "/settings", icon: Settings, label: "설정" },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col
        transform transition-transform duration-300 ease-in-out
        md:sticky md:top-0 md:h-screen md:translate-x-0
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
      `}
    >
      <div className="p-4 flex items-center gap-3 border-b border-gray-800">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5" />
        </div>
        <span className="font-bold text-lg">본로이 ERP</span>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-white md:hidden">
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                active ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
            {(email?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{email ?? "로그인 정보 없음"}</p>
            <p className="text-xs text-gray-500">관리자</p>
          </div>
          <button
            onClick={handleSignOut}
            title="로그아웃"
            className="text-gray-400 hover:text-white p-1 flex-shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
