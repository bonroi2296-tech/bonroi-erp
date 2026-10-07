import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 저장소에 둘 수 없는 값(계좌번호·거래처 담당자)을 환경변수에서 읽는다. 형식이 깨져도 명세서는 나가게 한다.
function privateValues(): { bankInfo?: string; branchExtra?: Record<string, { phone: string; receiver: string }> } {
  try {
    return JSON.parse(process.env.INVOICE_PRIVATE || "{}");
  } catch {
    console.error("[invoice] INVOICE_PRIVATE 형식이 JSON 이 아니다 — 계좌·담당자 칸은 빈칸으로 나간다");
    return {};
  }
}

// 본로이 (공급자) 정보
const SUPPLIER = {
  name: "본로이",
  bizNo: "463-35-00902",
  ceo: "강주영",
  address: "서울시 강서구 강서로 385, 613호",
  phone: "070-7500-7795",
  fax: "02-6455-7049",
  // 계좌번호와 거래처 담당자 이름은 저장소에 두지 않는다 — 이 저장소는 «공개»다(2026-09-23).
  //   값은 Vercel 환경변수 INVOICE_PRIVATE(JSON)에 있다:
  //   {"bankInfo":"…","branchExtra":{"병원이름":{"phone":"…","receiver":"…"}}}
  //   없으면 그 칸만 빈칸으로 나간다(명세서 생성 자체는 계속 된다).
  bankInfo: privateValues().bankInfo || "",
};

// 병원별 추가 정보 — 담당자 실명·지점 전화는 남의 개인정보라 환경변수에서 읽는다.
const BRANCH_EXTRA: Record<string, { phone: string; receiver: string }> =
  privateValues().branchExtra || {};

// raw_product_name에서 품목명/규격 분리
function splitProductName(
  raw: string,
  product?: { name: string; spec: string | null } | null,
): { name: string; spec: string } {
  const parts = raw.split(" ㅡ ");
  if (parts.length >= 2) {
    return { name: parts[0].trim(), spec: parts.slice(1).join(" ㅡ ").trim() };
  }
  // 구분자가 없는 이름: 등록된 제품의 품목명/규격으로 나눈다
  const spec = product?.spec?.trim();
  if (spec && raw.trim().endsWith(spec)) {
    return { name: raw.trim().slice(0, -spec.length).trim(), spec };
  }
  if (product?.name && spec) {
    return { name: product.name.trim(), spec };
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

  // 현재 앱은 비로그인(anon)으로 운영하므로 인증 게이트는 두지 않는다.
  // 로그인 도입(PROJECT_CONTEXT 결정#1) 시 여기서 user 확인을 복구할 것.

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
        raw_product_name, quantity, supply_price, total_supply, edi_code,
        products ( name, spec, edi_code )
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
      products: { name: string; spec: string | null; edi_code: string | null } | null;
    }> }).order_items || [];

    for (const item of items) {
      const rawName = item.raw_product_name;
      // 병원에 청구한 건 전부 나온다 — 반품(마이너스)도 포함.
      // 빼는 건 "거래처에만 내는 돈"뿐: 배송비·할인·마일리지 줄 중 청구액이 0인 것.
      const billed = (item.total_supply || 0) !== 0;
      const vendorOnly = /배송비|할인|마일리지/.test(rawName);
      if (!billed && vendorOnly) continue;

      // 주문 저장 시 이름이 한 덩어리로 들어간 건이 있어 구분자로 못 나눈다. 그때는 제품 정보로 나눈다.
      const { name, spec } = splitProductName(rawName, item.products);
      dateGroups.get(dateKey)!.push({
        name,
        spec,
        qty: item.quantity,
        price: item.supply_price,
        edi: item.edi_code || item.products?.edi_code || "",
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
  // 배치·서식은 기존 수기 양식(260804_신촌면력한방병원_거래명세서.xlsx)에 맞췄다.
  // 열: B=EDI코드 C=품목명 D=규격 E=수량 F=단가 G=공급가액 H=세액
  const ws2 = wb.addWorksheet("거래명세서 양식");

  // 한글은 한 글자가 영문 두 칸 폭을 먹는다. 실제 값 길이로 열너비를 잡는다.
  const cellW = (s: unknown) => {
    const t = String(s ?? "");
    let n = 0;
    for (const ch of t) n += /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch) ? 2 : 1;
    return n;
  };
  const fit = (values: unknown[], min: number, max: number) =>
    Math.min(max, Math.max(min, ...values.map((v) => cellW(v) + 2)));

  const allItems = Array.from(dateGroups.values()).flat();
  const dateLabels = Array.from(dateGroups.keys()).map((d) => `${d} 발주건`);
  const won = (n: number) => n.toLocaleString("ko-KR");

  ws2.getColumn(1).width = 2.2;
  ws2.getColumn(2).width = fit([...allItems.map((i) => i.edi), "EDI 코드"], 10, 18);
  ws2.getColumn(3).width = fit([...allItems.map((i) => i.name), ...dateLabels, "품목명"], 20, 45);
  ws2.getColumn(4).width = fit([...allItems.map((i) => i.spec), "규격"], 10, 24);
  ws2.getColumn(5).width = fit([...allItems.map((i) => i.qty), "수량"], 7, 12);
  ws2.getColumn(6).width = fit([...allItems.map((i) => won(i.price)), "단가"], 10, 16);
  ws2.getColumn(7).width = fit([...allItems.map((i) => won(i.qty * i.price)), "공급가액", "총합계 (부가세포함)"], 12, 18);
  ws2.getColumn(8).width = fit([...allItems.map((i) => won(Math.round(i.qty * i.price * 0.1))), "세액"], 10, 16);
  ws2.getColumn(9).width = 3.0;

  const MED = { style: "medium" as const };
  const THIN = { style: "thin" as const };
  // 표 안쪽은 얇게. 굵은 선은 색칠된 칸과 문서 바깥 틀에만 쓴다(눈이 덜 아프다).
  const frame = (r1: number, r2: number, c1 = 2, c2 = 8) => {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        ws2.getRow(r).getCell(c).border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  };
  // 마지막에 한 번 호출해 바깥 둘레만 굵게 덮어쓴다.
  const outline = (r1: number, r2: number, c1 = 2, c2 = 8) => {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const cell = ws2.getRow(r).getCell(c);
        const b = cell.border ?? {};
        cell.border = {
          top: r === r1 ? MED : b.top,
          bottom: r === r2 ? MED : b.bottom,
          left: c === c1 ? MED : b.left,
          right: c === c2 ? MED : b.right,
        };
      }
  };
  type PutOpt = {
    size?: number; bold?: boolean; fill?: boolean;
    align?: "left" | "center" | "right"; wrap?: boolean; numFmt?: string;
  };
  const put = (r: number, c: number, v: ExcelJS.CellValue, o: PutOpt = {}) => {
    const cell = ws2.getRow(r).getCell(c);
    if (v !== undefined && v !== null) cell.value = v;
    cell.font = { name: "맑은 고딕", size: o.size ?? 10, bold: !!o.bold };
    cell.alignment = { horizontal: o.align ?? "center", vertical: "middle", wrapText: !!o.wrap };
    if (o.fill) {
      cell.fill = lightGreenFill;
      cell.border = { top: MED, bottom: MED, left: MED, right: MED }; // 색칸은 굵게
    }
    if (o.numFmt) cell.numFmt = o.numFmt;
    return cell;
  };

  const invoiceLastDataRow = 9 + totalDataRows;
  const totalSumRow = invoiceLastDataRow + 1;

  // 행 높이 — 원본 양식과 동일
  ws2.getRow(1).height = 17.25;
  ws2.getRow(2).height = 38.25;
  [3, 4, 5, 8].forEach((r) => (ws2.getRow(r).height = 20.25));
  ws2.getRow(6).height = 34.5;
  ws2.getRow(7).height = 30.75;
  ws2.getRow(9).height = 28.5;
  for (let r = 10; r <= invoiceLastDataRow; r++) ws2.getRow(r).height = 18;

  // === Row 2: 제목 ===
  ws2.mergeCells("B2:H2");
  frame(2, 2);
  put(2, 2, "거 래 명 세 서", { size: 24, bold: true });

  // === Row 3: 발행일 / 공급자 ===
  frame(3, 8);
  put(3, 2, "발 행 일", { size: 11, bold: true, wrap: true });
  ws2.mergeCells("C3:D3");
  put(3, 3, new Date(), { bold: true, numFmt: 'yyyy"년" m"월" d"일";@' });
  ws2.mergeCells("E3:H3");
  put(3, 5, "공 급 자", { bold: true, fill: true });

  // === Row 4-5: 상호 / 사업자번호 / 업체명 / 대표 ===
  ws2.mergeCells("B4:B5");
  put(4, 2, "상 호", { size: 11, bold: true });
  ws2.mergeCells("C4:D5");
  put(4, 3, branchName, { size: 11, bold: true });
  put(4, 5, "사업자번호", { size: 9, bold: true, fill: true });
  ws2.mergeCells("F4:H4");
  put(4, 6, SUPPLIER.bizNo, { bold: true });
  put(5, 5, "업체명", { bold: true, fill: true });
  put(5, 6, SUPPLIER.name, {});
  put(5, 7, "대 표", { bold: true, fill: true });
  put(5, 8, `${SUPPLIER.ceo}  (인)`, {});

  // === Row 6: 주소 ===
  put(6, 2, "주 소", { size: 11, bold: true, wrap: true });
  ws2.mergeCells("C6:D6");
  put(6, 3, branchAddress, { wrap: true });
  put(6, 5, "주 소", { bold: true, fill: true });
  ws2.mergeCells("F6:H6");
  put(6, 6, SUPPLIER.address, { wrap: true });

  // === Row 7: 총합계 / 전화 / 팩스 ===
  put(7, 2, "총 합계\n(VAT 포함)", { size: 12, bold: true, fill: true, wrap: true });
  ws2.mergeCells("C7:D7");
  put(7, 3, { formula: `G${totalSumRow}` }, {
    size: 12, bold: true, fill: true, numFmt: '"₩"#,##0_);[Red]("₩"#,##0)',
  });
  put(7, 5, "전화", { bold: true, fill: true });
  put(7, 6, SUPPLIER.phone, { size: 9 });
  put(7, 7, "팩스", { bold: true, fill: true });
  put(7, 8, SUPPLIER.fax, { size: 9 });

  // === Row 8: 입금계좌 ===
  ws2.mergeCells("C8:H8");
  put(8, 2, "", {});
  put(8, 3, SUPPLIER.bankInfo, { bold: true });

  // === Row 9: 품목 머리글 ===
  frame(9, 9);
  const HEADERS: [number, string][] = [
    [2, "EDI 코드"], [3, "품목명"], [4, "규격"], [5, "수량"],
    [6, "단가"], [7, "공급가액"], [8, "세액"],
  ];
  HEADERS.forEach(([c, label]) => put(9, c, label, { bold: true, fill: true }));

  // === Row 10+: 품목 ===
  const WON = '_-[$₩-412]* #,##0_-;\-[$₩-412]* #,##0_-;_-[$₩-412]* "-"??_-;_-@_-';
  let invoiceRow = 10;
  const dataStartInSheet1 = 15;

  for (let i = 0; i < rowTypes.length; i++) {
    const s1 = dataStartInSheet1 + i;
    frame(invoiceRow, invoiceRow);

    if (rowTypes[i] === "date") {
      // 날짜 구분 행 — B~H 통째로
      ws2.mergeCells(invoiceRow, 2, invoiceRow, 8);
      put(invoiceRow, 2, { formula: `'자료입력'!C${s1}` }, { bold: true, fill: true });
    } else {
      put(invoiceRow, 2, { formula: `'자료입력'!I${s1}` }, {});                        // EDI
      put(invoiceRow, 3, { formula: `'자료입력'!C${s1}` }, { align: "left", wrap: true }); // 품목명
      put(invoiceRow, 4, { formula: `'자료입력'!F${s1}` }, { wrap: true });               // 규격
      put(invoiceRow, 5, { formula: `'자료입력'!G${s1}` }, {});                          // 수량
      put(invoiceRow, 6, { formula: `'자료입력'!H${s1}` }, { align: "right", numFmt: "#,##0" });
      put(invoiceRow, 7, { formula: `E${invoiceRow}*F${invoiceRow}` }, { align: "right", numFmt: WON });
      put(invoiceRow, 8, { formula: `E${invoiceRow}*F${invoiceRow}*10%` }, { align: "right", numFmt: WON });
    }
    invoiceRow++;
  }

  // === 총합계 행 ===
  const sumRowNum = invoiceRow;
  ws2.getRow(sumRowNum).height = 17.25;
  frame(sumRowNum, sumRowNum);
  ws2.mergeCells(sumRowNum, 2, sumRowNum, 6);
  put(sumRowNum, 2, "총합계 (부가세포함)", { bold: true, fill: true });
  ws2.mergeCells(sumRowNum, 7, sumRowNum, 8);
  put(sumRowNum, 7, { formula: `SUM(G10:G${sumRowNum - 1},H10:H${sumRowNum - 1})` },
      { bold: true, fill: true, align: "right", numFmt: WON });

  // === 비고 ===
  const noteLabelRow = sumRowNum + 1;
  ws2.getRow(noteLabelRow).height = 17.25;
  frame(noteLabelRow, noteLabelRow);
  ws2.mergeCells(noteLabelRow, 2, noteLabelRow, 8);
  put(noteLabelRow, 2, "비 고", { bold: true, fill: true });

  const noteRow = noteLabelRow + 1;
  for (let r = noteRow; r <= noteRow + 2; r++) ws2.getRow(r).height = 16.5;
  frame(noteRow, noteRow + 2);
  ws2.mergeCells(noteRow, 2, noteRow + 2, 8);
  put(noteRow, 2, `1. 입금계좌: ${SUPPLIER.bankInfo}\n2. 미수금:`, { size: 9, align: "left", wrap: true });

  // 병합된 색칸(공급자·총합계·머리글·비고)은 병합 범위 전체에 굵은 선을 둘러야
  // 엑셀에서 테두리가 끊기지 않는다.
  const medBox = (r1: number, r2: number, c1: number, c2: number) => {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        ws2.getRow(r).getCell(c).border = { top: MED, bottom: MED, left: MED, right: MED };
  };
  medBox(3, 3, 5, 8);                              // 공 급 자
  medBox(4, 4, 6, 8);                              // 사업자번호 값
  medBox(6, 6, 6, 8);                              // 공급자 주소 값
  medBox(7, 7, 3, 4);                              // 총 합계 금액
  medBox(9, 9, 2, 8);                              // 품목 머리글 줄
  medBox(sumRowNum, sumRowNum, 2, 8);              // 총합계 줄
  medBox(noteLabelRow, noteLabelRow, 2, 8);        // 비 고 줄

  // 문서 바깥 둘레만 굵게 (제목~비고 박스 끝까지)
  outline(2, noteRow + 2);

  // 파일을 열면 '자료입력'이 아니라 명세서가 먼저 보이게 한다.
  // (자료입력은 수식이 참조하는 원본 데이터 시트라 서식이 없다)
  wb.views = [{ activeTab: 1, x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, visibility: "visible" }];
  ws2.views = [{ showGridLines: false }];

  // 인쇄 설정 — 원본 여백에 맞춤
  ws2.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.236, right: 0.236, top: 0.748, bottom: 0.748, header: 0.3, footer: 0.3 },
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
