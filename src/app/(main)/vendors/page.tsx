"use client";

import { useCallback, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { Search, ExternalLink, Plus, X } from "lucide-react";

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

const CATEGORIES = ["양방", "한방", "공통"];

export default function VendorsPage() {
  const toast = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("양방");
  const [payment, setPayment] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [freeMin, setFreeMin] = useState("");
  const [website, setWebsite] = useState("");

  const fetchVendors = useCallback(async () => {
    const { data } = await supabase
      .from("vendors")
      .select("id, name, category, payment_method, delivery_note, website_url, auto_order_enabled, vendor_products(id)")
      .order("name");
    setVendors((data as unknown as Vendor[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const openModal = () => {
    setName("");
    setCategory("양방");
    setPayment("");
    setShippingFee("");
    setFreeMin("");
    setWebsite("");
    setShowModal(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("거래처 이름을 입력하세요.");
    if (vendors.some((v) => v.name.trim() === trimmed)) {
      return toast.error("이미 등록된 거래처예요.");
    }
    setSaving(true);
    const { error } = await supabase.from("vendors").insert({
      name: trimmed,
      category,
      payment_method: payment.trim() || null,
      shipping_fee: Number(shippingFee) || 0,
      free_shipping_min: Number(freeMin) || 0,
      website_url: website.trim() || null,
      auto_order_enabled: false,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${trimmed} 등록했어요.`);
    setShowModal(false);
    fetchVendors();
  };

  const filtered = vendors.filter(v => {
    const search = searchTerm.toLowerCase();
    return (
      v.name.toLowerCase().includes(search) ||
      v.category.toLowerCase().includes(search) ||
      (v.delivery_note && v.delivery_note.toLowerCase().includes(search))
    );
  });

  return (
    <>
      <TopBar title="벤더 관리" subtitle={`총 ${vendors.length}개 벤더 등록`} />
      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-full sm:w-64 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="벤더명 검색..."
            />
          </div>
          <button
            onClick={openModal}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" /> 거래처 추가
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
          {loading ? (
            <div className="col-span-full flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            filtered.map((vendor) => (
              <div key={vendor.id} className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm md:text-base">{vendor.name}</h3>
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
                <div className="space-y-1.5 text-xs md:text-sm text-gray-600">
                  <p>취급 품목: <span className="font-medium text-gray-900">{vendor.vendor_products?.length || 0}개</span></p>
                  {vendor.payment_method && <p>결제: {vendor.payment_method}</p>}
                  {vendor.delivery_note && <p className="truncate">배송: {vendor.delivery_note}</p>}
                </div>
                {vendor.website_url && (
                  <a href={vendor.website_url} target="_blank" rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs md:text-sm text-blue-600 hover:text-blue-700">
                    <ExternalLink className="w-3.5 h-3.5" /> 사이트 바로가기
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">거래처 추가</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">거래처 이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 우진헬스케어"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">구분</label>
                <div className="flex gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                        category === c ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">결제방법</label>
                <input
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                  placeholder="예: 무통장입금 / 월 결제"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">배송비</label>
                  <input
                    value={shippingFee}
                    onChange={(e) => setShippingFee(e.target.value)}
                    type="number"
                    min={0}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">무료배송 기준</label>
                  <input
                    value={freeMin}
                    onChange={(e) => setFreeMin(e.target.value)}
                    type="number"
                    min={0}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">홈페이지</label>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                취소
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "저장 중..." : "등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
