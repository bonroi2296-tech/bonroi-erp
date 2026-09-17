"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";

export interface CreatedProduct {
  id: string;
  name: string;
  spec: string | null;
  vendor: string | null;
  vendor_id: string | null;
  price: number | null;
}

// 품목 매칭 중에 카탈로그에 없는 제품을 그 자리에서 등록한다.
// 단가 비교 탭으로 넘어가면 분석해둔 주문이 사라져서 여기서 바로 만든다.
export default function QuickProductCreate({
  defaultName,
  onCreated,
  onCancel,
}: {
  defaultName: string;
  onCreated: (p: CreatedProduct) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState(defaultName);
  const [spec, setSpec] = useState("");
  const [category, setCategory] = useState("양방");
  const [supplyPrice, setSupplyPrice] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVendors((data || []).filter((v) => v.name !== "기타")));
  }, []);

  const save = async () => {
    const n = name.trim();
    const s = spec.trim();
    if (!n) return toast.error("품목명을 넣어주세요.");
    if (vendorId && !Number(unitPrice)) return toast.error("거래처를 골랐으면 매입가도 넣어주세요.");
    setSaving(true);

    const { data, error } = await supabase
      .from("products")
      .insert({ name: n, spec: s, category, supply_price: Number(supplyPrice) || null })
      .select("id, name, spec")
      .single();

    if (error || !data) {
      setSaving(false);
      // 23505 = (품목명, 규격) 이 이미 있음
      return toast.error(
        error?.code === "23505"
          ? `"${[n, s].filter(Boolean).join(" ")}" 은 이미 등록돼 있어요. 검색어를 바꿔서 찾아보세요.`
          : `등록하지 못했어요: ${error?.message ?? "알 수 없는 오류"}`
      );
    }

    let vendorName: string | null = null;
    if (vendorId) {
      const { error: vpError } = await supabase.from("vendor_products").insert({
        product_id: data.id,
        vendor_id: vendorId,
        unit_price: Number(unitPrice),
        is_lowest: true,
        last_updated: new Date().toISOString(),
      });
      if (vpError) toast.error(`제품은 등록했는데 매입가 저장에 실패했어요: ${vpError.message}`);
      else vendorName = vendors.find((v) => v.id === vendorId)?.name ?? null;
    }

    setSaving(false);
    toast.success(`${n} 등록하고 매칭했어요.`);
    onCreated({
      id: data.id,
      name: data.name,
      spec: data.spec,
      vendor: vendorName,
      vendor_id: vendorName ? vendorId : null,
      price: vendorName ? Number(unitPrice) : null,
    });
  };

  const input = "w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="mt-2 p-3 border border-emerald-200 rounded-lg bg-emerald-50/40 space-y-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-xs font-semibold text-emerald-800">새 제품으로 등록하고 바로 매칭</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="품목명 (예: 신창 수액세트 (무침))" className={input} />
        <input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="규격 (예: 50ea)" className={input} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
          <option value="양방">양방</option>
          <option value="한방">한방</option>
        </select>
        <input value={supplyPrice} onChange={(e) => setSupplyPrice(e.target.value)} type="number" min={0} placeholder="납품가(선택)" className={input} />
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={input}>
          <option value="">거래처(선택)</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} type="number" min={0} placeholder="매입가" className={input} disabled={!vendorId} />
      </div>
      <p className="text-[11px] text-gray-500">거래처·매입가를 넣어두면 추천 거래처가 바로 잡힙니다. 규격은 거래명세서 규격 칸에 들어갑니다.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800">취소</button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "등록 중..." : "등록하고 매칭"}
        </button>
      </div>
    </div>
  );
}
