"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Search } from "lucide-react";

interface Product {
  id: string;
  name: string;
  spec: string;
  category: string;
  supply_price: number;
  vendor_products: { unit_price: number; is_lowest: boolean; vendor: { name: string } }[];
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("전체");

  useEffect(() => {
    async function fetchProducts() {
      const { data } = await supabase
        .from("products")
        .select("id, name, spec, category, supply_price, vendor_products(unit_price, is_lowest, vendor:vendors(name))")
        .order("name");
      setProducts((data as unknown as Product[]) || []);
      setLoading(false);
    }
    fetchProducts();
  }, []);

  const filtered = categoryFilter === "전체" ? products : products.filter(p => p.category === categoryFilter);

  return (
    <>
      <TopBar title="품목 마스터" subtitle={`총 ${products.length}개 품목 등록`} />
      <div className="flex-1 p-6 space-y-4 overflow-auto">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-72 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="품목명, 규격 검색..." />
          </div>
          {["전체", "양방", "한방"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                categoryFilter === cat ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat}
            </button>
          ))}
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
                  <th className="text-left px-5 py-3 font-medium">품목명</th>
                  <th className="text-left px-5 py-3 font-medium">규격</th>
                  <th className="text-left px-5 py-3 font-medium">구분</th>
                  <th className="text-right px-5 py-3 font-medium">공급가</th>
                  <th className="text-left px-5 py-3 font-medium">최저가 벤더</th>
                  <th className="text-right px-5 py-3 font-medium">최저가</th>
                  <th className="text-center px-5 py-3 font-medium">벤더 수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((product) => {
                  const lowest = product.vendor_products?.find(vp => vp.is_lowest);
                  const lowestPrice = lowest?.unit_price || Math.min(...(product.vendor_products?.map(vp => vp.unit_price) || [0]));
                  const lowestVendor = lowest ? (lowest.vendor as unknown as { name: string })?.name : (product.vendor_products?.[0]?.vendor as unknown as { name: string })?.name || "-";
                  return (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{product.name}</td>
                      <td className="px-5 py-3 text-gray-600">{product.spec || "-"}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          product.category === "양방" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                        }`}>{product.category}</span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-900">₩{(product.supply_price || 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-gray-600">{lowestVendor}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 font-medium">₩{lowestPrice.toLocaleString()}</td>
                      <td className="px-5 py-3 text-center text-gray-500">{product.vendor_products?.length || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
