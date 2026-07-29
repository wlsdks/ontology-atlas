---
slug: elements/brand-mark-asset-pipeline
kind: element
title: Brand Mark Asset Pipeline
display_ko: 브랜드 마크 자산 파이프라인
display_en: Brand Mark Asset Pipeline
domain: views
path: src/shared/ui/brand-mark.tsx
---

# Brand Mark Asset Pipeline

브랜드 마크("겹 육각형")가 화면과 OS 양쪽에 나가는 경로. 좌표 진실원은
`src/shared/ui/brand-mark.tsx` 하나이고, 나머지는 세 스크립트가 찍어낸다.

| 단계 | 파일 | 산출 |
|---|---|---|
| SVG 생성 | `scripts/build-brand-assets.mjs` | `public/brand-mark.svg` · `app/icon.svg` · 앱 아이콘 SVG 4종 |
| 래스터 | `scripts/build-brand-raster.mjs` | PNG 21종 (브라우저 캔버스를 빌린다 — 이미지 의존성을 새로 들이지 않기 위해) |
| 설치 | `scripts/install-brand-icons.mjs` | icns · ico · `src-tauri/icons/*` · `app/apple-icon.png` (18곳) |

자동 실행이 아니다. 아이콘을 바꿀 때 사람이 한 번 돌리고, 결과물이 커밋되므로
제품 빌드는 이 스크립트들에 의존하지 않는다.

## 크기 사다리 — 작을수록 층을 지우고, 남긴 층은 굵기를 다시 잡는다

`full`(≥64px) 전부 · `compact`(20~48px) 바깥+중간+노드 · `micro`(≤18px) 바깥 +
속 채운 핵.

층을 지우는 것만으로는 부족하다. `compact`/`micro` 의 획 두께는 **그 렌더
크기에서의 device px** 로 정해진다 — 획이 1px 아래면 안티에일리어싱이 회색
죽으로 만들고, 잉크 사이 간격이 1px 아래면 배경이 안 보여 겹이 하나로 뭉친다.
1차 값의 실측이 미형 획 1.03px · 축약형 노드↔바깥 1.34px 였고, 그것이 "작은
아이콘이 뭉쳐 보인다" 의 정체였다.

## 마크의 크기는 뷰박스가 아니라 잉크다

512 뷰박스 안에서 잉크는 세로 418 뿐이고 나머지는 여백이다. 뷰박스를 판의
81% 로 맞추면 보이는 마크는 65.8% 가 된다 — 사양을 지켰는데도 Dock 에서 작게
보이던 이유. 기준은 잉크 바운딩박스의 **세로**다(이 육각형은 가로:세로 0.87
이라 가로로 재면 세로가 판을 넘는다).

## 게이트

`tests/contract/brand-asset-parity.contract.test.ts` — 컴포넌트와 스크립트가
**실제로 뱉은 SVG** 를 층별로 비교하고(값 비교가 아니다: 표만 맞추고 그리는
자리에서 다른 값을 쓰는 경우를 잡는다), 위 device-px 바닥을 잠근다.
`.mjs` 는 `.tsx` 를 import 할 수 없어 값이 두 벌 존재하므로, 이 저장소의 파서
3-way·검증기 2-way 계약과 같은 이유로 필요하다.

## 헌장 경계

그라디언트 금지의 사정거리는 **렌더되는 앱 표면**이다. 브랜드 자산(OS 아이콘·
파비콘·og)은 앱 DOM 밖이라 그라디언트를 쓰되 **인디고 단일 hue 램프**
(`#787EF6` → `#3E4BDF`)만 허용하고, 앱 안에 그려지는 마크는 `currentColor`
단색이다. `.claude/rules/forbidden.md` 참조.
