-- 거래처 단가 "미확인" 표시 정리.
--
-- 배경: 단가를 모를 때 임시로 1원을 넣어둔 행이 2건 있었다(디에이치몰).
-- 자동배정은 최저가 거래처를 고르므로, 1원짜리는 항상 1등으로 뽑혀
-- 해당 품목이 무조건 그 거래처로 배정되는 상태였다.
--
-- 규칙: unit_price IS NULL = "취급은 하지만 단가 미확인". 화면에는 "/" 로 보인다.
--       행이 아예 없음 = "취급 안 함"(화면 "-"). 둘을 구분한다.
-- 코드: 자동배정(/api/parse-order)은 null 단가를 최저가 후보에서 뒤로 보내고,
--       단가 비교 화면은 null 을 0 으로 바꾸지 않는다.

update public.vendor_products
set unit_price = null,
    is_lowest = false,
    last_updated = now()
where unit_price = 1;
