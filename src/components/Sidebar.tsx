"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Send,
  FileText, BarChart3, Settings, X, TrendingDown, RotateCcw, ClipboardList, ShieldAlert, LogOut, PackageSearch, Menu,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; icon: LucideIcon; label: string; hidden?: boolean };

// hidden:true = 미사용 화면. 메뉴에서만 숨기고 라우트·코드는 보존(PROJECT_CONTEXT 결정#2).
// 부활 시 hidden 만 떼면 됨.
const navItems: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { href: "/orders", icon: ShoppingCart, label: "주문(기존)" },
  { href: "/sourcing", icon: PackageSearch, label: "확보 관리" },
  { href: "/order-history", icon: ClipboardList, label: "주문 내역" },
  { href: "/products", icon: Package, label: "제품" },
  { href: "/price-compare", icon: TrendingDown, label: "단가 비교" },
  { href: "/vendors", icon: Truck, label: "벤더 관리" },
  { href: "/supply-monitor", icon: ShieldAlert, label: "공급망 관리" },
  { href: "/purchase", icon: Send, label: "발주 관리", hidden: true },
  { href: "/returns", icon: RotateCcw, label: "반품 관리", hidden: true },
  { href: "/documents", icon: FileText, label: "문서 생성", hidden: true },
  { href: "/analytics", icon: BarChart3, label: "분석/리포트", hidden: true },
  { href: "/settings", icon: Settings, label: "설정" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const items = navItems.filter((i) => !i.hidden);

  return (
    <header className="sticky top-0 z-40 bg-gray-900 text-white border-b border-gray-800">
      <div className="flex items-center gap-3 px-3 md:px-4 h-12">
        <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Package className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm hidden sm:inline">본로이 ERP</span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition whitespace-nowrap ${
                  active ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="md:hidden flex-1" />

        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 truncate max-w-[160px]">{email ?? "로그인 정보 없음"}</span>
          <button onClick={handleSignOut} title="로그아웃" className="text-gray-300 hover:text-white p-1">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden p-1 text-gray-300 hover:text-white"
          aria-label="메뉴"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900">
          <nav className="py-2">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    active ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
            <div className="border-t border-gray-800 mt-2 pt-2 px-4 flex items-center justify-between">
              <span className="text-xs text-gray-400 truncate">{email ?? "로그인 정보 없음"}</span>
              <button onClick={handleSignOut} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white">
                <LogOut className="w-3.5 h-3.5" /> 로그아웃
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
