-- 거래처 표기 통일: '디에치몰' → '디에이치몰'.
-- 같은 거래처가 두 표기로 분산돼 색·검색·집계가 갈리던 문제 해결.
-- 정식 표기는 vendors 테이블의 '디에이치몰'.
update orders set vendor_name = '디에이치몰' where vendor_name = '디에치몰';
