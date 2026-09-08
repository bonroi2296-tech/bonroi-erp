"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import type { TablesInsert } from "@/lib/database.types";
import { Plus, Search, X } from "lucide-react";

interface Return {
  id: string;
  order_item_id: string;
  return_type: "hospital_request" | "our_mistake";
  reason: string;
  quantity: number;
  return_cost: number;
  charge_cost: boolean;
  status: "pending" | "processing" | "completed" | "rejected";
  notes: string;
  created_at: string;
  completed_at?: string;
  order_item?: {
    order_ref?: {
      order_date: string;
      branch_ref?: {
        name: string;
      };
    };
    product?: {
      name: string;
      spec: string;
    };
  };
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  purchase_price: number;
  supply_price: number | null;
  raw_product_name: string | null;
  edi_code: string | null;
  order_ref?: {
    id: string;
    order_date: string;
    category: string | null;
    vendor_name: string | null;
    branch_id: string | null;
    branch_ref?: {
      name: string;
    };
  };
  product?: {
    name: string;
    spec: string;
  };
}

interface SummaryStats {
  total_returns: number;
  processing_count: number;
  completed_count: number;
  total_return_cost: number;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  pending: "대기",
  processing: "처리중",
  completed: "완료",
  rejected: "반려",
};

export default function ReturnsPage() {
  const toast = useToast();
  const [returns, setReturns] = useState<Return[]>([]);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    total_returns: 0,
    processing_count: 0,
    completed_count: 0,
    total_return_cost: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrderItem, setSelectedOrderItem] = useState<OrderItem | null>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    return_type: "hospital_request" as "hospital_request" | "our_mistake",
    reason: "",
    quantity: 1,
    return_cost: 0,
    charge_cost: true,
    notes: "",
  });

  // Update charge_cost default when return_type changes
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      charge_cost: prev.return_type === "hospital_request",
    }));
  }, [formData.return_type]);

  useEffect(() => {
    fetchReturns();
    fetchOrderItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchReturns() {
    const { data } = await supabase
      .from("returns")
      .select(
        `id, order_item_id, return_type, reason, quantity, return_cost, charge_cost,
        status, notes, created_at, completed_at,
        order_item:order_items(
          order_ref:orders(order_date, branch_ref:branches(name)),
          product:products(name, spec)
        )`
      )
      .order("created_at", { ascending: false })
      .limit(100);

    const returnsData = (data as unknown as Return[]) || [];
    setReturns(returnsData);
    calculateStats(returnsData);
    setLoading(false);
  }

  function calculateStats(returnsData: Return[]) {
    const stats = {
      total_returns: returnsData.length,
      processing_count: returnsData.filter((r) => r.status === "processing").length,
      completed_count: returnsData.filter((r) => r.status === "completed").length,
      total_return_cost: returnsData.reduce((sum, r) => sum + (r.return_cost || 0), 0),
    };
    setSummaryStats(stats);
  }

  async function fetchOrderItems() {
    const { data } = await supabase
      .from("order_items")
      .select(
        `id, product_id, quantity, purchase_price, supply_price, raw_product_name, edi_code,
        order_ref:orders(id, order_date, category, vendor_name, branch_id, branch_ref:branches(name)),
        product:products(name, spec)`
      )
      .limit(500);

    setOrderItems((data as unknown as OrderItem[]) || []);
  }

  // 반품은 주문 내역에 마이너스 줄로 남겨야 매입·매출·마진에 반영된다.
  // 원주문과 같은 지점·거래처로 새 주문을 만들고 품목명 뒤에 "반품"을 붙인다.
  async function writeReturnToLedger(
    item: OrderItem,
    form: { quantity: number; return_cost: number; charge_cost: boolean }
  ): Promise<string | null> {
    const order = item.order_ref;
    if (!order?.branch_id) return "원주문의 지점 정보가 없어요.";

    const qty = form.quantity;
    const purchase = -(qty * (item.purchase_price || 0));
    const purchaseSupply = Math.round(purchase / 1.1);
    const supply = -(qty * (item.supply_price || 0));
    const supplyVat = Math.round(supply * 0.1);

    const rows: TablesInsert<"order_items">[] = [
      {
        order_id: "",
        product_id: item.product_id || null,
        raw_product_name: `${item.raw_product_name || item.product?.name || "품목"} 반품`,
        edi_code: item.edi_code,
        quantity: -qty,
        purchase_price: item.purchase_price,
        total_purchase: purchase,
        purchase_supply: purchaseSupply,
        purchase_vat: purchase - purchaseSupply,
        supply_price: item.supply_price,
        total_supply: supply,
        supply_vat: supplyVat,
        billed_amount: supply + supplyVat,
        margin: supply - purchaseSupply,
        item_status: "도착",
      },
    ];

    if (form.return_cost > 0) {
      const feeSupply = Math.round(form.return_cost / 1.1);
      const billed = form.charge_cost ? Math.round(form.return_cost * 1.1) : 0;
      rows.push({
        order_id: "",
        raw_product_name: "반품배송비",
        quantity: 1,
        purchase_price: form.return_cost,
        total_purchase: form.return_cost,
        purchase_supply: feeSupply,
        purchase_vat: form.return_cost - feeSupply,
        supply_price: form.charge_cost ? form.return_cost : 0,
        total_supply: form.charge_cost ? form.return_cost : 0,
        supply_vat: billed - (form.charge_cost ? form.return_cost : 0),
        billed_amount: billed,
        margin: (form.charge_cost ? form.return_cost : 0) - feeSupply,
        item_status: "도착",
      });
    }

    const sum = (k: keyof TablesInsert<"order_items">) =>
      rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

    const { data: created, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: await nextOrderNumber(),
        order_date: new Date().toISOString().slice(0, 10),
        branch_id: order.branch_id,
        vendor_name: order.vendor_name,
        category: order.category ?? "양방",
        status: "완료",
        total_purchase_amount: sum("total_purchase"),
        total_purchase_supply: sum("purchase_supply"),
        total_supply_amount: sum("total_supply"),
        total_supply_vat: sum("supply_vat"),
        total_billed: sum("billed_amount"),
        total_margin: sum("margin"),
      })
      .select("id")
      .single();

    if (orderError || !created) return orderError?.message ?? "주문 생성 실패";

    const { error: itemError } = await supabase
      .from("order_items")
      .insert(rows.map((r) => ({ ...r, order_id: created.id })));
    if (itemError) return itemError.message;
    return null;
  }

  async function nextOrderNumber(): Promise<string> {
    const { data, error } = await supabase.rpc("next_order_number");
    if (!error && typeof data === "string") return data;
    const { data: maxOrder } = await supabase
      .from("orders")
      .select("order_number")
      .order("order_number", { ascending: false })
      .limit(1);
    const m = maxOrder?.[0]?.order_number?.match(/ORD-\d{4}-(\d+)/);
    const n = m ? parseInt(m[1]) : 0;
    return `ORD-${new Date().getFullYear()}-${String(n + 1).padStart(4, "0")}`;
  }

  async function handleCreateReturn() {
    if (!selectedOrderItem) {
      toast.error("주문 항목을 선택해주세요");
      return;
    }

    if (formData.quantity <= 0 || !formData.reason) {
      toast.error("필수 항목을 입력해주세요");
      return;
    }

    const { error } = await supabase.from("returns").insert([
      {
        order_item_id: selectedOrderItem.id,
        return_type: formData.return_type,
        reason: formData.reason,
        quantity: formData.quantity,
        return_cost: formData.return_cost,
        charge_cost: formData.charge_cost,
        status: "pending",
        notes: formData.notes,
      },
    ]);

    if (error) {
      toast.error("반품 등록 실패: " + error.message);
      return;
    }

    const ledgerError = await writeReturnToLedger(selectedOrderItem, formData);
    if (ledgerError) {
      toast.error("반품은 등록했는데 주문 내역 반영에 실패했어요: " + ledgerError);
    } else {
      toast.success("반품을 등록하고 주문 내역에 마이너스로 반영했어요.");
    }

    // Reset form
    setShowModal(false);
    setSelectedOrderItem(null);
    setFormData({
      return_type: "hospital_request",
      reason: "",
      quantity: 1,
      return_cost: 0,
      charge_cost: true,
      notes: "",
    });

    fetchReturns();
  }

  async function handleStatusChange(returnId: string, newStatus: string) {
    const { error } = await supabase
      .from("returns")
      .update({
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", returnId);

    if (error) {
      toast.error("상태 업데이트 실패: " + error.message);
      return;
    }

    fetchReturns();
  }

  const filteredOrderItems = orderItems.filter(
    (item) =>
      (item.product?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.product?.spec || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <TopBar title="반품/반송 관리" subtitle="반품 요청 처리 및 비용 관리" />
      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium mb-1">총 반품건수</p>
            <p className="text-2xl font-bold text-gray-900">{summaryStats.total_returns}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium mb-1">처리중</p>
            <p className="text-2xl font-bold text-blue-600">{summaryStats.processing_count}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium mb-1">완료</p>
            <p className="text-2xl font-bold text-green-600">{summaryStats.completed_count}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium mb-1">반송비용 합계</p>
            <p className="text-xl font-bold text-gray-900">₩{summaryStats.total_return_cost.toLocaleString()}</p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> 반품 등록
          </button>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">반품 등록</h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectedOrderItem(null);
                    setSearchQuery("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Order Item Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    주문 항목 검색/선택 *
                  </label>
                  <div className="relative">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowSearchDropdown(true)}
                        placeholder="품목명, 규격으로 검색..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    {/* Dropdown */}
                    {showSearchDropdown && filteredOrderItems.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                        {filteredOrderItems.slice(0, 10).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setSelectedOrderItem(item);
                              setSearchQuery("");
                              setShowSearchDropdown(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-b-0 text-sm"
                          >
                            <div className="font-medium text-gray-900">
                              {item.product?.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {item.product?.spec} | {item.order_ref?.order_date} |{" "}
                              {item.order_ref?.branch_ref?.name}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedOrderItem && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-gray-900">
                        {selectedOrderItem.product?.name}
                      </p>
                      <p className="text-xs text-gray-600">
                        {selectedOrderItem.product?.spec} | {selectedOrderItem.order_ref?.order_date}{" "}
                        | {selectedOrderItem.order_ref?.branch_ref?.name}
                      </p>
                    </div>
                  )}
                </div>

                {/* Return Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    반품 유형 *
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="return_type"
                        value="hospital_request"
                        checked={formData.return_type === "hospital_request"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            return_type: e.target.value as "hospital_request",
                          })
                        }
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">병원 요청 (단순 반품)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="return_type"
                        value="our_mistake"
                        checked={formData.return_type === "our_mistake"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            return_type: e.target.value as "our_mistake",
                          })
                        }
                        className="w-4 h-4 text-red-600"
                      />
                      <span className="text-sm text-gray-700">본로이 과실 (잘못 주문)</span>
                    </label>
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    사유 입력 *
                  </label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="반품 사유를 입력해주세요"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    rows={3}
                  />
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    수량 *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Return Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    반송 비용 (원)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.return_cost}
                    onChange={(e) =>
                      setFormData({ ...formData, return_cost: parseInt(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Charge Cost */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.charge_cost}
                      onChange={(e) =>
                        setFormData({ ...formData, charge_cost: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">비용처리</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-7">
                    병원 요청: 기본 체크 | 본로이 과실: 기본 미체크
                  </p>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">메모</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="추가 메모 사항..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    rows={2}
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 justify-end pt-4">
                  <button
                    onClick={() => {
                      setShowModal(false);
                      setSelectedOrderItem(null);
                      setSearchQuery("");
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleCreateReturn}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    등록
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Returns Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm min-w-[1200px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">날짜</th>
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">지점</th>
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">품목</th>
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">유형</th>
                    <th className="text-left px-4 md:px-5 py-2.5 md:py-3 font-medium">사유</th>
                    <th className="text-right px-4 md:px-5 py-2.5 md:py-3 font-medium">수량</th>
                    <th className="text-right px-4 md:px-5 py-2.5 md:py-3 font-medium">반송비용</th>
                    <th className="text-center px-4 md:px-5 py-2.5 md:py-3 font-medium">비용처리</th>
                    <th className="text-center px-4 md:px-5 py-2.5 md:py-3 font-medium">상태</th>
                    <th className="text-center px-4 md:px-5 py-2.5 md:py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {returns.map((returnItem) => (
                    <tr key={returnItem.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 md:px-5 py-2.5 md:py-3 text-gray-600">
                        {returnItem.created_at
                          ? new Date(returnItem.created_at).toLocaleDateString("ko-KR")
                          : "-"}
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3 text-gray-600">
                        {returnItem.order_item?.order_ref?.branch_ref?.name || "-"}
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3 font-medium text-gray-900">
                        {returnItem.order_item?.product?.name || "-"}
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3">
                        <span
                          className={`px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium ${
                            returnItem.return_type === "hospital_request"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {returnItem.return_type === "hospital_request"
                            ? "병원 요청"
                            : "본로이 과실"}
                        </span>
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3 text-gray-600 text-xs md:text-sm max-w-xs truncate">
                        {returnItem.reason}
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3 text-right text-gray-600">
                        {returnItem.quantity}
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3 text-right text-gray-900 font-medium">
                        ₩{(returnItem.return_cost || 0).toLocaleString()}
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3 text-center">
                        <input
                          type="checkbox"
                          checked={returnItem.charge_cost}
                          disabled
                          className="w-4 h-4 text-blue-600 rounded cursor-not-allowed"
                        />
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3 text-center">
                        <select
                          value={returnItem.status}
                          onChange={(e) => handleStatusChange(returnItem.id, e.target.value)}
                          className={`px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none ${
                            statusColors[returnItem.status] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          <option value="pending">{statusLabels.pending}</option>
                          <option value="processing">{statusLabels.processing}</option>
                          <option value="completed">{statusLabels.completed}</option>
                          <option value="rejected">{statusLabels.rejected}</option>
                        </select>
                      </td>
                      <td className="px-4 md:px-5 py-2.5 md:py-3 text-center">
                        <button className="text-blue-600 hover:text-blue-700 text-xs font-medium">
                          상세보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {returns.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <p className="text-gray-500">반품 기록이 없습니다</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
