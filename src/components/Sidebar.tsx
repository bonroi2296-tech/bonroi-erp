"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Send,
  FileText, BarChart3, Settings, ChevronRight, X
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { href: "/orders", icon: ShoppingCart, label: "주문 관리" },
  { href: "/products", icon: Package, label: "품목 마스터" },
  { href: "/vendors", icon: Truck, label: "벤더 관리" },
  { href: "/purchase", icon: Send, label: "발주 관리" },
  { href: "/documents", icon: FileText, label: "문서 생성" },
  { href: "/analytics", icon: BarChart3, label: "분석/리포트" },
  { href: "/settings", icon: Settings, label: "설정" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${collapsed ? "w-20" : "w-64"} bg-gray-900 text-white flex flex-col transition-all duration-300 flex-shrink-0 h-screen sticky top-0`}>
      <div className="p-4 flex items-center gap-3 border-b border-gray-800">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5" />
        </div>
        {!collapsed && <span className="font-bold text-lg">본로이 ERP</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-gray-400 hover:text-white">
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </button>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                active ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold">강</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">강주영</p>
              <p className="text-xs text-gray-500">관리자</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
