"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { Search, ArrowUpDown, TrendingDown, AlertTriangle, X, Plus, Pencil, Trash2, Save } from "lucide-react";

interface VendorPrice {
  vendor_name: string;
  unit_price: number | null;
}

// 단가 미확인 표시. 화면·입력 모두 이 문자를 쓴다(취급은 하는데 값을 아직 모름 = DB unit_price null).
const UNKNOWN_MARK = "/";

// 입력칸 문자열 해석. "/" = 단가 미확인(행은 남기고 null), 빈칸 = 취급 안 함(행 삭제).
const parseVendorPriceInput = (raw: string | undefined): { unknown: boolean; price: number | null } => {
  const s = (raw ?? "").trim();
  if (s === UNKNOWN_MARK) return { unknown: true, price: null };
  if (s === "") return { unknown: false, price: null };
  const n = parseInt(s.replace(/[,₩\s]/g, ""), 10);
  return { unknown: false, price: Number.isNaN(n) ? null : n };
};

interface ProductWithPrices {
  id: string;
  name: string;
  spec: string | null;
  category: string | null;
  supply_price: number | null;
  vendors: Record<string, number | null>;
  // 취급은 하는데 단가를 모르는 거래처. vendors 가 null 인 것과 구분해 "/" 로 보여준다.
  vendorsUnknown: Record<string, boolean>;
  lowest_price: number | null;
  lowest_vendor: string | null;
  price_diff_pct: number | null;
}

interface VendorShippingInfo {
  id: string;
  name: string;
  shipping_fee: number | null;
  free_shipping_min: number | null;
}

interface SimulatedItem {
  productId: string;
  productName: string;
  quantity: number;
  vendors: Record<string, number | null>;
}

// 모달용 편집 폼 데이터
interface ProductFormData {
  name: string;
  spec: string;
  supply_price: string;
  vendorPrices: Record<string, string>;
}

const YANGBANG_VENDORS = ["SD바이오", "주사기닷컴", "디에이치몰", "메디오션", "한백상사"];
const HANBANG_VENDORS = ["수진메디칼", "안진도매로", "한의나라", "허브원", "케이엠몰"];

// 납품가를 넣을 때 마진이 얼마인지 바로 보여준다. 매번 엑셀로 확인하지 않게.
// 매입가는 부가세 포함, 납품가는 부가세 별도다. 실제로 주고받는 금액끼리 빼도록
// 청구액(납품가*1.1) - 매입가 로 잡는다. 장부의 '마진'과 같은 기준.
function MarginHint({
  supplyPriceRaw,
  vendorPrices,
}: {
  supplyPriceRaw: string;
  vendorPrices: Record<string, string>;
}) {
  const supply = parseInt((supplyPriceRaw || "").replace(/[,₩\s]/g, ""), 10);

  const costs = Object.entries(vendorPrices)
    .map(([vendor, raw]) => {
      const { unknown, price } = parseVendorPriceInput(raw);
      return unknown || price === null ? null : { vendor, price };
    })
    .filter((x): x is { vendor: string; price: number } => x !== null);

  if (!Number.isFinite(supply) || supply <= 0 || costs.length === 0) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">마진 (부가세 포함)</label>
        <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400">
          납품가와 매입단가를 넣으면 계산됩니다
        </div>
      </div>
    );
  }

  const cheapest = costs.reduce((a, b) => (b.price < a.price ? b : a));
  const billed = Math.round(supply * 1.1); // 병원에 청구하는 금액
  const margin = billed - cheapest.price;
  const pct = (margin / billed) * 100;
  const loss = margin <= 0;
  const thin = !loss && pct < 15;

  const valueTone = loss ? "text-red-600" : thin ? "text-amber-600" : "text-gray-900";

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">마진 (부가세 포함)</label>
      <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 flex items-center gap-2">
        <span className={`font-semibold tabular-nums ${valueTone}`}>
          {margin.toLocaleString()}원
        </span>
        <span className={`tabular-nums ${valueTone}`}>{pct.toFixed(1)}%</span>
        {loss && <span className="text-xs font-medium text-red-600">원가 이하</span>}
        {thin && <span className="text-xs font-medium text-amber-600">마진 낮음</span>}
        <span className="ml-auto text-xs text-gray-400 truncate">
          청구 {billed.toLocaleString()} − {cheapest.vendor} {cheapest.price.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export default function PriceComparePage() {
  const toast = useToast();
  const [products, setProducts] = useState<ProductWithPrices[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<"양방" | "한방">("양방");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"name" | "diff">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showOnlyPriceDiff, setShowOnlyPriceDiff] = useState(false);
  const [vendorShippingInfo, setVendorShippingInfo] = useState<VendorShippingInfo[]>([]);
  const [simulatedItems, setSimulatedItems] = useState<SimulatedItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedQty, setSelectedQty] = useState(1);

  // 벤더 ID 맵 (이름 → id)
  const [vendorIdMap, setVendorIdMap] = useState<Record<string, string>>({});

  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("edit");
  const [editingProduct, setEditingProduct] = useState<ProductWithPrices | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({ name: "", spec: "", supply_price: "", vendorPrices: {} });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductWithPrices | null>(null);

  // 모달 열기: 수정
  const openEditModal = useCallback((product: ProductWithPrices) => {
    setModalMode("edit");
    setEditingProduct(product);
    const vp: Record<string, string> = {};
    const vendorList = product.category === "양방" ? YANGBANG_VENDORS : HANBANG_VENDORS;
    vendorList.forEach((v) => {
      vp[v] =
        product.vendors[v] != null
          ? String(product.vendors[v])
          : product.vendorsUnknown?.[v]
          ? UNKNOWN_MARK
          : "";
    });
    setFormData({
      name: product.name,
      spec: product.spec ?? "",
      supply_price: product.supply_price != null ? String(product.supply_price) : "",
      vendorPrices: vp,
    });
    setModalOpen(true);
  }, []);

  // 모달 열기: 신규
  const openCreateModal = useCallback(() => {
    setModalMode("create");
    setEditingProduct(null);
    const vp: Record<string, string> = {};
    const vendorList = category === "양방" ? YANGBANG_VENDORS : HANBANG_VENDORS;
    vendorList.forEach((v) => { vp[v] = ""; });
    setFormData({ name: "", spec: "", supply_price: "", vendorPrices: vp });
    setModalOpen(true);
  }, [category]);

  // 모달 닫기
  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingProduct(null);
    setFormData({ name: "", spec: "", supply_price: "", vendorPrices: {} });
  }, []);

  // 저장 (생성 / 수정)
  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    const supplyPrice = formData.supply_price.trim() === "" ? null : parseInt(formData.supply_price.replace(/[,₩\s]/g, ""), 10);
    const vendorList = category === "양방" ? YANGBANG_VENDORS : HANBANG_VENDORS;

    if (modalMode === "create") {
      // 새 제품 생성
      const { data: newProduct, error } = await supabase
        .from("products")
        .insert({ name: formData.name.trim(), spec: formData.spec.trim(), category, supply_price: supplyPrice })
        .select("id, name, spec, category, supply_price")
        .single();

      if (error || !newProduct) {
        setSaving(false);
        // 23505 = (품목명, 규격) 유니크 제약
        toast.error(
          error?.code === "23505"
            ? `"${[formData.name.trim(), formData.spec.trim()].filter(Boolean).join(" ")}" 은 이미 등록돼 있어요.`
            : `등록하지 못했어요: ${error?.message ?? "알 수 없는 오류"}`
        );
        return;
      }

      // 벤더 단가 입력
      for (const vendorName of vendorList) {
        const { unknown, price } = parseVendorPriceInput(formData.vendorPrices[vendorName]);
        const vId = vendorIdMap[vendorName];
        if (!vId) continue;
        if (unknown || price !== null) {
          await supabase.from("vendor_products").insert({
            product_id: newProduct.id,
            vendor_id: vId,
            unit_price: unknown ? null : price,
          });
        }
      }

      // 로컬 상태에 추가
      const vendorMap: Record<string, number | null> = {};
      const unknownMap: Record<string, boolean> = {};
      vendorList.forEach((v) => {
        const { unknown, price } = parseVendorPriceInput(formData.vendorPrices[v]);
        vendorMap[v] = price;
        if (unknown) unknownMap[v] = true;
      });
      const prices = Object.values(vendorMap).filter((v): v is number => v !== null);
      const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
      const lowestVendor = lowestPrice !== null ? Object.entries(vendorMap).find(([, v]) => v === lowestPrice)?.[0] ?? null : null;
      let priceDiffPct: number | null = null;
      if (prices.length >= 2) { priceDiffPct = Math.round(((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100); }

      setProducts((prev) => [...prev, {
        id: newProduct.id, name: newProduct.name, spec: newProduct.spec, category: newProduct.category,
        supply_price: supplyPrice, vendors: vendorMap, vendorsUnknown: unknownMap, lowest_price: lowestPrice, lowest_vendor: lowestVendor, price_diff_pct: priceDiffPct,
      }]);

    } else if (editingProduct) {
      // 제품 정보 업데이트
      await supabase.from("products").update({
        name: formData.name.trim(),
        spec: formData.spec.trim(),
        supply_price: supplyPrice,
      }).eq("id", editingProduct.id);

      // 벤더 단가 업데이트
      for (const vendorName of vendorList) {
        const { unknown, price } = parseVendorPriceInput(formData.vendorPrices[vendorName]);
        const vId = vendorIdMap[vendorName];
        if (!vId) continue;

        const { data: existing } = await supabase
          .from("vendor_products").select("id").eq("product_id", editingProduct.id).eq("vendor_id", vId).maybeSingle();

        if (unknown || price !== null) {
          const value = unknown ? null : price;
          if (existing) {
            await supabase.from("vendor_products").update({ unit_price: value, last_updated: new Date().toISOString() }).eq("id", existing.id);
          } else {
            await supabase.from("vendor_products").insert({ product_id: editingProduct.id, vendor_id: vId, unit_price: value });
          }
        } else if (existing) {
          await supabase.from("vendor_products").delete().eq("id", existing.id);
        }
      }

      // 로컬 상태 업데이트
      const vendorMap: Record<string, number | null> = {};
      const unknownMap: Record<string, boolean> = {};
      vendorList.forEach((v) => {
        const { unknown, price } = parseVendorPriceInput(formData.vendorPrices[v]);
        vendorMap[v] = price;
        if (unknown) unknownMap[v] = true;
      });
      const prices = Object.values(vendorMap).filter((v): v is number => v !== null);
      const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
      const lowestVendor = lowestPrice !== null ? Object.entries(vendorMap).find(([, v]) => v === lowestPrice)?.[0] ?? null : null;
      let priceDiffPct: number | null = null;
      if (prices.length >= 2) { priceDiffPct = Math.round(((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100); }

      setProducts((prev) => prev.map((p) =>
        p.id === editingProduct.id
          ? { ...p, name: formData.name.trim(), spec: formData.spec.trim(), supply_price: supplyPrice, vendors: vendorMap, vendorsUnknown: unknownMap, lowest_price: lowestPrice, lowest_vendor: lowestVendor, price_diff_pct: priceDiffPct }
          : p
      ));
    }

    setSaving(false);
    toast.success(modalMode === "create" ? `${formData.name.trim()} 등록했어요.` : "저장했어요.");
    closeModal();
  }, [formData, modalMode, editingProduct, category, vendorIdMap, closeModal, toast]);

  // 삭제 확인
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setSaving(true);

    // 벤더 단가 삭제
    await supabase.from("vendor_products").delete().eq("product_id", deleteTarget.id);
    // 제품 삭제
    await supabase.from("products").delete().eq("id", deleteTarget.id);

    setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    setSaving(false);
    setDeleteConfirmOpen(false);
    toast.success(`${deleteTarget.name} 지웠어요.`);
    setDeleteTarget(null);
    closeModal();
  }, [deleteTarget, closeModal, toast]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Fetch products
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, spec, category, supply_price")
        .eq("category", category)
        .order("name");

      if (!productsData) {
        setLoading(false);
        return;
      }

      // Fetch vendor products with vendor info
      const { data: vpData } = await supabase
        .from("vendor_products")
        .select("product_id, unit_price, vendors(name)")
        .order("unit_price");

      const vendorPriceMap: Record<string, VendorPrice[]> = {};
      if (vpData) {
        for (const vp of vpData) {
          const vendorName = (vp.vendors as unknown as { name: string })?.name;
          if (!vendorName) continue;
          if (!vendorPriceMap[vp.product_id]) vendorPriceMap[vp.product_id] = [];
          vendorPriceMap[vp.product_id].push({
            vendor_name: vendorName,
            // null 을 0 으로 바꾸면 "최저가"로 잡혀 자동배정까지 오염된다. 그대로 둔다.
            unit_price: vp.unit_price,
          });
        }
      }

      // Fetch vendor shipping info
      const { data: vendorsData } = await supabase
        .from("vendors")
        .select("id, name, shipping_fee, free_shipping_min");

      if (vendorsData) {
        setVendorShippingInfo(vendorsData);
        const idMap: Record<string, string> = {};
        vendorsData.forEach((v: { id: string; name: string }) => {
          idMap[v.name] = v.id;
        });
        setVendorIdMap(idMap);
      }

      const vendorList = category === "양방" ? YANGBANG_VENDORS : HANBANG_VENDORS;
      const result: ProductWithPrices[] = productsData.map((p) => {
        const priceEntries = vendorPriceMap[p.id] || [];
        const vendorMap: Record<string, number | null> = {};
        const unknownMap: Record<string, boolean> = {};
        vendorList.forEach((v) => (vendorMap[v] = null));

        let lowestPrice: number | null = null;
        let lowestVendor: string | null = null;

        for (const entry of priceEntries) {
          if (!vendorList.includes(entry.vendor_name)) continue;
          // 단가 미확인은 최저가 경쟁에서 빼고 "/" 로만 표시한다.
          if (entry.unit_price === null) {
            unknownMap[entry.vendor_name] = true;
            continue;
          }
          vendorMap[entry.vendor_name] = entry.unit_price;
          if (lowestPrice === null || entry.unit_price < lowestPrice) {
            lowestPrice = entry.unit_price;
            lowestVendor = entry.vendor_name;
          }
        }

        // Calculate price difference percentage between lowest and highest
        const prices = Object.values(vendorMap).filter((v): v is number => v !== null);
        let priceDiffPct: number | null = null;
        if (prices.length >= 2) {
          const max = Math.max(...prices);
          const min = Math.min(...prices);
          priceDiffPct = Math.round(((max - min) / min) * 100);
        }

        return {
          id: p.id,
          name: p.name,
          spec: p.spec,
          category: p.category,
          supply_price: p.supply_price,
          vendors: vendorMap,
          vendorsUnknown: unknownMap,
          lowest_price: lowestPrice,
          lowest_vendor: lowestVendor,
          price_diff_pct: priceDiffPct,
        };
      });

      setProducts(result);
      setLoading(false);
    }

    fetchData();
  }, [category]);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.spec ?? "").toLowerCase().includes(q)
      );
    }

    if (showOnlyPriceDiff) {
      filtered = filtered.filter(
        (p) => p.price_diff_pct !== null && p.price_diff_pct > 10
      );
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortField === "name") {
        return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const aVal = a.price_diff_pct ?? -1;
      const bVal = b.price_diff_pct ?? -1;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [products, searchQuery, showOnlyPriceDiff, sortField, sortDir]);

  // Vendor summary stats
  const currentVendors = category === "양방" ? YANGBANG_VENDORS : HANBANG_VENDORS;

  const vendorStats = useMemo(() => {
    const stats: Record<string, { lowestCount: number; totalProducts: number }> = {};
    currentVendors.forEach((v) => (stats[v] = { lowestCount: 0, totalProducts: 0 }));

    for (const p of products) {
      for (const v of currentVendors) {
        if (p.vendors[v] !== null && p.vendors[v] !== undefined) {
          stats[v].totalProducts++;
          if (v === p.lowest_vendor) {
            stats[v].lowestCount++;
          }
        }
      }
    }
    return stats;
  }, [products, currentVendors]);

  const toggleSort = (field: "name" | "diff") => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "diff" ? "desc" : "asc");
    }
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price == null) return "-";
    return `₩${price.toLocaleString()}`;
  };

  const getShippingFee = (vendorName: string, subtotal: number): number => {
    const vendor = vendorShippingInfo.find((v) => v.name === vendorName);
    if (!vendor) return 0;
    if (vendor.free_shipping_min && subtotal >= vendor.free_shipping_min) return 0;
    return vendor.shipping_fee || 0;
  };

  const handleAddSimulationItem = () => {
    if (!selectedProductId) return;
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const existingIndex = simulatedItems.findIndex(
      (item) => item.productId === selectedProductId
    );

    if (existingIndex >= 0) {
      const updated = [...simulatedItems];
      updated[existingIndex].quantity += selectedQty;
      setSimulatedItems(updated);
    } else {
      setSimulatedItems([
        ...simulatedItems,
        {
          productId: selectedProductId,
          productName: `${product.name} (${product.spec})`,
          quantity: selectedQty,
          vendors: product.vendors,
        },
      ]);
    }

    setSelectedProductId("");
    setSelectedQty(1);
  };

  const handleRemoveSimulationItem = (productId: string) => {
    setSimulatedItems(simulatedItems.filter((item) => item.productId !== productId));
  };

  const calculateSimulationStrategies = useMemo(() => {
    if (simulatedItems.length === 0) return null;

    // Strategy 1: Best price per item from different vendors
    const bestPriceStrategy: Record<string, number> = {};

    for (const item of simulatedItems) {
      for (const vendor of currentVendors) {
        if (item.vendors[vendor] != null) {
          const itemTotal = (item.vendors[vendor] as number) * item.quantity;
          if (!bestPriceStrategy[vendor]) bestPriceStrategy[vendor] = 0;
          bestPriceStrategy[vendor] += itemTotal;
        }
      }
    }

    // Find which vendor has the cheapest price for each item
    const bestPriceBuyList: Record<string, number> = {};
    for (const item of simulatedItems) {
      let cheapestPrice: number | null = null;
      let cheapestVendor: string | null = null;

      for (const vendor of currentVendors) {
        if (item.vendors[vendor] != null) {
          if (cheapestPrice === null || item.vendors[vendor]! < cheapestPrice) {
            cheapestPrice = item.vendors[vendor] as number;
            cheapestVendor = vendor;
          }
        }
      }

      if (cheapestVendor && cheapestPrice !== null) {
        if (!bestPriceBuyList[cheapestVendor]) bestPriceBuyList[cheapestVendor] = 0;
        bestPriceBuyList[cheapestVendor] += cheapestPrice * item.quantity;
      }
    }

    const bestPriceResults: Record<string, { subtotal: number; shipping: number; total: number }> =
      {};
    for (const vendor of currentVendors) {
      const subtotal = bestPriceBuyList[vendor] || 0;
      const shipping = getShippingFee(vendor, subtotal);
      bestPriceResults[vendor] = {
        subtotal,
        shipping,
        total: subtotal + shipping,
      };
    }

    // Strategy 2: Buy all from one vendor
    const singleVendorResults: Record<string, { subtotal: number; shipping: number; total: number }> =
      {};

    for (const vendor of currentVendors) {
      let subtotal = 0;
      for (const item of simulatedItems) {
        if (item.vendors[vendor] != null) {
          subtotal += (item.vendors[vendor] as number) * item.quantity;
        }
      }
      const shipping = getShippingFee(vendor, subtotal);
      singleVendorResults[vendor] = {
        subtotal,
        shipping,
        total: subtotal + shipping,
      };
    }

    return {
      bestPriceResults,
      singleVendorResults,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulatedItems, category, vendorShippingInfo]);

  const cheapestStrategy = useMemo(() => {
    if (!calculateSimulationStrategies) return null;

    let cheapestTotal = Infinity;
    let cheapestType: "분산" | "몰아주기" | null = null;
    let cheapestVendor: string | null = null;

    for (const [vendor, result] of Object.entries(calculateSimulationStrategies.bestPriceResults)) {
      if (result.total < cheapestTotal) {
        cheapestTotal = result.total;
        cheapestType = "분산";
        cheapestVendor = vendor;
      }
    }

    for (const [vendor, result] of Object.entries(calculateSimulationStrategies.singleVendorResults)) {
      if (result.total < cheapestTotal) {
        cheapestTotal = result.total;
        cheapestType = "몰아주기";
        cheapestVendor = vendor;
      }
    }

    return { type: cheapestType, vendor: cheapestVendor, total: cheapestTotal };
  }, [calculateSimulationStrategies]);

  return (
    <>
      <TopBar title="단가 비교" subtitle="벤더별 품목 단가 비교 및 최저가 분석" />
      <div className="flex-1 p-4 md:p-6 space-y-4 md:space-y-6 overflow-auto">
        {/* 벤더 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
          {currentVendors.map((v) => {
            const stat = vendorStats[v] || { lowestCount: 0, totalProducts: 0 };
            return (
              <div
                key={v}
                className="bg-white rounded-xl border border-gray-200 p-3 md:p-4"
              >
                <p className="text-xs md:text-sm text-gray-500 truncate">{v}</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg md:text-xl font-bold text-gray-900">
                    {stat.lowestCount}
                  </span>
                  <span className="text-xs text-gray-400">
                    / {stat.totalProducts}
                  </span>
                </div>
                <p className="text-[10px] md:text-xs text-gray-400 mt-0.5">최저가 품목</p>
              </div>
            );
          })}
        </div>

        {/* 필터 영역 */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => setCategory("양방")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  category === "양방"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                양방
              </button>
              <button
                onClick={() => setCategory("한방")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  category === "한방"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                한방
              </button>
            </div>
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm w-full sm:w-72 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="품목명 또는 규격 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowOnlyPriceDiff(!showOnlyPriceDiff)}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto ${
                showOnlyPriceDiff
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>10%+ 가격차이만</span>
            </button>
          </div>
        </div>

        {/* 단가 비교 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm md:text-base font-bold text-gray-900">
                {category} 품목 단가 비교
              </h3>
              <span className="text-xs text-gray-400">
                ({filteredProducts.length}개 품목)
              </span>
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              신규 품목
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
            {/* 폰: 거래처가 12곳까지 늘어나는 표는 옆으로 못 본다. 품목 카드 + 싼 순서 목록으로 편다 */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">조건에 맞는 품목이 없습니다.</div>
              ) : (
                filteredProducts.map((p) => {
                  const prices = Object.values(p.vendors).filter((v): v is number => v !== null);
                  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
                  const listed = currentVendors
                    .map((v) => ({
                      vendor: v,
                      price: p.vendors[v] ?? null,
                      unknown: p.vendors[v] == null && p.vendorsUnknown?.[v] === true,
                    }))
                    .filter((x) => x.price !== null || x.unknown)
                    .sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));
                  return (
                    <button
                      key={p.id}
                      onClick={() => openEditModal(p)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50/30 active:bg-blue-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-sm break-words">{p.name}</div>
                          {p.spec && <div className="text-xs text-gray-500 mt-0.5">{p.spec}</div>}
                        </div>
                        {p.price_diff_pct !== null && (
                          <span
                            className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.price_diff_pct > 30
                                ? "bg-red-100 text-red-700"
                                : p.price_diff_pct > 10
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            차이 {p.price_diff_pct}%
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        납품가 <span className="font-medium text-gray-800">{formatPrice(p.supply_price)}</span>
                      </div>
                      {listed.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {listed.map((x) => {
                            const isLowest = x.price !== null && x.price === minPrice;
                            return (
                              <li
                                key={x.vendor}
                                className={`flex items-center justify-between gap-3 text-xs px-2 py-1 rounded ${
                                  isLowest ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-gray-600"
                                }`}
                              >
                                <span className="truncate">{x.vendor}</span>
                                <span className={`flex-shrink-0 ${x.unknown ? "text-amber-600" : ""}`}>
                                  {x.price !== null ? formatPrice(x.price) : UNKNOWN_MARK}
                                  {isLowest && <span className="ml-0.5">✓</span>}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs md:text-sm min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                    <th
                      className="text-left px-3 md:px-4 py-2.5 md:py-3 font-medium cursor-pointer hover:text-gray-700 sticky left-0 bg-gray-50 z-10"
                      onClick={() => toggleSort("name")}
                    >
                      <span className="flex items-center gap-1">
                        품목명 <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="text-left px-2 md:px-3 py-2.5 md:py-3 font-medium">
                      규격
                    </th>
                    <th className="text-right px-2 md:px-3 py-2.5 md:py-3 font-medium">
                      납품가
                    </th>
                    {currentVendors.map((v) => (
                      <th
                        key={v}
                        className="text-right px-2 md:px-3 py-2.5 md:py-3 font-medium whitespace-nowrap"
                      >
                        {v}
                      </th>
                    ))}
                    <th
                      className="text-right px-2 md:px-3 py-2.5 md:py-3 font-medium cursor-pointer hover:text-gray-700"
                      onClick={() => toggleSort("diff")}
                    >
                      <span className="flex items-center justify-end gap-1">
                        차이 <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredProducts.map((p) => {
                    const prices = Object.values(p.vendors).filter(
                      (v): v is number => v !== null
                    );
                    const minPrice = prices.length > 0 ? Math.min(...prices) : null;

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                        onClick={() => openEditModal(p)}
                      >
                        <td className="px-3 md:px-4 py-2 md:py-2.5 font-medium text-gray-900 sticky left-0 bg-white z-10 max-w-[200px] md:max-w-[280px] truncate group-hover:bg-blue-50/30">
                          <span className="flex items-center gap-1.5">
                            {p.name}
                            <Pencil className="w-3 h-3 text-gray-300 flex-shrink-0" />
                          </span>
                        </td>
                        <td className="px-2 md:px-3 py-2 md:py-2.5 text-gray-500 whitespace-nowrap">
                          {p.spec}
                        </td>
                        <td className="px-2 md:px-3 py-2 md:py-2.5 text-right text-gray-700 font-medium whitespace-nowrap">
                          {formatPrice(p.supply_price)}
                        </td>
                        {currentVendors.map((v) => {
                          const price = p.vendors[v] ?? null;
                          const unknown = price === null && p.vendorsUnknown?.[v] === true;
                          const isLowest = price !== null && price === minPrice;
                          return (
                            <td
                              key={v}
                              title={unknown ? "취급하지만 단가 미확인" : undefined}
                              className={`px-2 md:px-3 py-2 md:py-2.5 text-right whitespace-nowrap ${
                                isLowest
                                  ? "text-emerald-700 font-bold bg-emerald-50/50"
                                  : unknown
                                  ? "text-amber-600 font-medium"
                                  : price === null
                                  ? "text-gray-300"
                                  : "text-gray-600"
                              }`}
                            >
                              {price !== null ? (
                                <span>
                                  {formatPrice(price)}
                                  {isLowest && <span className="text-[10px] ml-0.5">✓</span>}
                                </span>
                              ) : unknown ? (
                                UNKNOWN_MARK
                              ) : (
                                "-"
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 md:px-3 py-2 md:py-2.5 text-right whitespace-nowrap">
                          {p.price_diff_pct !== null ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                p.price_diff_pct > 30
                                  ? "bg-red-100 text-red-700"
                                  : p.price_diff_pct > 10
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {p.price_diff_pct}%
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* 배송비 시뮬레이션 섹션 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-100">
            <h3 className="text-sm md:text-base font-bold text-gray-900">배송비 시뮬레이션</h3>
            <p className="text-xs text-gray-500 mt-1">품목과 수량을 선택하여 최적 주문 전략을 비교하세요</p>
          </div>

          <div className="p-4 md:p-6 space-y-4">
            {/* 상품 선택 영역 */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">품목을 선택하세요</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.spec})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={selectedQty}
                  onChange={(e) => setSelectedQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="수량"
                />
                <button
                  onClick={handleAddSimulationItem}
                  disabled={!selectedProductId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  추가
                </button>
              </div>
            </div>

            {/* 선택된 상품 목록 */}
            {simulatedItems.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-700">선택된 품목</p>
                <div className="space-y-2">
                  {simulatedItems.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200"
                    >
                      <div className="flex-1">
                        <p className="text-xs md:text-sm text-gray-900 font-medium">
                          {item.productName}
                        </p>
                        <p className="text-xs text-gray-500">수량: {item.quantity}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveSimulationItem(item.productId)}
                        className="p-1 hover:bg-red-50 rounded transition-colors"
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 비교 전략 테이블 */}
            {simulatedItems.length > 0 && calculateSimulationStrategies && (
              <div className="overflow-x-auto">
                <div className="space-y-4">
                  {/* 전략 1: 벤더별 최저가 분산 주문 */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-blue-50 px-3 md:px-4 py-2 border-b border-gray-200">
                      <p className="text-xs md:text-sm font-bold text-gray-900">
                        전략 1: 벤더별 최저가 분산 주문
                      </p>
                      <p className="text-[10px] md:text-xs text-gray-600 mt-0.5">
                        각 품목을 가장 저렴한 벤더에서 구매
                      </p>
                    </div>
                    <div className="overflow-x-auto min-w-full">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-3 py-2 font-medium text-gray-700">
                              벤더명
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-gray-700">
                              소계
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-gray-700">
                              배송비
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-gray-700">
                              합계
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {currentVendors.map((vendor) => {
                            const result = calculateSimulationStrategies.bestPriceResults[vendor];
                            const isCheapest =
                              cheapestStrategy?.type === "분산" && cheapestStrategy?.vendor === vendor;
                            return (
                              <tr
                                key={vendor}
                                className={`${
                                  isCheapest ? "bg-green-50" : "hover:bg-gray-50/50"
                                } transition-colors`}
                              >
                                <td className="px-3 py-2 font-medium text-gray-900">
                                  {vendor}
                                  {isCheapest && (
                                    <span className="ml-2 inline-block px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                                      최저가
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-medium">
                                  {formatPrice(result.subtotal)}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600">
                                  {formatPrice(result.shipping)}
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-gray-900">
                                  {formatPrice(result.total)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 전략 2: 벤더 단일 몰아주기 */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-orange-50 px-3 md:px-4 py-2 border-b border-gray-200">
                      <p className="text-xs md:text-sm font-bold text-gray-900">
                        전략 2: 벤더 단일 몰아주기
                      </p>
                      <p className="text-[10px] md:text-xs text-gray-600 mt-0.5">
                        모든 품목을 한 벤더에서만 구매
                      </p>
                    </div>
                    <div className="overflow-x-auto min-w-full">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-3 py-2 font-medium text-gray-700">
                              벤더명
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-gray-700">
                              소계
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-gray-700">
                              배송비
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-gray-700">
                              합계
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {currentVendors.map((vendor) => {
                            const result = calculateSimulationStrategies.singleVendorResults[vendor];
                            const isCheapest =
                              cheapestStrategy?.type === "몰아주기" &&
                              cheapestStrategy?.vendor === vendor;
                            return (
                              <tr
                                key={vendor}
                                className={`${
                                  isCheapest ? "bg-green-50" : "hover:bg-gray-50/50"
                                } transition-colors`}
                              >
                                <td className="px-3 py-2 font-medium text-gray-900">
                                  {vendor}
                                  {isCheapest && (
                                    <span className="ml-2 inline-block px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                                      최저가
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-medium">
                                  {formatPrice(result.subtotal)}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600">
                                  {formatPrice(result.shipping)}
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-gray-900">
                                  {formatPrice(result.total)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 최적 전략 요약 */}
                  {cheapestStrategy && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 md:p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-xs md:text-sm font-bold text-emerald-900">
                            추천 전략: {cheapestStrategy.type === "분산" ? "벤더별 최저가 분산" : "벤더 단일 몰아주기"}
                            ({cheapestStrategy.vendor})
                          </p>
                          <p className="text-xs md:text-sm text-emerald-700 mt-1">
                            총액: <span className="font-bold">{formatPrice(cheapestStrategy.total)}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {simulatedItems.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">위에서 품목을 선택하여 시뮬레이션을 시작하세요</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 품목 편집/추가 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeModal}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900">
                {modalMode === "create" ? "신규 품목 추가" : "품목 정보 수정"}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 기본 정보 */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">기본 정보</p>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">품목명 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="예: 알콜솜"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">규격</label>
                  <input
                    type="text"
                    value={formData.spec}
                    onChange={(e) => setFormData({ ...formData, spec: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="예: 100매/팩"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">납품가 (원)</label>
                  <input
                    type="text"
                    value={formData.supply_price}
                    onChange={(e) => setFormData({ ...formData, supply_price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="병원에 납품하는 가격"
                  />
                </div>
                <MarginHint
                  supplyPriceRaw={formData.supply_price}
                  vendorPrices={formData.vendorPrices}
                />
              </div>

              {/* 벤더별 단가 */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">벤더별 매입 단가</p>
                <p className="text-[11px] text-gray-400">
                  단가를 아직 모르면 <span className="font-medium text-amber-600">{UNKNOWN_MARK}</span> 를 넣으세요. 비워두면 그 거래처는 취급 안 하는 것으로 저장됩니다.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {(category === "양방" ? YANGBANG_VENDORS : HANBANG_VENDORS).map((v) => (
                    <div key={v} className="flex items-center gap-3">
                      <label className="text-sm text-gray-700 w-28 flex-shrink-0 truncate">{v}</label>
                      <input
                        type="text"
                        value={formData.vendorPrices[v] || ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          vendorPrices: { ...formData.vendorPrices, [v]: e.target.value },
                        })}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="-"
                      />
                      <span className="text-xs text-gray-400 w-4">원</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <div>
                {modalMode === "edit" && editingProduct && (
                  <button
                    onClick={() => {
                      setDeleteTarget(editingProduct);
                      setDeleteConfirmOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    삭제
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formData.name.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 다이얼로그 */}
      {deleteConfirmOpen && deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirmOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">품목 삭제</h3>
                <p className="text-xs text-gray-500 mt-0.5">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-1">
              <strong>{deleteTarget.name}</strong> ({deleteTarget.spec})
            </p>
            <p className="text-xs text-gray-500 mb-5">
              이 품목과 연결된 모든 벤더 단가 정보도 함께 삭제됩니다.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-300 transition-colors"
              >
                {saving ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
