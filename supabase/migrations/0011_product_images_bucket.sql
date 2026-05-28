-- 제품 사진 저장용 공개 버킷 + anon 정책.
-- 앱이 무로그인(anon)으로 동작하므로 anon 에 upload/read 허용.
-- 추후 로그인 도입 시 정책을 authenticated 로 좁히면 됨.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_anon_read" on storage.objects;
drop policy if exists "product_images_anon_insert" on storage.objects;
drop policy if exists "product_images_anon_update" on storage.objects;
drop policy if exists "product_images_anon_delete" on storage.objects;

create policy "product_images_anon_read" on storage.objects
  for select to anon using (bucket_id = 'product-images');

create policy "product_images_anon_insert" on storage.objects
  for insert to anon with check (bucket_id = 'product-images');

create policy "product_images_anon_update" on storage.objects
  for update to anon
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product_images_anon_delete" on storage.objects
  for delete to anon using (bucket_id = 'product-images');
