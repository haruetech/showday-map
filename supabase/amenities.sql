-- SHOWDAY MAP — 주변 편의 정보 (화장실·공원·무장애 시설 등)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run 하세요. (여러 번 실행해도 안전)

create table if not exists public.place_amenities (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('toilet','rest','park','trail','barrier_free')),
  name        text not null,
  address     text,
  lat         double precision not null,
  lng         double precision not null,
  extra       jsonb not null default '{}'::jsonb,   -- 개방시간, 비상벨 여부, 무장애 항목 등 원본 요약
  source      text not null,                        -- 'toilet_std' | 'park_std' | 'tour_barrierfree' ...
  source_id   text not null,                        -- 출처 데이터의 고유값(없으면 이름+좌표)
  updated_at  timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists place_amenities_geo on public.place_amenities (lat, lng);
create index if not exists place_amenities_kind on public.place_amenities (kind);

-- 읽기 전용 공개 (쓰기는 service_role 키로만 — 수집 스크립트)
alter table public.place_amenities enable row level security;
drop policy if exists "amenities read" on public.place_amenities;
create policy "amenities read" on public.place_amenities for select using (true);

-- 좌표 반경 검색 (미터). 화면에서는 /api/amenities 가 이 함수를 호출합니다.
create or replace function public.amenities_near(
  p_lat double precision, p_lng double precision,
  p_radius_m int default 500, p_limit int default 80
) returns table (kind text, name text, address text, lat double precision, lng double precision, extra jsonb, dist_m int)
language sql stable as $$
  select * from (
    select a.kind, a.name, a.address, a.lat, a.lng, a.extra,
      (6371000*2*asin(sqrt(
        power(sin(radians(a.lat-p_lat)/2),2) +
        cos(radians(p_lat))*cos(radians(a.lat))*power(sin(radians(a.lng-p_lng)/2),2)
      )))::int as dist_m
    from public.place_amenities a
    where a.lat between p_lat - p_radius_m/111000.0 and p_lat + p_radius_m/111000.0
      and a.lng between p_lng - p_radius_m/88000.0  and p_lng + p_radius_m/88000.0
  ) t
  where t.dist_m <= p_radius_m
  order by t.dist_m
  limit p_limit
$$;
grant execute on function public.amenities_near to anon, authenticated;
