"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Search, X, Plus, Trash2, TrendingDown } from "lucide-react";

interface Product {
  id: string;
  name: string;
  spec: string;
  category: string;
  supply_price: number;
  vendor_products: { unit_price: number; is_lowest: boolean; vendor: { name: string } }[];
}

interface PriceTier {
  id: string;
  product_id: string;
  vendor_id: string;
  min_qty: number;
  unit_price: number;
  note: string | null;
  vendor?: { name: string };
}

interface Vendor {
  id: string;
  name: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("전체");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const { data } = await supabase
      .from("products")
      .select("id, name, spec, category, supply_price, vendor_products(unit_price, is_lowest, vendor:vendors(name))")
      .order("name");
    setProducts((data as unknown as Product[]) || []);
    setLoading(false);
  }

  const filtered = products.filter(p => {
    const matchesCategory = categoryFilter === "전체" || p.category === categoryFilter;
    const matchesSearch = searchTerm === "" ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.spec.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <>
      <TopBar title="품목 마스터" subtitle={`총 ${products.length}개 품목 등록`} />
      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-full sm:w-72 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="품목명, 규격 검색..."
            />
          </div>
          <div className="flex items-center gap-2">
            {["전체", "양방", "한방"].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition ${
                  categoryFilter === cat ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">품목명</th>
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">규격</th>
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">구분</th>
                    <th className="text-right px-4 md:px-5 py-2.5 md:py-3 font-medium">공급가</th>
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">최저가 벤더</th>
                    <th className="text-right px-4 md:px-5 py-2.5 md:py-3 font-medium">최저가</th>
                    <th className="text-center px-4 md:px-5 py-2.5 md:py-3 font-medium">벤더 수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((product) => {
                    const lowest = product.vendor_products?.find(vp => vp.is_lowest);
                    const lowestPrice = lowest?.unit_price || Math.min(...(product.vendor_products?.map(vp => vp.unit_price) || [0]));
                    const lowestVendor = lowest ? (lowest.vendor as unknown as { name: string })?.name : (product.vendor_products?.[0]?.vendor as unknown as { name: string })?.name || "-";
                    return (
                      <tr
                        key={product.id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <td className="px-4 md:px-5 py-2.5 md:py-3 font-medium text-gray-900">{product.name}</td>
                        <td className="px-4 md:px-5 py-2.5 md:py-3 text-gray-600">{product.spec || "-"}</td>
                        <td className="px-4 md:px-5 py-2.5 md:py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            product.category === "양방" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                          }`}>{product.category}</span>
                        </td>
                        <td className="px-4 md:px-5 py-2.5 md:py-3 text-right text-gray-900">₩{(product.supply_price || 0).toLocaleString()}</td>
                        <td className="px-4 md:px-5 py-2.5 md:py-3 text-gray-600">{lowestVendor}</td>
                        <td className="px-4 md:px-5 py-2.5 md:py-3 text-right text-emerald-600 font-medium">₩{lowestPrice.toLocaleString()}</td>
                        <td className="px-4 md:px-5 py-2.5 md:py-3 text-center text-gray-500">{product.vendor_products?.length || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedProduct && (
        <PriceTierModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}

// ===== 구간별 단가 관리 모달 =====
function PriceTierModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  // 신규 입력 폼
  const [newVendorId, setNewVendorId] = useState("");
  const [newMinQty, setNewMinQty] = useState<number>(1);
  const [newUnitPrice, setNewUnitPrice] = useState<number>(0);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchData() {
    setLoading(true);
    const [tiersRes, vendorsRes] = await Promise.all([
      supabase
        .from("price_tiers")
        .select("id, product_id, vendor_id, min_qty, unit_price, note, vendor:vendors(name)")
        .eq("product_id", product.id)
        .order("vendor_id")
        .order("min_qty"),
      supabase.from("vendors").select("id, name").order("name"),
    ]);
    setTiers((tiersRes.data as unknown as PriceTier[]) || []);
    setVendors(vendorsRes.data || []);
    setLoading(false);
  }

  async function handleAdd() {
    if (!newVendorId || newMinQty < 1 || newUnitPrice < 1) {
      alert("벤더, 최소수량, 단가를 모두 입력해주세요.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("price_tiers").insert({
      product_id: product.id,
      vendor_id: newVendorId,
      min_qty: newMinQty,
      unit_price: newUnitPrice,
      note: newNote || null,
    });
    if (error) {
      if (error.code === "23505") {
        alert("이미 같은 벤더/수량 구간이 등록되어 있습니다.");
      } else {
        alert("저장 실패: " + error.message);
      }
    } else {
      setNewVendorId("");
      setNewMinQty(1);
      setNewUnitPrice(0);
      setNewNote("");
      await fetchData();
    }
    setSaving(false);
  }

  async function handleDelete(tierId: string) {
    if (!confirm("이 구간 단가를 삭제할까요?")) return;
    const { error } = await supabase.from("price_tiers").delete().eq("id", tierId);
    if (error) {
      alert("삭제 실패: " + error.message);
    } else {
      await fetchData();
    }
  }

  // 벤더별로 그룹핑
  const grouped = tiers.reduce<Record<string, PriceTier[]>>((acc, tier) => {
    const vendorName = (tier.vendor as unknown as { name: string })?.name || "알 수 없음";
    if (!acc[vendorName]) acc[vendorName] = [];
    acc[vendorName].push(tier);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg max-w-xl w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{product.name}</h2>
            <p className="text-sm text-gray-500">{product.spec || "-"} · 공급가 ₩{(product.supply_price || 0).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 기존 구간 단가 목록 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">수량 구간별 단가</h3>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">등록된 구간 단가가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(grouped).map(([vendorName, vendorTiers]) => (
                  <div key={vendorName} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">{vendorName}</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400">
                          <th className="text-left py-1">최소 수량</th>
                          <th className="text-right py-1">단가</th>
                          <th className="text-left py-1 pl-3">비고</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorTiers.map((tier) => (
                          <tr key={tier.id} className="border-t border-gray-200">
                            <td className="py-1.5 text-gray-700">{tier.min_qty.toLocaleString()}개 이상</td>
                            <td className="py-1.5 text-right font-medium text-gray-900">₩{tier.unit_price.toLocaleString()}</td>
                            <td className="py-1.5 pl-3 text-gray-500 text-xs">{tier.note || ""}</td>
                            <td className="py-1.5">
                              <button
                                onClick={() => handleDelete(tier.id)}
                                className="text-red-400 hover:text-red-600 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 구간 추가 폼 */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-900">구간 추가</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">벤더</label>
                <select
                  value={newVendorId}
                  onChange={(e) => setNewVendorId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">선택</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">최소 수량</label>
                <input
                  type="number"
                  min="1"
                  value={newMinQty}
                  onChange={(e) => setNewMinQty(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">매입 단가</label>
                <input
                  type="number"
                  min="0"
                  value={newUnitPrice}
                  onChange={(e) => setNewUnitPrice(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">비고</label>
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="예: 1카톤 기준"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="mt-3 w-full px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-400 transition"
            >
              {saving ? "저장 중..." : "구간 추가"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
