# 브랜드 리서치 워크벤치

> Next.js 14 + TypeScript + Tailwind CSS · CJ ENM 성장추진팀

브랜드/법인명 한 번 입력 → **재무 · 투자 · 고용 · 사업자 정보** 를 한 화면 컨설팅 대시보드로.

## 🚀 실행

```bash
# 처음 한번
npm install

# 매번 실행
npm run dev
```

→ http://localhost:3000

또는 Windows 더블클릭: **`start.bat`**

## 🔑 API 키 (`.env.local`)

```
DART_API_KEY=...
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

이미 적용되어 있습니다.

## 📂 구조

```
brand-research/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # 검색 + 목적 선택
│   │   ├── dashboard/
│   │   │   ├── page.tsx              # Server (Suspense wrapper)
│   │   │   └── DashboardClient.tsx   # 대시보드 본체
│   │   └── api/
│   │       ├── search/               # 통합 검색
│   │       ├── dart/financials/      # DART 재무
│   │       └── health/
│   ├── components/
│   │   ├── StatCard.tsx
│   │   ├── FinancialTable.tsx
│   │   └── DataSourceCard.tsx
│   └── lib/
│       ├── types.ts
│       ├── dart.ts
│       ├── naver.ts
│       └── sources.ts                # 14개 데이터 소스 정의
└── start.bat
```

## ✅ 자동 수집

| 소스 | 데이터 |
|------|--------|
| DART | 회사 개황, 3개년 손익·재무상태·현금흐름표 |
| 네이버 뉴스 | 최근 8건 (최신순) |
| 네이버 쇼핑 | 가격대·판매처·이미지 12개 |
| 네이버 블로그 | 후기·인플루언서 6건 |

## 🔗 1클릭 외부 확인 (목적별 정렬)

THE VC · 혁신의숲 · 벤처확인 · 중소기업현황 · 사람인 · 잡코리아 · 잡플래닛 · 공정위 통신판매 · Google · Crunchbase · Instagram · YouTube · 올리브영 · 쿠팡 · Amazon US · Sephora

**조사 목적**에 따라 정렬:
- 투자 검토 → THE VC, 혁신의숲, Crunchbase 상단
- JBP 제휴 → 인스타·올영·유튜브 상단
- M&A 후보 → THE VC, 잡플래닛, 혁신의숲 상단
- 입점/소싱 → 공정위, 올영, 인스타 상단

## 📱 모바일 반응형

`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` 같은 Tailwind 브레이크포인트로 320px~ 데스크탑까지 대응.
