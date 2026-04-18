# Kaneda Horse Club

## 실행
```bash
npm install
npm run dev
```

## 배포
- Netlify / Vercel 가능
- Netlify 설정:
  - Build command: `npm run build`
  - Publish directory: `dist`

## 관리자 PIN
- 기본값: `1479`
- 변경 위치: `src/App.jsx`의 `ADMIN_PIN`

## Supabase
현재 코드에는 다음 값이 이미 반영되어 있습니다.
- URL
- publishable key

필요한 테이블 예시:

```sql
create table if not exists public.race_rooms (
  room_code text primary key,
  room_name text,
  race_no int not null default 1,
  horses jsonb not null default '[]'::jsonb,
  race_history jsonb not null default '[]'::jsonb,
  last_updated text
);
```

권한 예시:

```sql
alter table public.race_rooms enable row level security;

create policy "public read rooms"
on public.race_rooms
for select
to anon
using (true);

create policy "public insert rooms"
on public.race_rooms
for insert
to anon
with check (true);

create policy "public update rooms"
on public.race_rooms
for update
to anon
using (true)
with check (true);
```
