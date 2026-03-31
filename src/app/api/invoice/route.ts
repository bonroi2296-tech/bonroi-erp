import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // e.g. "2025-10"
  const branchId = searchParams.get("branch");

  if (!month || !branchId) {
    return NextResponse.json({ error: "month and branch are required" }, { status: 400 });
  }

  // Parse month range
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const endMonth = mon === 12 ? 1 : mon + 1;
  const endYear = mon === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  // Fetch branch name
  const { data: branchData } = await supabase
    .from("branches")
    .select("name")
    .eq("id", branchId)
    .single();

  const branchName = branchData?.name || "알 수 없음";

  // Fetch orders with items for this month and branch
  const { data: orders } = await supabase
    .from("orders")
    .select(`
      id, order_number, order_date, vendor_name, category,
      order_items (
        raw_product_name, quantity, purchase_price, total_purchase,
        supply_price, total_supply, margin, edi_code
      )
    `)
    .eq("branch_id", branchId)
    .gte("order_date", startDate)
    .lt("order_date", endDate)
    .order("order_date", { ascending: true });

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: "해당 기간 주문 내역이 없습니다." }, { status: 404 });
  }

  // Build workbook
  const wb = XLSX.utils.book_new();

  // ===== Sheet 1: 거래명세서 (전체 요약) =====
  const summaryRows: (string | number)[][] = [];

  // Header
  summaryRows.push(["거 래 명 세 서"]);
  summaryRows.push([]);
  summaryRows.push(["공급받는자", "", "", "공급하는자"]);
  summaryRows.push(["상호", branchName, "", "상호", "본로이"]);
  summaryRows.push(["대표", "", "", "대표", "강주영"]);
  summaryRows.push(["사업자번호", "", "", "사업자번호", ""]);
  summaryRows.push([]);
  summaryRows.push([`기간: ${year}년 ${mon}월`]);
  summaryRows.push([]);

  // Column headers
  summaryRows.push(["No", "날짜", "거래처", "제품(규격)", "수량", "EDI코드", "단가(매입)", "총매입가", "납품가(판매)", "총납품가", "마진"]);

  let rowNum = 1;
  let grandTotalPurchase = 0;
  let grandTotalSupply = 0;
  let grandTotalMargin = 0;

  for (const order of orders) {
    const items = (order as { order_items: Array<{
      raw_product_name: string;
      quantity: number;
      purchase_price: number;
      total_purchase: number;
      supply_price: number;
      total_supply: number;
      margin: number;
      edi_code: string;
    }> }).order_items || [];

    for (const item of items) {
      // Skip shipping fees and discounts for cleaner output
      const name = item.raw_product_name;
      if (name === "배송비" || name === "대량구매 할인" || name === "마일리지 소모" || name.includes("반품")) continue;

      summaryRows.push([
        rowNum++,
        order.order_date,
        order.vendor_name,
        item.raw_product_name,
        item.quantity,
        item.edi_code || "",
        item.purchase_price,
        item.total_purchase,
        item.supply_price,
        item.total_supply,
        item.margin,
      ]);
      grandTotalPurchase += item.total_purchase;
      grandTotalSupply += item.total_supply;
      grandTotalMargin += item.margin;
    }
  }

  summaryRows.push([]);
  summaryRows.push(["", "", "", "합계", "", "", "", grandTotalPurchase, "", grandTotalSupply, grandTotalMargin]);

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);

  // Set column widths
  ws1["!cols"] = [
    { wch: 5 },  // No
    { wch: 12 }, // 날짜
    { wch: 12 }, // 거래처
    { wch: 40 }, // 제품(규격)
    { wch: 6 },  // 수량
    { wch: 12 }, // EDI코드
    { wch: 10 }, // 단가(매입)
    { wch: 12 }, // 총매입가
    { wch: 10 }, // 납품가
    { wch: 12 }, // 총납품가
    { wch: 12 }, // 마진
  ];

  // Merge header row
  ws1["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws1, `${branchName} ${mon}월 거래명세서`);

  // ===== Sheet 2: EDI 코드 포함 납품 내역 =====
  const ediRows: (string | number)[][] = [];
  ediRows.push([`${branchName} - ${year}년 ${mon}월 납품 내역 (EDI코드 포함)`]);
  ediRows.push([]);
  ediRows.push(["No", "날짜", "제품(규격)", "EDI코드", "수량", "납품단가", "공급가액", "세액", "합계"]);

  let ediRowNum = 1;
  let ediTotalSupply = 0;
  let ediTotalTax = 0;
  let ediTotalAmount = 0;

  for (const order of orders) {
    const items = (order as { order_items: Array<{
      raw_product_name: string;
      quantity: number;
      supply_price: number;
      total_supply: number;
      edi_code: string;
    }> }).order_items || [];

    for (const item of items) {
      const name = item.raw_product_name;
      if (name === "배송비" || name === "대량구매 할인" || name === "마일리지 소모" || name.includes("반품")) continue;

      const supplyAmount = Math.round(item.total_supply / 1.1);
      const tax = item.total_supply - supplyAmount;

      ediRows.push([
        ediRowNum++,
        order.order_date,
        item.raw_product_name,
        item.edi_code || "-",
        item.quantity,
        item.supply_price,
        supplyAmount,
        tax,
        item.total_supply,
      ]);
      ediTotalSupply += supplyAmount;
      ediTotalTax += tax;
      ediTotalAmount += item.total_supply;
    }
  }

  ediRows.push([]);
  ediRows.push(["", "", "합계", "", "", "", ediTotalSupply, ediTotalTax, ediTotalAmount]);

  const ws2 = XLSX.utils.aoa_to_sheet(ediRows);
  ws2["!cols"] = [
    { wch: 5 },  // No
    { wch: 12 }, // 날짜
    { wch: 40 }, // 제품
    { wch: 12 }, // EDI
    { wch: 6 },  // 수량
    { wch: 10 }, // 납품단가
    { wch: 12 }, // 공급가액
    { wch: 10 }, // 세액
    { wch: 12 }, // 합계
  ];
  ws2["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, `EDI코드 납품내역`);

  // ===== Sheet 3: 거래처별 요약 =====
  const vendorMap: Record<string, { purchase: number; supply: number; margin: number; count: number }> = {};
  for (const order of orders) {
    const vendor = order.vendor_name || "기타";
    if (!vendorMap[vendor]) vendorMap[vendor] = { purchase: 0, supply: 0, margin: 0, count: 0 };
    const items = (order as { order_items: Array<{
      total_purchase: number;
      total_supply: number;
      margin: number;
    }> }).order_items || [];
    for (const item of items) {
      vendorMap[vendor].purchase += item.total_purchase;
      vendorMap[vendor].supply += item.total_supply;
      vendorMap[vendor].margin += item.margin;
      vendorMap[vendor].count++;
    }
  }

  const vendorRows: (string | number)[][] = [];
  vendorRows.push([`${branchName} - ${year}년 ${mon}월 거래처별 요약`]);
  vendorRows.push([]);
  vendorRows.push(["거래처", "품목 수", "총 매입가", "총 납품가", "총 마진", "마진율(%)"]);

  for (const [vendor, data] of Object.entries(vendorMap).sort((a, b) => b[1].supply - a[1].supply)) {
    const marginRate = data.supply > 0 ? ((data.margin / data.supply) * 100).toFixed(1) : "0";
    vendorRows.push([vendor, data.count, data.purchase, data.supply, data.margin, Number(marginRate)]);
  }

  const ws3 = XLSX.utils.aoa_to_sheet(vendorRows);
  ws3["!cols"] = [
    { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, `거래처별 요약`);

  // Generate buffer
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const fileName = encodeURIComponent(`${branchName}_${year}년${mon}월_거래명세서.xlsx`);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
    },
  });
}
