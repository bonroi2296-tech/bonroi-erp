"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { Plus, Search, ChevronDown, ChevronRight, X, Trash2, ChevronUp } from "lucide-react";

interface OrderRow {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  category: string;
  vendor_name: string;
  total_purchase_amount: number;
  total_supply_amount: number;
  total_margin: number;
  branch_id: string;
  branch: { name: string; short_name: string };
  note: string | null;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product: { name: string; spec: string };
  quantity: number;
  purchase_price: number;
  supply_price: number;
  total_purchase: number;
  total_supply: number;
  margin: number;
}

interface GroupedOrder {
  key: string;
  order_date: string;
  branch_name: string;
  branch_short: string;
  branch_id: string;
  vendor_orders: OrderRow[];
  total_purchase: number;
  total_supply: number;
  total_margin: number;
  vendor_count: number;
  item_count: number;
}

interface Branch {
  id: string;
  name: string;
  short_name: string;
}

interface Product {
  id: string;
  name: string;
  spec: string;
  category: string;
  supply_price: number | null;
}

interface Vendor {
  id: string;
  name: string;
  category: string;
}

interface VendorPrice {
  vendor_id: string;
  vendor_name: string;
  unit_price: number;
}

interface NewOrderItem {
  product_id: string;
  product_name: string;
  vendor_id: string;
  vendor_name: string;
  quantity: number;
  purchase_price: number;
  supply_price: number;
}

const statusColors: Record<string, string> = {
  완료: "bg-green-100 text-green-700",
  처리중: "bg-blue-100 text-blue-700",
  대기: "bg-yellow-100 text-yellow-700",
  발주완료: "bg-indigo-100 text-indigo-700",
  확인필요: "bg-red-100 text-red-700",
};

const statusOptions = ["대기", "처리중", "발주완료", "완료", "확인필요"];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  // 주문 상세 품목 보기
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({});
  const [loadingOrderItems, setLoadingOrderItems] = useState<Set<string>>(new Set());

  // 새 주문 모달
  const [showModal, setShowModal] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [newBranchId, setNewBranchId] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newStatus, setNewStatus] = useState("대기");
  const [newNote, setNewNote] = useState("");
  const [newItems, setNewItems] = useState<NewOrderItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 품목 추가 폼
  const [addProductId, setAddProductId] = useState("");
  const [addVendorId, setAddVendorId] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [addPurchasePrice, setAddPurchasePrice] = useState(0);
  const [addSupplyPrice, setAddSupplyPrice] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [vendorPrices, setVendorPrices] = useState<VendorPrice[]>([]);

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select(
        "id, order_number, order_date, status, category, vendor_name, total_purchase_amount, total_supply_amount, total_margin, branch_id, note, branch:branches(name, short_name)"
      )
      .order("order_date", { ascending: false });
    setOrders((data as unknown as OrderRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // 날짜+지점별 그룹핑
  const groupedOrders = useMemo(() => {
    const filtered = orders.filter((o) => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      const branchName = (o.branch as unknown as { name: string })?.name || "";
      return (
        o.order_number.toLowerCase().includes(s) ||
        branchName.toLowerCase().includes(s) ||
        (o.vendor_name || "").toLowerCase().includes(s)
      );
    });

    const map = new Map<string, GroupedOrder>();
    for (const o of filtered) {
      const br = o.branch as unknown as { name: string; short_name: string };
      const key = `${o.order_date}_${o.branch_id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          order_date: o.order_date,
          branch_name: br?.name || "-",
          branch_short: br?.short_name || "-",
          branch_id: o.branch_id,
          vendor_orders: [],
          total_purchase: 0,
          total_supply: 0,
          total_margin: 0,
          vendor_count: 0,
          item_count: 0,
        });
      }
      const g = map.get(key)!;
      g.vendor_orders.push(o);
      g.total_purchase += o.total_purchase_amount || 0;
      g.total_supply += o.total_supply_amount || 0;
      g.total_margin += o.total_margin || 0;
      g.vendor_count = g.vendor_orders.length;
    }

    return Array.from(map.values()).sort(
      (a, b) => b.order_date.localeCompare(a.order_date) || a.branch_name.localeCompare(b.branch_name)
    );
  }, [orders, searchTerm]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 모달 열기
  const openModal = async () => {
    setShowModal(true);
    setNewItems([]);
    setNewBranchId("");
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewStatus("대기");
    setNewNote("");
    setAddProductId("");
    setAddVendorId("");
    setAddQuantity(1);
    setAddPurchasePrice(0);
    setAddSupplyPrice(0);
    setProductSearch("");

    // 기초 데이터 로드
    const [branchRes, productRes, vendorRes] = await Promise.all([
      supabase.from("branches").select("id, name, short_name"),
      supabase.from("products").select("id, name, spec, category, supply_price").order("name"),
      supabase.from("vendors").select("id, name, category").order("name"),
    ]);
    setBranches((branchRes.data as Branch[]) || []);
    setProducts((productRes.data as Product[]) || []);
    setVendors((vendorRes.data as Vendor[]) || []);
  };

  // 주문 상태 업데이트
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;

      // 로컬 상태 업데이트
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (err) {
      console.error("Status update error:", err);
      alert("상태 업데이트 중 오류가 발생했습니다.");
    }
  };

  // 주문 품목 조회
  const fetchOrderItems = async (orderId: string) => {
    if (orderItems[orderId]) {
      setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
      return;
    }

    setLoadingOrderItems((prev) => new Set(prev).add(orderId));
    try {
      const { data } = await supabase
        .from("order_items")
        .select("id, order_id, product_id, quantity, purchase_price, supply_price, total_purchase, total_supply, margin, product:products(name, spec)")
        .eq("order_id", orderId);

      setOrderItems((prev) => ({
        ...prev,
        [orderId]: (data as unknown as OrderItem[]) || [],
      }));
      setExpandedOrderId(orderId);
    } catch (err) {
      console.error("Order items fetch error:", err);
      alert("품목 조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingOrderItems((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // 품목 선택시 벤더별 단가 조회
  const handleProductSelect = async (productId: string) => {
    setAddProductId(productId);
    setAddVendorId("");
    setAddPurchasePrice(0);

    if (!productId) {
      setVendorPrices([]);
      return;
    }

    const product = products.find((p) => p.id === productId);
    if (product?.supply_price) setAddSupplyPrice(product.supply_price);

    const { data } = await supabase
      .from("vendor_products")
      .select("vendor_id, unit_price, vendor:vendors(name)")
      .eq("product_id", productId)
      .order("unit_price");

    setVendorPrices(
      (data || []).map((d: Record<string, unknown>) => ({
        vendor_id: d.vendor_id as string,
        vendor_name: ((d.vendor as Record<string, string>)?.name) || "",
        unit_price: d.unit_price as number,
      }))
    );
  };

  // 벤더 선택시 단가 자동입력
  const handleVendorSelect = (vendorId: string) => {
    setAddVendorId(vendorId);
    const vp = vendorPrices.find((v) => v.vendor_id === vendorId);
    if (vp) setAddPurchasePrice(vp.unit_price);
  };

  // 품목 추가
  const handleAddItem = () => {
    if (!addProductId || !addVendorId || addQuantity < 1) return;
    const product = products.find((p) => p.id === addProductId);
    const vendor = vendors.find((v) => v.id === addVendorId);
    if (!product || !vendor) return;

    setNewItems((prev) => [
      ...prev,
      {
        product_id: addProductId,
        product_name: product.name,
        vendor_id: addVendorId,
        vendor_name: vendor.name,
        quantity: addQuantity,
        purchase_price: addPurchasePrice,
        supply_price: addSupplyPrice,
      },
    ]);
    setAddProductId("");
    setAddVendorId("");
    setAddQuantity(1);
    setAddPurchasePrice(0);
    setAddSupplyPrice(0);
    setProductSearch("");
    setVendorPrices([]);
  };

  const removeItem = (idx: number) => {
    setNewItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // 주문 저장
  const handleSubmit = async () => {
    if (!newBranchId || newItems.length === 0) return;
    setSubmitting(true);

    try {
      // 벤더별로 그룹핑해서 orders 생성
      const vendorGroups = new Map<string, NewOrderItem[]>();
      for (const item of newItems) {
        if (!vendorGroups.has(item.vendor_id)) vendorGroups.set(item.vendor_id, []);
        vendorGroups.get(item.vendor_id)!.push(item);
      }

      // 현재 최대 주문번호 조회
      const { data: maxOrder } = await supabase
        .from("orders")
        .select("order_number")
        .order("order_number", { ascending: false })
        .limit(1);
      let lastNum = 0;
      if (maxOrder?.[0]) {
        const match = maxOrder[0].order_number.match(/ORD-\d{4}-(\d+)/);
        if (match) lastNum = parseInt(match[1]);
      }

      const year = new Date().getFullYear();

      for (const [vendorId, items] of Array.from(vendorGroups.entries())) {
        lastNum++;
        const orderNumber = `ORD-${year}-${String(lastNum).padStart(4, "0")}`;
        const vendor = vendors.find((v) => v.id === vendorId);
        const product = products.find((p) => p.id === items[0].product_id);
        const category = product?.category || "양방";

        const totalPurchase = items.reduce((s, i) => s + i.purchase_price * i.quantity, 0);
        const totalSupply = items.reduce((s, i) => s + i.supply_price * i.quantity, 0);
        const totalMargin = totalSupply - totalPurchase;

        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .insert({
            order_number: orderNumber,
            branch_id: newBranchId,
            order_date: newDate,
            status: newStatus,
            category,
            vendor_name: vendor?.name || "",
            total_purchase_amount: totalPurchase,
            total_supply_amount: totalSupply,
            total_margin: totalMargin,
            note: newNote || null,
          })
          .select("id")
          .single();

        if (orderError) throw orderError;

        const orderItems = items.map((item) => ({
          order_id: orderData.id,
          product_id: item.product_id,
          vendor_id: item.vendor_id,
          raw_product_name: item.product_name,
          quantity: item.quantity,
          purchase_price: item.purchase_price,
          total_purchase: item.purchase_price * item.quantity,
          supply_price: item.supply_price,
          total_supply: item.supply_price * item.quantity,
          margin: (item.supply_price - item.purchase_price) * item.quantity,
        }));

        const { error: itemError } = await supabase.from("order_items").insert(orderItems);
        if (itemError) throw itemError;
      }

      setShowModal(false);
      await fetchOrders();
    } catch (err) {
      console.error("Order creation error:", err);
      alert("주문 등록 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (!productSearch) return true;
    const s = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(s) || (p.spec || "").toLowerCase().includes(s);
  });

  const itemsTotal = newItems.reduce(
    (acc, i) => ({
      purchase: acc.purchase + i.purchase_price * i.quantity,
      supply: acc.supply + i.supply_price * i.quantity,
    }),
    { purchase: 0, supply: 0 }
  );

  return (
    <>
      <TopBar title="주문 관리" subtitle="병원별 주문 내역 조회 및 관리" />
      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        {/* 상단 요약 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4 text-center">
            <p className="text-xs text-gray-500">총 주문</p>
            <p className="text-lg md:text-xl font-bold text-gray-900">{groupedOrders.length}건</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4 text-center">
            <p className="text-xs text-gray-500">총 발주</p>
            <p className="text-lg md:text-xl font-bold text-indigo-600">{orders.length}건</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4 text-center">
            <p className="text-xs text-gray-500">총 매입</p>
            <p className="text-lg md:text-xl font-bold text-gray-900">
              ₩{groupedOrders.reduce((s, g) => s + g.total_purchase, 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* 검색 + 새 주문 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative flex-1 sm:flex-none w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="주문번호, 지점명, 벤더명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 w-full sm:w-auto justify-center"
          >
            <Plus className="w-4 h-4" /> 새 주문
          </button>
        </div>

        {/* 주문 목록 — 그룹핑 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : groupedOrders.length === 0 ? (
            <div className="py-16 text-center text-gray-400">주문 데이터가 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {groupedOrders.map((group) => {
                const isExpanded = expandedGroups.has(group.key);
                return (
                  <div key={group.key}>
                    {/* 그룹 헤더 */}
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3 md:py-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm md:text-base text-gray-900">
                            {group.order_date}
                          </span>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                            {group.branch_short}
                          </span>
                          <span className="text-xs text-gray-400">
                            벤더 {group.vendor_count}곳
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 md:gap-6 text-right flex-shrink-0">
                        <div className="hidden sm:block">
                          <p className="text-[10px] text-gray-400">매입</p>
                          <p className="text-xs md:text-sm text-gray-600">
                            ₩{group.total_purchase.toLocaleString()}
                          </p>
                        </div>
                        <div className="hidden sm:block">
                          <p className="text-[10px] text-gray-400">공급</p>
                          <p className="text-xs md:text-sm text-gray-900 font-medium">
                            ₩{group.total_supply.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">마진</p>
                          <p className={`text-xs md:text-sm font-medium ${group.total_margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            ₩{group.total_margin.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* 벤더별 상세 */}
                    {isExpanded && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs md:text-sm min-w-[600px]">
                            <thead>
                              <tr className="text-gray-400 text-[11px]">
                                <th className="text-left px-4 md:px-5 pl-12 py-2 font-medium">주문번호</th>
                                <th className="text-left px-3 py-2 font-medium">구분</th>
                                <th className="text-left px-3 py-2 font-medium">벤더</th>
                                <th className="text-left px-3 py-2 font-medium">상태</th>
                                <th className="text-right px-3 py-2 font-medium">매입가</th>
                                <th className="text-right px-3 py-2 font-medium">공급가</th>
                                <th className="text-right px-4 md:px-5 py-2 font-medium">마진</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {group.vendor_orders.map((vo) => {
                                const isExpanded = expandedOrderId === vo.id;
                                const items = orderItems[vo.id] || [];
                                const isLoading = loadingOrderItems.has(vo.id);
                                return (
                                  <>
                                    <tr
                                      key={vo.id}
                                      onClick={() => fetchOrderItems(vo.id)}
                                      className="hover:bg-white transition-colors cursor-pointer"
                                    >
                                      <td className="px-4 md:px-5 pl-12 py-2 font-medium text-blue-600">
                                        {vo.order_number}
                                      </td>
                                      <td className="px-3 py-2 text-gray-500">{vo.category}</td>
                                      <td className="px-3 py-2 text-gray-700">{vo.vendor_name}</td>
                                      <td className="px-3 py-2">
                                        <select
                                          value={vo.status}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            handleStatusChange(vo.id, e.target.value);
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border-none cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none ${
                                            statusColors[vo.status] || "bg-gray-100 text-gray-600"
                                          }`}
                                        >
                                          {statusOptions.map((opt) => (
                                            <option key={opt} value={opt}>
                                              {opt}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2 text-right text-gray-600">
                                        ₩{(vo.total_purchase_amount || 0).toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2 text-right text-gray-900">
                                        ₩{(vo.total_supply_amount || 0).toLocaleString()}
                                      </td>
                                      <td className="px-4 md:px-5 py-2 text-right font-medium text-emerald-600">
                                        {isExpanded ? (
                                          <ChevronUp className="w-4 h-4 inline" />
                                        ) : (
                                          <span>₩{(vo.total_margin || 0).toLocaleString()}</span>
                                        )}
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr key={`items-${vo.id}`} className="bg-gray-50">
                                        <td colSpan={7} className="px-4 md:px-5 py-4">
                                          {isLoading ? (
                                            <div className="flex items-center justify-center py-4">
                                              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                                            </div>
                                          ) : items.length === 0 ? (
                                            <div className="text-center text-gray-400 py-4 text-sm">
                                              품목 정보 없음
                                            </div>
                                          ) : (
                                            <div className="space-y-2">
                                              <h4 className="text-xs font-semibold text-gray-700 mb-3">
                                                품목 상세 ({items.length}개)
                                              </h4>
                                              <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                  <thead>
                                                    <tr className="text-gray-500 border-b border-gray-200">
                                                      <th className="text-left px-3 py-2 font-medium">
                                                        품목명
                                                      </th>
                                                      <th className="text-left px-3 py-2 font-medium">
                                                        규격
                                                      </th>
                                                      <th className="text-right px-3 py-2 font-medium">
                                                        수량
                                                      </th>
                                                      <th className="text-right px-3 py-2 font-medium">
                                                        매입단가
                                                      </th>
                                                      <th className="text-right px-3 py-2 font-medium">
                                                        공급단가
                                                      </th>
                                                      <th className="text-right px-3 py-2 font-medium">
                                                        마진/개
                                                      </th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-gray-100">
                                                    {items.map((item) => {
                                                      const itemMarginPerUnit =
                                                        item.supply_price - item.purchase_price;
                                                      const product = item.product as unknown as { name: string; spec: string };
                                                      return (
                                                        <tr key={item.id}>
                                                          <td className="px-3 py-2 text-gray-900 font-medium">
                                                            {product?.name || "-"}
                                                          </td>
                                                          <td className="px-3 py-2 text-gray-500">
                                                            {product?.spec || "-"}
                                                          </td>
                                                          <td className="px-3 py-2 text-right text-gray-600">
                                                            {item.quantity}
                                                          </td>
                                                          <td className="px-3 py-2 text-right text-gray-600">
                                                            ₩{item.purchase_price.toLocaleString()}
                                                          </td>
                                                          <td className="px-3 py-2 text-right text-gray-900">
                                                            ₩{item.supply_price.toLocaleString()}
                                                          </td>
                                                          <td className="px-3 py-2 text-right font-medium text-emerald-600">
                                                            ₩{itemMarginPerUnit.toLocaleString()}
                                                          </td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 새 주문 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">새 주문 등록</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">지점 *</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                  >
                    <option value="">선택</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">주문일 *</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">상태</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                  >
                    <option value="대기">대기</option>
                    <option value="처리중">처리중</option>
                    <option value="발주완료">발주완료</option>
                    <option value="완료">완료</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">비고</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="메모 (선택)"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
              </div>

              {/* 품목 추가 영역 */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">품목 추가</h3>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">품목 검색</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="품목명 입력..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  {productSearch && (
                    <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-sm">
                      {filteredProducts.slice(0, 20).map((p) => (
                        <button
                          key={p.id}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 ${
                            addProductId === p.id ? "bg-blue-50 font-medium" : ""
                          }`}
                          onClick={() => {
                            handleProductSelect(p.id);
                            setProductSearch(p.name);
                          }}
                        >
                          <span className="text-gray-900">{p.name}</span>
                          {p.spec && <span className="text-gray-400 ml-1 text-xs">({p.spec})</span>}
                          <span className="text-xs text-gray-400 ml-2">[{p.category}]</span>
                        </button>
                      ))}
                      {filteredProducts.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</div>
                      )}
                    </div>
                  )}
                </div>

                {addProductId && vendorPrices.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">벤더 선택 (단가순)</label>
                    <div className="flex flex-wrap gap-2">
                      {vendorPrices.map((vp) => (
                        <button
                          key={vp.vendor_id}
                          onClick={() => handleVendorSelect(vp.vendor_id)}
                          className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                            addVendorId === vp.vendor_id
                              ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {vp.vendor_name} · ₩{vp.unit_price.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {addProductId && vendorPrices.length === 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">벤더 선택 (단가 정보 없음 — 직접 선택)</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={addVendorId}
                      onChange={(e) => setAddVendorId(e.target.value)}
                    >
                      <option value="">벤더 선택</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} [{v.category}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">수량</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={addQuantity}
                      onChange={(e) => setAddQuantity(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">매입단가</label>
                    <input
                      type="number"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={addPurchasePrice}
                      onChange={(e) => setAddPurchasePrice(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">공급단가</label>
                    <input
                      type="number"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={addSupplyPrice}
                      onChange={(e) => setAddSupplyPrice(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddItem}
                  disabled={!addProductId || !addVendorId || addQuantity < 1}
                  className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + 품목 추가
                </button>
              </div>

              {/* 추가된 품목 목록 */}
              {newItems.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    추가된 품목 ({newItems.length}건)
                  </h3>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-left px-3 py-2">품목</th>
                          <th className="text-left px-3 py-2">벤더</th>
                          <th className="text-right px-3 py-2">수량</th>
                          <th className="text-right px-3 py-2">매입</th>
                          <th className="text-right px-3 py-2">공급</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {newItems.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-gray-900">{item.product_name}</td>
                            <td className="px-3 py-2 text-gray-500">{item.vendor_name}</td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2 text-right">
                              ₩{(item.purchase_price * item.quantity).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right">
                              ₩{(item.supply_price * item.quantity).toLocaleString()}
                            </td>
                            <td className="px-2 py-2">
                              <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-4 text-sm">
                    <span className="text-gray-500">
                      매입 합계: <strong className="text-gray-900">₩{itemsTotal.purchase.toLocaleString()}</strong>
                    </span>
                    <span className="text-gray-500">
                      공급 합계: <strong className="text-gray-900">₩{itemsTotal.supply.toLocaleString()}</strong>
                    </span>
                    <span className="text-gray-500">
                      마진: <strong className="text-emerald-600">₩{(itemsTotal.supply - itemsTotal.purchase).toLocaleString()}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={!newBranchId || newItems.length === 0 || submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "저장 중..." : `주문 등록 (${newItems.length}건)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
