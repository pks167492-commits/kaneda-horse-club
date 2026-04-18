# Kaneda Horse Club

GTA RP용 실시간 경마 시뮬레이터입니다.

## 실행 방법

```bash
npm install
npm run dev
```

## 배포 방법

### Vercel
1. 이 폴더를 GitHub 저장소에 업로드합니다.
2. Vercel에서 `Add New -> Project`를 누릅니다.
3. GitHub 저장소를 선택하고 Deploy 합니다.

## 현재 설정된 Supabase 정보
- URL: `https://mfbpgdoaobafujvxnwmw.supabase.co`
- Key: 프로젝트 publishable key 반영 완료

## 사용법
- 운영자: 실시간 모드 + 운영자 + 원하는 룸 코드 입력 후 경기 시작
- 관전자: 실시간 모드 + 관전자 + 같은 룸 코드 입력

## 준비된 DB 테이블
아래 SQL이 이미 적용된 상태를 기준으로 동작합니다.

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
