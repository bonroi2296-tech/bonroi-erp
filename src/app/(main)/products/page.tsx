"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { Search, X, Plus, Trash2, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

interface Product {
  id: string;
  name: string;
  spec: string;
  category: string;
  supply_price: number;
  image_url: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  description: string | null;
  edi_code: string | null;
  vendor_products: { unit_price: number; is_lowest: boolean; vendor: { name: string } }[];
}

// 공공 API 조회 결과 한 줄(서버 라우트의 정규화 형식)
interface LookupItem {
  name: string | null;
  model: string | null;
  spec: string | null;
  grade: string | null;
  manufacturer: string | null;
  permit_no: string | null;
  udi_di: string | null;
  edi_code: string | null;
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
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // 검색어 디바운스
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // 필터/검색 변경 시 첫 페이지로
  useEffect(() => {
    setPage(0);
  }, [categoryFilter, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    async function fetchProducts() {
      setLoading(true);
      let query = supabase
        .from("products")
        .select(
          "id, name, spec, category, supply_price, image_url, pack_size, pack_unit, description, edi_code, vendor_products(unit_price, is_lowest, vendor:vendors(name))",
          { count: "exact" }
        );

      if (categoryFilter !== "전체") query = query.eq("category", categoryFilter);
      if (debouncedSearch) {
        const term = debouncedSearch.replace(/[%,]/g, "");
        query = query.or(`name.ilike.%${term}%,spec.ilike.%${term}%`);
      }

      const { data, count } = await query
        .order("name")
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (cancelled) return;
      setProducts((data as unknown as Product[]) || []);
      setTotalCount(count || 0);
      setLoading(false);
    }
    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [page, categoryFilter, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <>
      <TopBar title="제품" subtitle={`총 ${totalCount.toLocaleString()}개`} />
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

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
            조건에 맞는 품목이 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-blue-300 transition text-left flex flex-col"
              >
                <div className="aspect-square bg-gray-50 flex items-center justify-center relative">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <span className="text-[11px] text-gray-300">사진 없음</span>
                  )}
                </div>
                <div className="p-2.5 space-y-0.5 flex-1">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
                  {product.spec && <p className="text-xs text-gray-500 line-clamp-1">{product.spec}</p>}
                  {product.pack_size != null && (
                    <p className="text-xs text-gray-600">
                      {product.pack_size}{product.pack_unit ? ` ${product.pack_unit}` : ""}
                    </p>
                  )}
                  {product.description && <p className="text-[11px] text-gray-400 line-clamp-1">{product.description}</p>}
                  <p className="text-sm font-bold text-gray-900 pt-1">
                    {product.supply_price ? (
                      <>
                        {formatCurrency(product.supply_price)}
                        <span className="ml-1 text-[10px] font-normal text-gray-400">(변동 가능)</span>
                      </>
                    ) : (
                      <span className="text-xs font-normal text-gray-400">가격 문의</span>
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} / {totalCount.toLocaleString()}개
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> 이전
              </button>
              <span className="text-sm text-gray-600">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
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
  const toast = useToast();
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
      toast.error("벤더, 최소수량, 단가를 모두 입력해주세요.");
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
        toast.error("이미 같은 벤더/수량 구간이 등록되어 있습니다.");
      } else {
        toast.error("저장 실패: " + error.message);
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
      toast.error("삭제 실패: " + error.message);
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
            <p className="text-sm text-gray-500">{product.spec || "-"} · 공급가 {formatCurrency(product.supply_price)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <ProductInfoEditor product={product} />

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
                            <td className="py-1.5 text-right font-medium text-gray-900">{formatCurrency(tier.unit_price)}</td>
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

// ===== 제품 정보(쇼핑몰 베이스) 편집 =====
function ProductInfoEditor({ product }: { product: Product }) {
  const toast = useToast();
  const [imageUrl, setImageUrl] = useState(product.image_url ?? "");
  const [packSize, setPackSize] = useState(product.pack_size != null ? String(product.pack_size) : "");
  const [packUnit, setPackUnit] = useState(product.pack_unit ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [uploading, setUploading] = useState(false);
  const [ediCode, setEdiCode] = useState(product.edi_code ?? "");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupItems, setLookupItems] = useState<LookupItem[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const save = async (patch: { image_url?: string | null; pack_size?: number | null; pack_unit?: string | null; description?: string | null; edi_code?: string | null }) => {
    const { error } = await supabase.from("products").update(patch).eq("id", product.id);
    if (error) toast.error("저장 실패: " + error.message);
  };

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("이미지 파일만 업로드할 수 있어요.");
    if (file.size > 5 * 1024 * 1024) return toast.error("이미지가 너무 커요. 5MB 이하로 줄여주세요.");
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${product.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      const url = data.publicUrl;
      setImageUrl(url);
      await save({ image_url: url });
      toast.success("사진 업로드 완료");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const lookupEdi = async () => {
    const code = ediCode.trim();
    if (!code) return toast.error("EDI 코드를 먼저 입력하세요.");
    setLookupBusy(true);
    setLookupError(null);
    setLookupItems(null);
    try {
      const r = await fetch(`/api/catalog/lookup?edi=${encodeURIComponent(code)}`);
      const j = await r.json();
      if (!j.ok) {
        setLookupError(j.error || "조회 실패");
      } else {
        setLookupItems(j.items || []);
        if ((j.items || []).length === 0) toast.info("해당 EDI 로 결과가 없어요.");
      }
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLookupBusy(false);
    }
  };

  return (
    <div className="bg-blue-50/30 rounded-lg p-3 border border-blue-100">
      <p className="text-xs font-semibold text-gray-700 mb-2">제품 정보 (쇼핑몰 베이스)</p>
      <div className="flex gap-3">
        <div className="w-20 h-20 bg-white border border-gray-200 rounded-md overflow-hidden flex items-center justify-center text-[10px] text-gray-400 flex-shrink-0">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            "사진 없음"
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 flex-shrink-0">사진</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              onBlur={() => save({ image_url: imageUrl.trim() || null })}
              placeholder="URL 붙여넣기 또는 →"
              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <label className={`flex items-center gap-1 px-2 py-1 border border-gray-200 rounded text-xs cursor-pointer hover:bg-gray-50 flex-shrink-0 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? "업로드 중…" : "파일 올리기"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 flex-shrink-0">박스당 수량</label>
            <input
              type="number"
              min={0}
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              onBlur={() => save({ pack_size: packSize === "" ? null : Number(packSize) })}
              className="w-24 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <input
              type="text"
              value={packUnit}
              onChange={(e) => setPackUnit(e.target.value)}
              onBlur={() => save({ pack_unit: packUnit.trim() || null })}
              placeholder="EA, 매, 개..."
              className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-start gap-2">
            <label className="text-xs text-gray-500 w-20 flex-shrink-0 mt-1">짧은 설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => save({ description: description.trim() || null })}
              placeholder="용도·특이사항 등"
              rows={2}
              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs resize-y focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 flex-shrink-0">EDI 코드</label>
            <input
              type="text"
              value={ediCode}
              onChange={(e) => setEdiCode(e.target.value)}
              onBlur={() => save({ edi_code: ediCode.trim() || null })}
              placeholder="식약처 EDI/UDI-DI"
              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="button"
              onClick={lookupEdi}
              disabled={lookupBusy}
              className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded text-xs hover:bg-gray-50 flex-shrink-0 disabled:opacity-50"
              title="식약처 공공 API 로 이 EDI 정보를 조회"
            >
              {lookupBusy ? "조회 중…" : "공공 API 조회"}
            </button>
          </div>
          {lookupError && (
            <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {lookupError}
            </div>
          )}
          {lookupItems && lookupItems.length > 0 && (
            <div className="space-y-1.5 bg-white border border-gray-200 rounded p-2">
              <p className="text-[10px] font-semibold text-gray-500">공공 API 결과 ({lookupItems.length}건)</p>
              {lookupItems.map((it, i) => (
                <div key={i} className="text-[11px] text-gray-700 border-t border-gray-100 pt-1 first:border-t-0 first:pt-0">
                  <div className="font-medium text-gray-900">{it.name ?? "(이름 없음)"}{it.model ? ` · ${it.model}` : ""}</div>
                  <div className="text-gray-500">
                    {[it.manufacturer && `제조: ${it.manufacturer}`, it.grade && `${it.grade}등급`, it.permit_no && `허가 ${it.permit_no}`, it.udi_di && `UDI ${it.udi_di}`, it.edi_code && `EDI ${it.edi_code}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
