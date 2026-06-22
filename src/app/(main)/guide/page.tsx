"use client";

import TopBar from "@/components/TopBar";
import {
  Sparkles, ClipboardList, ShoppingCart, Package, TrendingDown, Truck,
  ShieldAlert, LayoutDashboard, PackageSearch, Settings, Lightbulb, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Section = {
  icon: LucideIcon;
  title: string;
  what: string;
  steps: string[];
  tip?: string;
};

// 하루 흐름(가장 자주 하는 일 순서)
const flow = [
  "병원에서 주문이 옴 (카톡·문자·엑셀·사진)",
  "확보 관리 → 주문 붙여넣기 에 그대로 붙여넣고 'AI 분석'",
  "추천 거래처로 자동 발주(체크) → '발주건 생성'",
  "거래처에 실제 발주 (전화·거래처 사이트 등, 시스템 밖)",
  "거래처가 보낸 출고확인서를 발주건에서 'AI 분석'으로 반영",
  "거래처 '완료' → 주문 내역(장부)에 자동으로 쌓임",
];

const sections: Section[] = [
  {
    icon: PackageSearch,
    title: "확보 관리 (신규 주문은 여기서 시작)",
    what: "병원 주문을 받아 여러 거래처로 나눠 발주하고, 확보(출고) 현황을 추적하는 핵심 화면입니다.",
    steps: [
      "상단 '주문 붙여넣기'(파란 버튼)로 새 주문을 시작하는 게 가장 빠릅니다.",
      "직접 한 줄씩 넣고 싶으면 '새 발주건'으로 제목·품목을 손으로 입력해도 됩니다.",
      "만들어진 발주건 카드를 누르면 상세(거래처 배정·출고 반영) 화면으로 들어갑니다.",
      "카드의 상태칩으로 '확보완료'인지 '부족 n건'인지 한눈에 보입니다.",
    ],
    tip: "옛날 '주문(기존)' 화면 대신 이제 신규 주문은 전부 여기서 시작합니다.",
  },
  {
    icon: Sparkles,
    title: "주문 붙여넣기 (AI가 품목·거래처까지 정리)",
    what: "카톡 텍스트나 주문서 사진을 던지면 AI가 품목을 뽑아 카탈로그에 매칭해 줍니다.",
    steps: [
      "주문 내용을 붙여넣거나, 사진을 Ctrl+V / 끌어다 놓기로 올립니다.",
      "'AI 분석'을 누르면 품목·수량·매칭 제품·추천 거래처가 채워집니다.",
      "매칭이 비어 있으면 위쪽 '추천 일괄 적용' 버튼으로 한 번에 채울 수 있습니다(줄별 '추천' 버튼도 있음).",
      "'AI 추천 거래처로 자동 발주'가 켜져 있으면, 발주건을 만들 때 거래처 배정까지 자동으로 끝납니다.",
      "제목을 적고 '확보 발주건 생성'을 누르면 끝.",
    ],
    tip: "초록 칩(70%+)은 거의 맞는 것, 주황·회색은 한 번 확인하세요. 자동 발주가 엉뚱하면 상세 화면에서 거래처를 지우거나 바꾸면 됩니다.",
  },
  {
    icon: ArrowRight,
    title: "확보 발주건 상세 (거래처 배정 · 출고확인서 반영)",
    what: "한 발주건 안에서 품목별로 어느 거래처에 얼마를 발주할지 정하고, 실제 출고를 반영합니다.",
    steps: [
      "품목 줄 왼쪽 체크박스로 여러 개를 고른 뒤 '선택 품목에 일괄 배정'으로 한 거래처에 한 번에 배정할 수 있습니다.",
      "한 줄만 바꿀 땐 줄을 펼쳐 '거래처 고르기' → 추천 칩을 누르면 단가·수량이 자동으로 채워집니다.",
      "거래처가 출고확인서를 보내오면, 그 거래처의 '출고확인서 반영'에서 텍스트·사진·PDF를 넣고 'AI 분석'.",
      "자동매칭된 줄은 그대로 두고, 주황색 칸(확인 필요)만 골라 고친 뒤 '반영'.",
      "거래처를 '완료' 처리하면 그 내용이 주문 내역(장부)에 자동으로 쌓입니다.",
    ],
    tip: "출고확인서 화면 위에 '자동매칭 n건 · 확인 필요 m건'이 표시됩니다. 주황칸만 보면 됩니다.",
  },
  {
    icon: ClipboardList,
    title: "주문 내역 (최종 장부 · 마진·정산 기준)",
    what: "실제로 납품된 모든 내역을 품목 단위로 보고, 필터·내보내기 하는 읽기 전용 장부입니다.",
    steps: [
      "위쪽 필터(기간·지점·거래처·구분·제품검색)로 원하는 범위만 봅니다. 마지막에 쓴 필터는 다음에 와도 그대로 유지됩니다.",
      "'거래처별 요약'을 펼치면 거래처마다 건수·매입·납품·마진·마진율이 한 표로 보입니다.",
      "표 머리(날짜·거래처·마진 등)를 누르면 정렬됩니다.",
      "'CSV' 버튼으로 현재 필터 기준 전체를 엑셀 파일로 받습니다.",
    ],
    tip: "거래처별 마진이 궁금하면 엑셀로 빼지 말고 '거래처별 요약'을 펼치세요.",
  },
  {
    icon: ShoppingCart,
    title: "주문(기존)",
    what: "예전에 쌓인 주문 220건을 조회·수정하는 화면입니다. 신규 입력은 막혀 있습니다.",
    steps: [
      "검색으로 주문번호·지점·거래처를 찾습니다.",
      "날짜+지점 그룹을 펼쳐 거래처별 주문을 봅니다.",
      "상태 드롭다운으로 진행 상태를 바꿀 수 있습니다(즉시 저장).",
      "주문번호를 누르면 품목 상세가 펼쳐집니다.",
    ],
    tip: "신규 주문은 여기가 아니라 '확보 관리'에서 시작합니다(상단 안내 배너 참고).",
  },
  {
    icon: Package,
    title: "제품 (카탈로그)",
    what: "취급 품목의 사진·규격·박스수량·거래처별 단가를 관리하는 제품 마스터입니다.",
    steps: [
      "검색·구분(양방/한방)으로 품목을 찾습니다.",
      "카드를 누르면 상세 모달이 열립니다.",
      "거래처별 '구간 단가'를 추가/삭제하고, 사진·박스수량·단위·설명을 채울 수 있습니다.",
      "EDI 코드를 넣고 '공공 API 조회'로 식약처 정보를 불러올 수 있습니다(되는 품목 한정).",
    ],
    tip: "사진은 5MB 이하만 올라갑니다.",
  },
  {
    icon: TrendingDown,
    title: "단가 비교",
    what: "같은 품목을 거래처별로 단가 비교하고, 배송비까지 넣어 어디서 사는 게 유리한지 봅니다.",
    steps: [
      "양방/한방 탭을 고르고 품목을 검색합니다.",
      "표에서 최저가(초록 ✓)와 가격차이(%)를 봅니다.",
      "'10%+ 가격차이만'으로 차이 큰 품목만 추립니다.",
      "아래 배송비 시뮬레이션에 품목·수량을 넣으면 '분산 구매' vs '한 곳 몰아주기' 중 추천을 보여줍니다.",
    ],
  },
  {
    icon: Truck,
    title: "벤더 관리",
    what: "거래처(벤더)의 기본 정보를 보는 조회용 화면입니다.",
    steps: [
      "검색으로 거래처를 찾습니다.",
      "각 카드에서 구분·결제방법·배송정보·취급 품목 수·사이트 링크를 확인합니다.",
    ],
    tip: "지금은 보기 전용입니다(수정 기능 없음).",
  },
  {
    icon: ShieldAlert,
    title: "공급망 관리",
    what: "주문 이행 상태·가격 변동·공급 리스크를 한곳에서 모니터링합니다.",
    steps: [
      "'주문 이행 현황' 탭: 상태별 건수 카드를 누르면 그 상태만 봅니다.",
      "'가격 변동' 탭: 기간을 골라 단가 인상/인하 이력을 봅니다(10%+ 급변 강조).",
      "'공급 리스크' 탭: '공급 이슈 등록'으로 품절·지연 등을 기록합니다.",
    ],
  },
  {
    icon: LayoutDashboard,
    title: "대시보드",
    what: "전체 현황을 한눈에 보는 첫 화면입니다.",
    steps: [
      "상단 카드로 품목·주문·거래처·마진 수치를 봅니다.",
      "최근 주문, 이번 달 vs 지난 달, 지점별 현황을 확인합니다.",
    ],
  },
  {
    icon: Settings,
    title: "설정",
    what: "계정·지점·연동 설정 입구입니다(현재는 화면만 있고 상세는 준비 중).",
    steps: ["지금은 특별히 만질 것이 없습니다."],
  },
];

export default function GuidePage() {
  return (
    <>
      <TopBar title="사용 가이드" subtitle="화면별로 무엇을 어떻게 하는지 쉬운 말로 정리했어요" />
      <div className="flex-1 p-4 md:p-6 space-y-5 overflow-auto max-w-3xl">
        {/* 하루 흐름 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h2 className="text-sm font-bold text-blue-900 mb-3">하루 흐름 (이 순서로 돌아갑니다)</h2>
          <ol className="space-y-1.5">
            {flow.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-blue-900/90">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* 화면별 가이드 */}
        {sections.map((sec) => {
          const Icon = sec.icon;
          return (
            <div key={sec.title} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">{sec.title}</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2.5">{sec.what}</p>
              <ul className="space-y-1.5">
                {sec.steps.map((st, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="flex-shrink-0 text-blue-500 mt-1">•</span>
                    <span>{st}</span>
                  </li>
                ))}
              </ul>
              {sec.tip && (
                <div className="mt-2.5 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{sec.tip}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
