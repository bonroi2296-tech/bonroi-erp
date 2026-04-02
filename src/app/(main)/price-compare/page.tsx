"use client";

import { useEffect, useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Search, ArrowUpDown, TrendingDown, AlertTriangle, X, Plus } from "lucide-react";

interface VendorPrice {
  vendor_name: string;
  unit_price: number;
}

interface ProductWithPrices {
  id: string;
  name: string;
  spec: string;
  category: string;
  supply_price: number | null;
  vendors: Record<string, number | null>;
  lowest_price: number | null;
  lowest_vendor: string | null;
  price_diff_pct: number | null;
}

interface VendorShippingInfo {
  id: string;
  name: string;
  shipping_fee: number;
  free_shipping_min: number | null;
}

interface SimulatedItem {
  productId: string;
  productName: string;
  quantity: number;
  vendors: Record<string, number | null>;
}

const YANGBANG_VENDORS = ["SD바이오", "주사기닷컴", "디에이치몰", "메디오션", "한백상사"];
const HANBANG_VENDORS = ["수진메디칼", "안진도매로", "한의나라", "허브원", "케이엠몰"];

export default function PriceComparePage() {
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
      }

      const vendorList = category === "양방" ? YANGBANG_VENDORS : HANBANG_VENDORS;
      const result: ProductWithPrices[] = productsData.map((p) => {
        const priceEntries = vendorPriceMap[p.id] || [];
        const vendorMap: Record<string, number | null> = {};
        vendorList.forEach((v) => (vendorMap[v] = null));

        let lowestPrice: number | null = null;
        let lowestVendor: string | null = null;

        for (const entry of priceEntries) {
          if (vendorList.includes(entry.vendor_name)) {
            vendorMap[entry.vendor_name] = entry.unit_price;
            if (lowestPrice === null || entry.unit_price < lowestPrice) {
              lowestPrice = entry.unit_price;
              lowestVendor = entry.vendor_name;
            }
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
        (p) => p.name.toLowerCase().includes(q) || p.spec.toLowerCase().includes(q)
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
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                        className="hover:bg-blue-50/30 transition-colors"
                      >
                        <td className="px-3 md:px-4 py-2 md:py-2.5 font-medium text-gray-900 sticky left-0 bg-white z-10 max-w-[200px] md:max-w-[280px] truncate">
                          {p.name}
                        </td>
                        <td className="px-2 md:px-3 py-2 md:py-2.5 text-gray-500 whitespace-nowrap">
                          {p.spec}
                        </td>
                        <td className="px-2 md:px-3 py-2 md:py-2.5 text-right text-gray-700 font-medium whitespace-nowrap">
                          {formatPrice(p.supply_price)}
                        </td>
                        {currentVendors.map((v) => {
                          const price = p.vendors[v] ?? null;
                          const isLowest = price !== null && price === minPrice;
                          return (
                            <td
                              key={v}
                              className={`px-2 md:px-3 py-2 md:py-2.5 text-right whitespace-nowrap ${
                                isLowest
                                  ? "text-emerald-700 font-bold bg-emerald-50/50"
                                  : price === null
                                  ? "text-gray-300"
                                  : "text-gray-600"
                              }`}
                            >
                              {price !== null ? (
                                <>
                                  {formatPrice(price)}
                                  {isLowest && (
                                    <span className="ml-1 text-[10px]">✓</span>
                                  )}
                                </>
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
    </>
  );
}
