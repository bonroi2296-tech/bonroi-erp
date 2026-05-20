import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 본로이 (공급자) 정보
const SUPPLIER = {
  name: "본로이",
  bizNo: "463-35-00902",
  ceo: "강주영",
  address: "서울시 강서구 강서로 385, 613호",
  phone: "070-7500-7795",
  fax: "02-6455-7049",
  bankInfo: "기업 011-129417-04-020   예 금 주 : 본 로 이",
};

// 병원별 추가 정보
const BRANCH_EXTRA: Record<string, { phone: string; receiver: string }> = {
  "광명면력한방병원": { phone: "0507-1331-1076", receiver: "황미숙" },
  "강서면력한방병원": { phone: "", receiver: "" },
  "신촌면력한방병원": { phone: "", receiver: "" },
};

// raw_product_name에서 품목명/규격 분리
function splitProductName(raw: string): { name: string; spec: string } {
  const parts = raw.split(" ㅡ ");
  if (parts.length >= 2) {
    return { name: parts[0].trim(), spec: parts.slice(1).join(" ㅡ ").trim() };
  }
  return { name: raw.trim(), spec: "" };
}

// 공통 테두리 스타일
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

// 연한 초록 배경색 (참조 서식 theme 6 tint 0.8 근사값)
const lightGreenFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2EFDA" },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function styleHeaderCell(cell: ExcelJS.Cell, fontSize = 11, bold = true) {
  cell.font = { name: "맑은 고딕", size: fontSize, bold };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function styleDataCell(cell: ExcelJS.Cell, fontSize = 10, horizontal: "left" | "center" | "right" = "left") {
  cell.font = { name: "맑은 고딕", size: fontSize };
  cell.alignment = { horizontal, vertical: "middle", wrapText: true };
  cell.border = thinBorder;
}

// 자료입력 시트용 스타일 (폰트: 굴림)
function styleSheet1Header(cell: ExcelJS.Cell, fontSize = 11, bold = true) {
  cell.font = { name: "굴림", size: fontSize, bold };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function styleSheet1Data(cell: ExcelJS.Cell, fontSize = 10, horizontal: "left" | "center" | "right" = "left") {
  cell.font = { name: "굴림", size: fontSize };
  cell.alignment = { horizontal, vertical: "middle", wrapText: true };
  cell.border = thinBorder;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const branchId = searchParams.get("branch");

  if (!month || !branchId) {
    return NextResponse.json({ error: "month and branch required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // 인증 확인 — 로그인하지 않은 요청 차단
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const endMonth = mon === 12 ? 1 : mon + 1;
  const endYear = mon === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  // 브랜치 정보
  const { data: branchData } = await supabase
    .from("branches")
    .select("name, address")
    .eq("id", branchId)
    .single();

  if (!branchData) {
    return NextResponse.json({ error: "병원 정보 없음" }, { status: 404 });
  }

  const branchName = branchData.name;
  const branchAddress = branchData.address || "";
  const branchExtra = BRANCH_EXTRA[branchName] || { phone: "", receiver: "" };

  // 주문 + 아이템 조회
  const { data: orders } = await supabase
    .from("orders")
    .select(`
      id, order_number, order_date, vendor_name,
      order_items (
        raw_product_name, quantity, supply_price, total_supply, edi_code
      )
    `)
    .eq("branch_id", branchId)
    .gte("order_date", startDate)
    .lt("order_date", endDate)
    .order("order_date", { ascending: true });

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: "해당 기간 주문 내역이 없습니다." }, { status: 404 });
  }

  // 날짜별 아이템 그룹핑
  interface ItemRow {
    name: string;
    spec: string;
    qty: number;
    price: number;
    edi: string;
  }
  const dateGroups: Map<string, ItemRow[]> = new Map();

  for (const order of orders) {
    const dateKey = order.order_date as string;
    if (!dateGroups.has(dateKey)) dateGroups.set(dateKey, []);
    const items = (order as { order_items: Array<{
      raw_product_name: string;
      quantity: number;
      supply_price: number;
      total_supply: number;
      edi_code: string;
    }> }).order_items || [];

    for (const item of items) {
      const rawName = item.raw_product_name;
      if (rawName === "배송비" || rawName === "대량구매 할인" || rawName === "마일리지 소모" || rawName.includes("반품")) continue;

      const { name, spec } = splitProductName(rawName);
      dateGroups.get(dateKey)!.push({
        name,
        spec,
        qty: item.quantity,
        price: item.supply_price,
        edi: item.edi_code || "",
      });
    }
  }

  // 엑셀 워크북 생성
  const wb = new ExcelJS.Workbook();

  // ========== Sheet 1: 자료입력 ==========
  const ws1 = wb.addWorksheet("자료입력");

  // 열 너비
  ws1.getColumn(1).width = 5.5;
  ws1.getColumn(2).width = 16;
  ws1.getColumn(3).width = 12;
  ws1.getColumn(4).width = 9.5;
  ws1.getColumn(5).width = 22.5;
  ws1.getColumn(6).width = 15.5;
  ws1.getColumn(7).width = 15.5;
  ws1.getColumn(8).width = 13;
  ws1.getColumn(9).width = 12;
  ws1.getColumn(10).width = 14.5;

  // Row 2: 공급자 / 공급받는자 헤더 (폰트: 굴림 14)
  const r2 = ws1.getRow(2);
  r2.getCell(2).value = "공급자";
  r2.getCell(2).font = { name: "굴림", size: 14, bold: true };
  r2.getCell(7).value = "공급받는자";
  r2.getCell(7).font = { name: "굴림", size: 14, bold: true };

  // 공급자 정보 (B4-B9) - 폰트: 굴림
  const supplierRows: [string, string][] = [
    ["상호", SUPPLIER.name],
    ["사업자등록번호", SUPPLIER.bizNo],
    ["대표자성명", SUPPLIER.ceo],
    ["주소", SUPPLIER.address],
    ["전화", SUPPLIER.phone],
    ["팩스", SUPPLIER.fax],
  ];

  // 공급받는자 정보 (G4-G9)
  const receiverRows: [string, string][] = [
    ["상호", branchName],
    ["주소", branchAddress],
    ["전화번호", branchExtra.phone],
    [],
    ["인수자", branchExtra.receiver],
    ["납품자", SUPPLIER.name],
  ] as [string, string][];

  for (let i = 0; i < supplierRows.length; i++) {
    const row = ws1.getRow(4 + i);
    row.getCell(2).value = supplierRows[i][0];
    styleSheet1Header(row.getCell(2), 11);
    ws1.mergeCells(4 + i, 3, 4 + i, 5);
    row.getCell(3).value = supplierRows[i][1];
    styleSheet1Data(row.getCell(3), 11, "center");

    if (receiverRows[i] && receiverRows[i].length === 2) {
      row.getCell(7).value = receiverRows[i][0];
      styleSheet1Header(row.getCell(7), 11);
      ws1.mergeCells(4 + i, 8, 4 + i, 10);
      row.getCell(8).value = receiverRows[i][1];
      styleSheet1Data(row.getCell(8), 11, "center");
    }
  }

  // Row 11: "자료입력" 라벨
  ws1.getRow(11).getCell(2).value = "자료입력";
  ws1.getRow(11).getCell(2).font = { name: "굴림", size: 11, bold: true };

  // Row 13: 작성일
  ws1.getRow(13).getCell(2).value = "작성일,일시";
  styleSheet1Header(ws1.getRow(13).getCell(2), 10);
  ws1.mergeCells(13, 3, 13, 4);
  const today = new Date();
  ws1.getRow(13).getCell(3).value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  styleSheet1Data(ws1.getRow(13).getCell(3), 10, "center");

  // Row 14: 컬럼 헤더
  ws1.mergeCells(14, 3, 14, 5);
  const headers14 = [
    { col: 3, text: "품목" },
    { col: 6, text: "규격" },
    { col: 7, text: "수량" },
    { col: 8, text: "단가" },
    { col: 9, text: "EDI 코드" },
    { col: 10, text: "발행금액" },
  ];
  for (const h of headers14) {
    const cell = ws1.getRow(14).getCell(h.col);
    cell.value = h.text;
    styleSheet1Header(cell, 10);
  }

  // Row 15+: 아이템 데이터
  let dataRow = 15;
  let itemNum = 1;
  const rowTypes: Array<"date" | "item"> = [];

  for (const [dateStr, items] of Array.from(dateGroups.entries())) {
    // 날짜 헤더 행 — 전체 날짜 + "발주건"
    const dateHeaderRow = ws1.getRow(dataRow);
    dateHeaderRow.getCell(2).value = `품목 ${itemNum}`;
    styleSheet1Data(dateHeaderRow.getCell(2), 10, "center");
    ws1.mergeCells(dataRow, 3, dataRow, 5);
    dateHeaderRow.getCell(3).value = `${dateStr} 발주건`;
    styleSheet1Data(dateHeaderRow.getCell(3), 10, "left");
    dateHeaderRow.getCell(10).value = { formula: `G${dataRow}*H${dataRow}` };
    styleSheet1Data(dateHeaderRow.getCell(10), 10, "right");
    dateHeaderRow.getCell(10).numFmt = "#,##0";
    rowTypes.push("date");
    dataRow++;
    itemNum++;

    // 아이템 행들
    for (const item of items) {
      const row = ws1.getRow(dataRow);
      row.getCell(2).value = `품목 ${itemNum}`;
      styleSheet1Data(row.getCell(2), 10, "center");
      ws1.mergeCells(dataRow, 3, dataRow, 5);
      row.getCell(3).value = item.name;
      styleSheet1Data(row.getCell(3), 10, "left");
      row.getCell(6).value = item.spec;
      styleSheet1Data(row.getCell(6), 10, "center");
      row.getCell(7).value = item.qty;
      styleSheet1Data(row.getCell(7), 10, "center");
      row.getCell(7).numFmt = "#,##0";
      row.getCell(8).value = item.price;
      styleSheet1Data(row.getCell(8), 10, "right");
      row.getCell(8).numFmt = "#,##0";
      row.getCell(9).value = item.edi;
      styleSheet1Data(row.getCell(9), 10, "center");
      row.getCell(10).value = { formula: `G${dataRow}*H${dataRow}` };
      styleSheet1Data(row.getCell(10), 10, "right");
      row.getCell(10).numFmt = "#,##0";
      rowTypes.push("item");
      dataRow++;
      itemNum++;
    }
  }

  const totalDataRows = dataRow - 15;
  const lastDataRow = dataRow - 1;

  // 합계 행들
  const sumRow1 = dataRow + 1;
  const sumRow2 = dataRow + 2;
  ws1.mergeCells(sumRow1, 6, sumRow1, 10);
  ws1.getRow(sumRow1).getCell(6).value = { formula: `SUM(J15:J${lastDataRow})` };
  ws1.getRow(sumRow1).getCell(6).numFmt = "#,##0";
  styleSheet1Data(ws1.getRow(sumRow1).getCell(6), 11, "right");
  ws1.getRow(sumRow1).getCell(6).font = { name: "굴림", size: 11, bold: true };

  ws1.mergeCells(sumRow2, 6, sumRow2, 10);
  ws1.getRow(sumRow2).getCell(6).value = { formula: `F${sumRow1}*1.1` };
  ws1.getRow(sumRow2).getCell(6).numFmt = "#,##0";
  styleSheet1Data(ws1.getRow(sumRow2).getCell(6), 11, "right");
  ws1.getRow(sumRow2).getCell(6).font = { name: "굴림", size: 11, bold: true };

  // ========== Sheet 2: 거래명세서 양식 ==========
  const ws2 = wb.addWorksheet("거래명세서 양식");

  // 열 너비
  ws2.getColumn(1).width = 2;
  ws2.getColumn(2).width = 5.5;
  ws2.getColumn(3).width = 11;
  ws2.getColumn(4).width = 14;
  ws2.getColumn(5).width = 11;
  ws2.getColumn(6).width = 7;
  ws2.getColumn(7).width = 11;
  ws2.getColumn(8).width = 13;
  ws2.getColumn(9).width = 10;
  ws2.getColumn(10).width = 13;

  // === Row 2: 타이틀 ===
  ws2.mergeCells("B2:J2");
  const titleCell = ws2.getRow(2).getCell(2);
  titleCell.value = "거 래 명 세 서";
  titleCell.font = { name: "맑은 고딕", size: 24, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.border = {
    top: { style: "medium" },
    left: { style: "medium" },
    right: { style: "medium" },
  };
  ws2.getRow(2).height = 45;

  // === Row 3: 발행일, 공급자 ===
  ws2.getRow(3).getCell(2).value = "발 행 일";
  styleHeaderCell(ws2.getRow(3).getCell(2), 11);
  ws2.getRow(3).getCell(2).border = { ...thinBorder, left: { style: "medium" } };

  ws2.mergeCells("C3:E3");
  // 발행일 = 오늘 날짜 (Date 객체 + numFmt)
  ws2.getRow(3).getCell(3).value = new Date();
  ws2.getRow(3).getCell(3).numFmt = 'yyyy"년" m"월" d"일";@';
  ws2.getRow(3).getCell(3).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(3).getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(3).getCell(3).border = thinBorder;

  // 공급자 — F3:J3 병합
  ws2.mergeCells("F3:J3");
  ws2.getRow(3).getCell(6).value = "공 급 자";
  ws2.getRow(3).getCell(6).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(3).getCell(6).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(3).getCell(6).border = { ...thinBorder, right: { style: "medium" } };
  ws2.getRow(3).getCell(6).fill = lightGreenFill;

  // === Row 4-5: 상호/사업자번호/업체명/대표 ===
  // Row 4
  ws2.mergeCells("B4:B5");
  ws2.getRow(4).getCell(2).value = "상 호";
  styleHeaderCell(ws2.getRow(4).getCell(2), 11);
  ws2.getRow(4).getCell(2).border = { ...thinBorder, left: { style: "medium" } };

  ws2.mergeCells("C4:E5");
  ws2.getRow(4).getCell(3).value = branchName;
  ws2.getRow(4).getCell(3).font = { name: "맑은 고딕", size: 11, bold: true };
  ws2.getRow(4).getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(4).getCell(3).border = thinBorder;

  ws2.getRow(4).getCell(6).value = "사업자번호";
  ws2.getRow(4).getCell(6).font = { name: "맑은 고딕", size: 9, bold: true };
  ws2.getRow(4).getCell(6).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(4).getCell(6).border = thinBorder;
  ws2.getRow(4).getCell(6).fill = lightGreenFill;

  ws2.mergeCells("G4:J4");
  ws2.getRow(4).getCell(7).value = SUPPLIER.bizNo;
  styleDataCell(ws2.getRow(4).getCell(7), 10, "center");
  ws2.getRow(4).getCell(7).border = { ...thinBorder, right: { style: "medium" } };

  // Row 5
  ws2.getRow(5).getCell(6).value = "업체명";
  ws2.getRow(5).getCell(6).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(5).getCell(6).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(5).getCell(6).border = thinBorder;
  ws2.getRow(5).getCell(6).fill = lightGreenFill;

  ws2.getRow(5).getCell(7).value = SUPPLIER.name;
  ws2.getRow(5).getCell(7).font = { name: "맑은 고딕", size: 10 };
  ws2.getRow(5).getCell(7).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(5).getCell(7).border = thinBorder;

  ws2.getRow(5).getCell(8).value = "대 표";
  ws2.getRow(5).getCell(8).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(5).getCell(8).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(5).getCell(8).border = thinBorder;
  ws2.getRow(5).getCell(8).fill = lightGreenFill;

  ws2.mergeCells("I5:J5");
  ws2.getRow(5).getCell(9).value = `${SUPPLIER.ceo}  (인)`;
  ws2.getRow(5).getCell(9).font = { name: "맑은 고딕", size: 10 };
  ws2.getRow(5).getCell(9).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(5).getCell(9).border = { ...thinBorder, right: { style: "medium" } };

  // === Row 6: 주소 ===
  ws2.getRow(6).getCell(2).value = "주 소";
  styleHeaderCell(ws2.getRow(6).getCell(2), 11);
  ws2.getRow(6).getCell(2).border = { ...thinBorder, left: { style: "medium" } };

  ws2.mergeCells("C6:E6");
  ws2.getRow(6).getCell(3).value = branchAddress;
  ws2.getRow(6).getCell(3).font = { name: "맑은 고딕", size: 12, bold: true };
  ws2.getRow(6).getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(6).getCell(3).border = thinBorder;

  ws2.getRow(6).getCell(6).value = "주 소";
  ws2.getRow(6).getCell(6).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(6).getCell(6).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(6).getCell(6).border = thinBorder;
  ws2.getRow(6).getCell(6).fill = lightGreenFill;

  ws2.mergeCells("G6:J6");
  ws2.getRow(6).getCell(7).value = SUPPLIER.address;
  ws2.getRow(6).getCell(7).font = { name: "맑은 고딕", size: 10 };
  ws2.getRow(6).getCell(7).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(6).getCell(7).border = { ...thinBorder, right: { style: "medium" } };

  // === Row 7: 총합계 / 전화 / 팩스 ===
  ws2.getRow(7).getCell(2).value = "총 합계\n(VAT 포함)";
  ws2.getRow(7).getCell(2).font = { name: "맑은 고딕", size: 12, bold: true };
  ws2.getRow(7).getCell(2).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws2.getRow(7).getCell(2).border = { ...thinBorder, left: { style: "medium" } };
  ws2.getRow(7).getCell(2).fill = lightGreenFill;

  ws2.mergeCells("C7:E7");
  const invoiceLastDataRow = 9 + totalDataRows;
  const totalSumRow = invoiceLastDataRow + 1;
  ws2.getRow(7).getCell(3).value = { formula: `E${totalSumRow}+H${totalSumRow}` };
  ws2.getRow(7).getCell(3).numFmt = '"₩"#,##0_);[Red]("₩"#,##0)';
  ws2.getRow(7).getCell(3).font = { name: "맑은 고딕", size: 12, bold: true };
  ws2.getRow(7).getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(7).getCell(3).border = thinBorder;
  ws2.getRow(7).getCell(3).fill = lightGreenFill;

  ws2.getRow(7).getCell(6).value = "전화";
  ws2.getRow(7).getCell(6).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(7).getCell(6).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(7).getCell(6).border = thinBorder;
  ws2.getRow(7).getCell(6).fill = lightGreenFill;

  ws2.getRow(7).getCell(7).value = SUPPLIER.phone;
  ws2.getRow(7).getCell(7).font = { name: "맑은 고딕", size: 9 };
  ws2.getRow(7).getCell(7).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(7).getCell(7).border = thinBorder;

  ws2.getRow(7).getCell(8).value = "팩스";
  ws2.getRow(7).getCell(8).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(7).getCell(8).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(7).getCell(8).border = thinBorder;
  ws2.getRow(7).getCell(8).fill = lightGreenFill;

  ws2.mergeCells("I7:J7");
  ws2.getRow(7).getCell(9).value = SUPPLIER.fax;
  ws2.getRow(7).getCell(9).font = { name: "맑은 고딕", size: 9 };
  ws2.getRow(7).getCell(9).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(7).getCell(9).border = { ...thinBorder, right: { style: "medium" } };
  ws2.getRow(7).height = 30;

  // === Row 8: 계좌번호 (center 정렬) ===
  ws2.mergeCells("B8:D8");
  ws2.getRow(8).getCell(2).value = SUPPLIER.bankInfo;
  ws2.getRow(8).getCell(2).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(8).getCell(2).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(8).getCell(2).border = { ...thinBorder, left: { style: "medium" } };

  // === Row 9: 컬럼 헤더 (배경색 추가) ===
  ws2.mergeCells("B9:D9");
  ws2.getRow(9).getCell(2).value = "품    명";
  styleHeaderCell(ws2.getRow(9).getCell(2), 10);
  ws2.getRow(9).getCell(2).border = { ...thinBorder, left: { style: "medium" } };
  ws2.getRow(9).getCell(2).fill = lightGreenFill;

  ws2.getRow(9).getCell(5).value = "규격";
  styleHeaderCell(ws2.getRow(9).getCell(5), 10);
  ws2.getRow(9).getCell(5).fill = lightGreenFill;

  ws2.getRow(9).getCell(6).value = "수량";
  styleHeaderCell(ws2.getRow(9).getCell(6), 10);
  ws2.getRow(9).getCell(6).fill = lightGreenFill;

  ws2.getRow(9).getCell(7).value = "단가";
  styleHeaderCell(ws2.getRow(9).getCell(7), 10);
  ws2.getRow(9).getCell(7).fill = lightGreenFill;

  ws2.getRow(9).getCell(8).value = "공급가액";
  styleHeaderCell(ws2.getRow(9).getCell(8), 10);
  ws2.getRow(9).getCell(8).fill = lightGreenFill;

  ws2.getRow(9).getCell(9).value = "세액";
  styleHeaderCell(ws2.getRow(9).getCell(9), 10);
  ws2.getRow(9).getCell(9).fill = lightGreenFill;

  ws2.getRow(9).getCell(10).value = "EDI 코드";
  styleHeaderCell(ws2.getRow(9).getCell(10), 10);
  ws2.getRow(9).getCell(10).border = { ...thinBorder, right: { style: "medium" } };
  ws2.getRow(9).getCell(10).fill = lightGreenFill;
  ws2.getRow(9).height = 22;

  // === Row 10+: 데이터 행 ===
  let invoiceRow = 10;
  const dataStartInSheet1 = 15;

  for (let i = 0; i < rowTypes.length; i++) {
    const sheet1Row = dataStartInSheet1 + i;
    const row = ws2.getRow(invoiceRow);

    if (rowTypes[i] === "date") {
      // 날짜 헤더 행: B~J 전체 병합
      ws2.mergeCells(invoiceRow, 2, invoiceRow, 10);
      row.getCell(2).value = { formula: `'자료입력'!C${sheet1Row}` };
      row.getCell(2).font = { name: "맑은 고딕", size: 10, bold: true };
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(2).border = { ...thinBorder, left: { style: "medium" }, right: { style: "medium" } };
    } else {
      // 아이템 행
      ws2.mergeCells(invoiceRow, 2, invoiceRow, 4);
      row.getCell(2).value = { formula: `'자료입력'!C${sheet1Row}` };
      row.getCell(2).font = { name: "맑은 고딕", size: 10 };
      row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      row.getCell(2).border = { ...thinBorder, left: { style: "medium" } };

      row.getCell(5).value = { formula: `'자료입력'!F${sheet1Row}` };
      row.getCell(5).font = { name: "맑은 고딕", size: 10 };
      row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(5).border = thinBorder;

      row.getCell(6).value = { formula: `'자료입력'!G${sheet1Row}` };
      row.getCell(6).font = { name: "맑은 고딕", size: 10 };
      row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(6).border = thinBorder;

      row.getCell(7).value = { formula: `'자료입력'!H${sheet1Row}` };
      row.getCell(7).font = { name: "맑은 고딕", size: 10 };
      row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(7).border = thinBorder;
      row.getCell(7).numFmt = '"₩"#,##0';

      row.getCell(8).value = { formula: `F${invoiceRow}*G${invoiceRow}` };
      row.getCell(8).font = { name: "맑은 고딕", size: 10 };
      row.getCell(8).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(8).border = thinBorder;
      row.getCell(8).numFmt = '_-[$₩-412]* #,##0_-;\\-[$₩-412]* #,##0_-;_-[$₩-412]* "-"??_-;_-@_-';

      row.getCell(9).value = { formula: `F${invoiceRow}*G${invoiceRow}*10%` };
      row.getCell(9).font = { name: "맑은 고딕", size: 10 };
      row.getCell(9).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(9).border = thinBorder;
      row.getCell(9).numFmt = '_-[$₩-412]* #,##0_-;\\-[$₩-412]* #,##0_-;_-[$₩-412]* "-"??_-;_-@_-';

      row.getCell(10).value = { formula: `'자료입력'!I${sheet1Row}` };
      row.getCell(10).font = { name: "맑은 고딕", size: 10 };
      row.getCell(10).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(10).border = { ...thinBorder, right: { style: "medium" } };
    }
    invoiceRow++;
  }

  // === 합계 행 ===
  const sumRowNum = invoiceRow;
  const firstItemRow = 10;
  const lastItemRow = invoiceRow - 1;

  ws2.getRow(sumRowNum).getCell(2).value = "수 량";
  styleHeaderCell(ws2.getRow(sumRowNum).getCell(2), 10);
  ws2.getRow(sumRowNum).getCell(2).border = { ...thinBorder, left: { style: "medium" } };

  ws2.getRow(sumRowNum).getCell(3).value = { formula: `SUM(F${firstItemRow}:F${lastItemRow})` };
  ws2.getRow(sumRowNum).getCell(3).numFmt = "#,##0";
  ws2.getRow(sumRowNum).getCell(3).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(sumRowNum).getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(sumRowNum).getCell(3).border = thinBorder;

  ws2.getRow(sumRowNum).getCell(4).value = "공 급 가 액";
  styleHeaderCell(ws2.getRow(sumRowNum).getCell(4), 10);

  ws2.mergeCells(sumRowNum, 5, sumRowNum, 6);
  ws2.getRow(sumRowNum).getCell(5).value = { formula: `SUM(H${firstItemRow}:H${lastItemRow})` };
  ws2.getRow(sumRowNum).getCell(5).numFmt = '#,##0';
  ws2.getRow(sumRowNum).getCell(5).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(sumRowNum).getCell(5).alignment = { horizontal: "right", vertical: "middle" };
  ws2.getRow(sumRowNum).getCell(5).border = thinBorder;

  ws2.getRow(sumRowNum).getCell(7).value = "세액";
  styleHeaderCell(ws2.getRow(sumRowNum).getCell(7), 10);

  ws2.mergeCells(sumRowNum, 8, sumRowNum, 10);
  ws2.getRow(sumRowNum).getCell(8).value = { formula: `SUM(I${firstItemRow}:I${lastItemRow})` };
  ws2.getRow(sumRowNum).getCell(8).numFmt = '#,##0';
  ws2.getRow(sumRowNum).getCell(8).font = { name: "맑은 고딕", size: 10, bold: true };
  ws2.getRow(sumRowNum).getCell(8).alignment = { horizontal: "right", vertical: "middle" };
  ws2.getRow(sumRowNum).getCell(8).border = { ...thinBorder, right: { style: "medium" } };

  // === 기타 사항 ===
  const noteRow1 = sumRowNum + 1;
  ws2.mergeCells(noteRow1, 2, noteRow1, 10);
  ws2.getRow(noteRow1).getCell(2).value = "*기타 사항";
  ws2.getRow(noteRow1).getCell(2).font = { name: "맑은 고딕", size: 9 };
  ws2.getRow(noteRow1).getCell(2).border = { left: { style: "medium" }, right: { style: "medium" } };

  const noteRow2 = sumRowNum + 2;
  ws2.mergeCells(noteRow2, 2, noteRow2 + 2, 10);
  ws2.getRow(noteRow2).getCell(2).value = `1. 입금계좌: 기업은행 011-129417-04-020\n2. 예금주: 본로이\n3. 미수금:`;
  ws2.getRow(noteRow2).getCell(2).font = { name: "맑은 고딕", size: 9 };
  ws2.getRow(noteRow2).getCell(2).alignment = { vertical: "top", wrapText: true };
  ws2.getRow(noteRow2).getCell(2).border = {
    left: { style: "medium" },
    right: { style: "medium" },
    bottom: { style: "medium" },
  };

  // 인쇄 설정
  ws2.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };

  // 엑셀 버퍼 생성
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = encodeURIComponent(`${branchName}_${year}년${mon}월_거래명세서.xlsx`);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
    },
  });
}
