"use client";

import { useState, useEffect } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Send, Clock, CheckCircle, AlertCircle, Plus, ChevronDown, ChevronUp, X } from "lucide-react";

// ===== TypeScript Interfaces =====
interface Vendor {
  id: string;
  name: string;
  category: string;
  shipping_fee: number;
  free_shipping_min: number;
}

interface Product {
  id: string;
  name: string;
  spec: string;
  category: string;
  supply_price: number;
}

interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  product?: Product;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  order_id: string | null;
  po_date: string;
  status: string;
  total_amount: number;
  shipping_cost: number;
  created_at: string;
  vendor?: Vendor;
  items?: PurchaseOrderItem[];
}

interface Order {
  id: string;
  order_number: string;
}

interface SummaryCardItem {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  isCurrency?: boolean;
}

// ===== Main Component =====
export default function PurchasePage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("전체");
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [summaryStats, setSummaryStats] = useState({
    waiting: 0,
    inProgress: 0,
    completed: 0,
    thisMonth: 0,
  });

  // Fetch data on mount
  useEffect(() => {
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate summary stats whenever purchaseOrders changes
  useEffect(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let waiting = 0;
    let inProgress = 0;
    let completed = 0;
    let thisMonth = 0;

    purchaseOrders.forEach((po) => {
      if (po.status === "대기") waiting++;
      else if (po.status === "진행중") inProgress++;
      else if (po.status === "완료") completed++;

      const poDate = new Date(po.po_date);
      if (poDate.getMonth() === currentMonth && poDate.getFullYear() === currentYear) {
        thisMonth += po.total_amount + po.shipping_cost;
      }
    });

    setSummaryStats({ waiting, inProgress, completed, thisMonth });
  }, [purchaseOrders]);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      // Fetch vendors
      const { data: vendorsData, error: vendorsError } = await supabase
        .from("vendors")
        .select("*");
      if (vendorsError) throw vendorsError;
      setVendors(vendorsData || []);

      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name, spec, category, supply_price");
      if (productsError) throw productsError;
      setProducts(productsData || []);

      // Fetch orders
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("id, order_number")
        .limit(200);
      if (ordersError) throw ordersError;
      setOrders(ordersData || []);

      // Fetch purchase orders with vendor info
      const { data: posData, error: posError } = await supabase
        .from("purchase_orders")
        .select(
          `
          id,
          po_number,
          vendor_id,
          order_id,
          po_date,
          status,
          total_amount,
          shipping_cost,
          created_at,
          vendors(id, name, category, shipping_fee, free_shipping_min)
        `
        )
        .order("po_date", { ascending: false });

      if (posError) throw posError;

      // Fetch items for each PO
      const posWithItems: PurchaseOrder[] = [];
      for (const po of posData || []) {
        const { data: itemsData, error: itemsError } = await supabase
          .from("purchase_order_items")
          .select(
            `
            id,
            purchase_order_id,
            product_id,
            quantity,
            unit_price,
            total_price,
            created_at,
            products(id, name, spec, category, supply_price)
          `
          )
          .eq("purchase_order_id", po.id);

        if (itemsError) throw itemsError;

        posWithItems.push({
          ...po,
          vendor: (po.vendors as unknown as Vendor),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: (itemsData || []).map((item: any) => ({
            ...item,
            product: item.products as unknown as Product,
          })),
        });
      }

      setPurchaseOrders(posWithItems);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error fetching data:", error);
      alert("데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (poId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status: newStatus })
        .eq("id", poId);

      if (error) throw error;

      setPurchaseOrders((prev) =>
        prev.map((po) => (po.id === poId ? { ...po, status: newStatus } : po))
      );
    } catch (error) {
      console.error("Error updating status:", error);
      alert("상태 변경에 실패했습니다.");
    }
  };

  const getFilteredPOs = () => {
    if (statusFilter === "전체") return purchaseOrders;
    return purchaseOrders.filter((po) => po.status === statusFilter);
  };

  const statusOptions = ["대기", "진행중", "완료"];

  const filterTabs = ["전체", "대기", "진행중", "완료"];

  if (loading) {
    return (
      <>
        <TopBar title="발주 관리" subtitle="벤더별 발주 현황 및 자동 발주" />
        <div className="flex-1 p-4 md:p-6 flex items-center justify-center">
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="발주 관리" subtitle="벤더별 발주 현황 및 자동 발주" />
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
          {[
            {
              label: "대기 발주",
              count: summaryStats.waiting,
              icon: Clock,
              color: "text-yellow-600",
              bg: "bg-yellow-50",
            },
            {
              label: "진행중",
              count: summaryStats.inProgress,
              icon: Send,
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              label: "완료",
              count: summaryStats.completed,
              icon: CheckCircle,
              color: "text-green-600",
              bg: "bg-green-50",
            },
            {
              label: "이번 달 발주액",
              count: summaryStats.thisMonth,
              icon: AlertCircle,
              color: "text-purple-600",
              bg: "bg-purple-50",
              isCurrency: true,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`${item.bg} rounded-xl p-4 md:p-5 border border-gray-100`}>
                <div className="flex items-center gap-3">
                  <Icon className={`w-6 h-6 md:w-8 md:h-8 ${item.color} flex-shrink-0`} />
                  <div>
                    <p className="text-xs md:text-sm text-gray-500">{item.label}</p>
                    <p className="text-lg md:text-xl font-bold text-gray-900">
                      {(item as SummaryCardItem).isCurrency
                        ? `${item.count.toLocaleString()}원`
                        : item.count}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Create Button */}
        <div className="mb-4 md:mb-6 flex justify-end">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            <span>발주 생성</span>
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 md:mb-6 overflow-x-auto pb-2">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition ${
                statusFilter === tab
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Purchase Orders Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {getFilteredPOs().length === 0 ? (
            <div className="p-8 md:p-12 text-center">
              <Send className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-base md:text-lg font-bold text-gray-900 mb-2">
                발주 데이터 없음
              </h3>
              <p className="text-xs md:text-sm text-gray-500">
                새로운 발주를 생성해주세요.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700"></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                      발주번호
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                      벤더
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                      발주일
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                      상태
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                      발주액
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                      배송료
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                      합계
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredPOs().map((po) => (
                    <div key={po.id}>
                      <tr className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              setExpandedPO(expandedPO === po.id ? null : po.id)
                            }
                            className="text-gray-600 hover:text-gray-900"
                          >
                            {expandedPO === po.id ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {po.po_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {po.vendor?.name || "미정"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {new Date(po.po_date).toLocaleDateString("ko-KR")}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={po.status}
                            onChange={(e) => handleStatusChange(po.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs font-medium"
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">
                          {po.total_amount.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">
                          {po.shipping_cost.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 font-bold">
                          {(po.total_amount + po.shipping_cost).toLocaleString()}원
                        </td>
                      </tr>

                      {/* Expandable Items Row */}
                      {expandedPO === po.id && (
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="bg-white rounded border border-gray-200 p-4">
                              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                                발주 항목
                              </h4>
                              {po.items && po.items.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-200">
                                        <th className="text-left py-2 px-2 text-xs font-semibold text-gray-700">
                                          상품명
                                        </th>
                                        <th className="text-right py-2 px-2 text-xs font-semibold text-gray-700">
                                          수량
                                        </th>
                                        <th className="text-right py-2 px-2 text-xs font-semibold text-gray-700">
                                          단가
                                        </th>
                                        <th className="text-right py-2 px-2 text-xs font-semibold text-gray-700">
                                          소계
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {po.items.map((item) => (
                                        <tr
                                          key={item.id}
                                          className="border-b border-gray-100 hover:bg-gray-50"
                                        >
                                          <td className="py-2 px-2 text-gray-900">
                                            {item.product?.name || "알 수 없음"}
                                          </td>
                                          <td className="py-2 px-2 text-right text-gray-700">
                                            {item.quantity}
                                          </td>
                                          <td className="py-2 px-2 text-right text-gray-700">
                                            {item.unit_price.toLocaleString()}원
                                          </td>
                                          <td className="py-2 px-2 text-right font-medium text-gray-900">
                                            {item.total_price.toLocaleString()}원
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500">항목이 없습니다.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </div>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePurchaseOrderModal
          vendors={vendors}
          products={products}
          orders={orders}
          onClose={() => {
            setShowCreateModal(false);
            fetchAllData();
          }}
        />
      )}
    </>
  );
}

// ===== Create Modal Component =====
interface CreatePurchaseOrderModalProps {
  vendors: Vendor[];
  products: Product[];
  orders: Order[];
  onClose: () => void;
}

interface PriceTierCache {
  [key: string]: Array<{ min_qty: number; unit_price: number; note: string | null }>;
}

interface PurchaseItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  tierApplied: boolean; // 구간 단가 적용 여부
}

function CreatePurchaseOrderModal({
  vendors,
  products,
  orders,
  onClose,
}: CreatePurchaseOrderModalProps) {
  const [mode, setMode] = useState<"from_order" | "manual">("manual");
  const [selectedOrder, setSelectedOrder] = useState<string>("");
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [tierCache, setTierCache] = useState<PriceTierCache>({});

  const selectedVendorData = vendors.find((v) => v.id === selectedVendor);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const shippingCost =
    subtotal >= (selectedVendorData?.free_shipping_min || 999999)
      ? 0
      : selectedVendorData?.shipping_fee || 0;
  const total = subtotal + shippingCost;

  // 구간별 단가 조회 (product_id + vendor_id 조합)
  async function fetchTiers(productId: string, vendorId: string): Promise<Array<{ min_qty: number; unit_price: number; note: string | null }>> {
    const cacheKey = `${productId}_${vendorId}`;
    if (tierCache[cacheKey] !== undefined) return tierCache[cacheKey];

    const { data } = await supabase
      .from("price_tiers")
      .select("min_qty, unit_price, note")
      .eq("product_id", productId)
      .eq("vendor_id", vendorId)
      .order("min_qty", { ascending: true });

    const tiers = data || [];
    setTierCache((prev) => ({ ...prev, [cacheKey]: tiers }));
    return tiers;
  }

  // 수량에 맞는 구간 단가 찾기 (가장 큰 min_qty 이하인 구간)
  function findTierPrice(tiers: Array<{ min_qty: number; unit_price: number }>, qty: number): number | null {
    let matched: number | null = null;
    for (const tier of tiers) {
      if (qty >= tier.min_qty) {
        matched = tier.unit_price;
      }
    }
    return matched;
  }

  // 벤더 변경 시 모든 아이템의 단가 재계산
  async function handleVendorChange(vendorId: string) {
    setSelectedVendor(vendorId);
    if (!vendorId) return;

    const newItems = [...items];
    for (let i = 0; i < newItems.length; i++) {
      if (newItems[i].productId) {
        const tiers = await fetchTiers(newItems[i].productId, vendorId);
        const tierPrice = findTierPrice(tiers, newItems[i].quantity);
        if (tierPrice !== null) {
          newItems[i] = { ...newItems[i], unitPrice: tierPrice, tierApplied: true };
        } else {
          const product = products.find((p) => p.id === newItems[i].productId);
          newItems[i] = { ...newItems[i], unitPrice: product?.supply_price || 0, tierApplied: false };
        }
      }
    }
    setItems(newItems);
  }

  const handleAddItem = () => {
    setItems([...items, { productId: "", quantity: 1, unitPrice: 0, tierApplied: false }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = async (
    index: number,
    field: string,
    value: string | number
  ) => {
    const newItems = [...items];

    if (field === "productId") {
      const product = products.find((p) => p.id === String(value));
      let unitPrice = product?.supply_price || 0;
      let tierApplied = false;

      // 벤더가 이미 선택된 상태면 구간 단가 확인
      if (selectedVendor && value) {
        const tiers = await fetchTiers(String(value), selectedVendor);
        const tierPrice = findTierPrice(tiers, newItems[index].quantity || 1);
        if (tierPrice !== null) {
          unitPrice = tierPrice;
          tierApplied = true;
        }
      }

      newItems[index] = {
        ...newItems[index],
        productId: String(value),
        unitPrice,
        tierApplied,
      };
    } else if (field === "quantity") {
      newItems[index] = { ...newItems[index], quantity: value as number };

      // 수량 변경 시 구간 단가 재확인
      if (selectedVendor && newItems[index].productId) {
        const tiers = await fetchTiers(newItems[index].productId, selectedVendor);
        const tierPrice = findTierPrice(tiers, value as number);
        if (tierPrice !== null) {
          newItems[index].unitPrice = tierPrice;
          newItems[index].tierApplied = true;
        } else {
          const product = products.find((p) => p.id === newItems[index].productId);
          newItems[index].unitPrice = product?.supply_price || 0;
          newItems[index].tierApplied = false;
        }
      }
    } else if (field === "unitPrice") {
      newItems[index] = { ...newItems[index], unitPrice: value as number, tierApplied: false };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const handleCreate = async () => {
    if (!selectedVendor || items.length === 0) {
      alert("벤더와 항목을 선택해주세요.");
      return;
    }

    try {
      setCreating(true);

      // Generate PO number
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const poNumber = `PO-${dateStr}-${Date.now().toString().slice(-4)}`;

      // Create PO
      const { data: poData, error: poError } = await supabase
        .from("purchase_orders")
        .insert([
          {
            po_number: poNumber,
            vendor_id: selectedVendor,
            order_id: mode === "from_order" ? selectedOrder : null,
            po_date: new Date().toISOString().split("T")[0],
            status: "대기",
            total_amount: subtotal,
            shipping_cost: shippingCost,
          },
        ])
        .select();

      if (poError) throw poError;
      const poId = poData[0].id;

      // Create items
      const itemsToInsert = items.map((item) => ({
        purchase_order_id: poId,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.quantity * item.unitPrice,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      alert("발주가 생성되었습니다.");
      onClose();
    } catch (error) {
      console.error("Error creating purchase order:", error);
      alert("발주 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">발주 생성</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              발주 생성 방식
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="manual"
                  checked={mode === "manual"}
                  onChange={(e) => setMode(e.target.value as "manual" | "from_order")}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">수동 발주</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="from_order"
                  checked={mode === "from_order"}
                  onChange={(e) => setMode(e.target.value as "manual" | "from_order")}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">주문으로부터 생성</span>
              </label>
            </div>
          </div>

          {/* Order Selection (if from_order) */}
          {mode === "from_order" && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                주문 선택
              </label>
              <select
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">주문을 선택하세요</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Vendor Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              벤더 선택
            </label>
            <select
              value={selectedVendor}
              onChange={(e) => handleVendorChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">벤더를 선택하세요</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>

          {/* Items */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-semibold text-gray-900">
                발주 항목
              </label>
              <button
                onClick={handleAddItem}
                className="text-xs px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition"
              >
                + 항목 추가
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <select
                    value={item.productId}
                    onChange={(e) => handleItemChange(index, "productId", e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">상품 선택</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.spec})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(index, "quantity", parseInt(e.target.value) || 1)
                    }
                    placeholder="수량"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />

                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) =>
                      handleItemChange(index, "unitPrice", parseInt(e.target.value) || 0)
                    }
                    placeholder="단가"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />

                  <div className="w-28 text-right">
                    <span className="text-sm font-medium text-gray-900">
                      {(item.quantity * item.unitPrice).toLocaleString()}원
                    </span>
                    {item.tierApplied && (
                      <p className="text-[10px] text-emerald-600 font-medium">구간할인</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleRemoveItem(index)}
                    className="text-red-600 hover:text-red-900 p-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          {items.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">소계:</span>
                <span className="font-medium text-gray-900">{subtotal.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">배송료:</span>
                <span className="font-medium text-gray-900">{shippingCost.toLocaleString()}원</span>
              </div>
              {shippingCost === 0 && selectedVendorData && (
                <p className="text-xs text-green-600">
                  (무료배송: {selectedVendorData.free_shipping_min?.toLocaleString()}원 이상)
                </p>
              )}
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="font-semibold text-gray-900">합계:</span>
                <span className="text-lg font-bold text-blue-600">{total.toLocaleString()}원</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            취소
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !selectedVendor || items.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {creating ? "생성 중..." : "발주 생성"}
          </button>
        </div>
      </div>
    </div>
  );
}
