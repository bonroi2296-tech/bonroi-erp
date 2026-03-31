"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Search, ExternalLink } from "lucide-react";

interface Vendor {
  id: string;
  name: string;
  category: string;
  payment_method: string;
  delivery_note: string;
  website_url: string;
  auto_order_enabled: boolean;
  vendor_products: { id: string }[];
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVendors() {
      const { data } = await supabase
        .from("vendors")
        .select("id, name, category, payment_method, delivery_note, website_url, auto_order_enabled, vendor_products(id)")
        .order("name");
      setVendors((data as unknown as Vendor[]) || []);
      setLoading(false);
    }
    fetchVendors();
  }, []);

  return (
    <>
      <TopBar title="벤더 관리" subtitle={`총 ${vendors.length}개 벤더 등록`} />
      <div className="flex-1 p-6 space-y-4 overflow-auto">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="벤더명 검색..." />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            vendors.map((vendor) => (
              <div key={vendor.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900">{vendor.name}</h3>
                    <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      vendor.category === "양방" ? "bg-blue-100 text-blue-700" :
                      vendor.category === "한방" ? "bg-orange-100 text-orange-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{vendor.category}</span>
                  </div>
                  {vendor.auto_order_enabled && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">자동발주</span>
                  )}
                </div>
                <div className="space-y-1.5 text-sm text-gray-600">
                  <p>취급 품목: <span className="font-medium text-gray-900">{vendor.vendor_products?.length || 0}개</span></p>
                  {vendor.payment_method && <p>결제: {vendor.payment_method}</p>}
                  {vendor.delivery_note && <p>배송: {vendor.delivery_note}</p>}
                </div>
                {vendor.website_url && (
                  <a href={vendor.website_url} target="_blank" rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
                    <ExternalLink className="w-3.5 h-3.5" /> 사이트 바로가기
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
