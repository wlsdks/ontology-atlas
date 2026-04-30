# 문서 유지 규칙

## 원칙

**문서화가 프로젝트의 생명선**이다. 코드만 고치고 문서 안 고치면 안 된다. 이 프로젝트는 AI가 계속 작업할 것이므로, 문서가 유일한 세션 간 지식 전달 매체다.

## 문서 우선순위

| 문서 | 우선도 | 언제 수정? |
|---|---|---|
| `CLAUDE.md` | ⭐⭐⭐ | 작업 방식·규칙·주요 결정 변경 시 |
| `README.md` | ⭐⭐⭐ | 빠른 시작·커맨드·진입점 변경 시 |
| `docs/superpowers/specs/*` | ⭐⭐⭐ | 설계 자체가 변경될 때 |
| `docs/ARCHITECTURE.md` | ⭐⭐ | 전체 구조·파일 배치 변경 시 |
| `docs/DATA-MODEL.md` | ⭐⭐⭐ | Firestore 스키마 변경 시 **반드시 먼저** |
| `docs/DESIGN-SYSTEM.md` | ⭐⭐ | 디자인 토큰·컴포넌트 규칙 변경 시 |
| `docs/DEPLOYMENT.md` | ⭐⭐ | 배포 절차·환경변수 변경 시 |
| `docs/ADMIN-GUIDE.md` | ⭐ | 어드민 UX 변경 시 |
| `docs/SEED-DATA.md` | ⭐ | 시드 스크립트 변경 시 |
| `docs/CHANGELOG.md` | ⭐⭐ | 주요 변경마다 날짜 추가 |
| `docs/rules/*` | ⭐⭐ | 규율 자체가 진화할 때 |

## 코드-문서 쌍

| 코드 변경 | 함께 수정해야 할 문서 |
|---|---|
| Firestore 스키마 | `docs/DATA-MODEL.md` |
| 새 환경변수 | `docs/DEPLOYMENT.md` + `.env.example` |
| 새 커맨드 / 스크립트 | `README.md` |
| 아키텍처 재구성 | `docs/ARCHITECTURE.md` + `CLAUDE.md` |
| 디자인 토큰 추가 | `docs/DESIGN-SYSTEM.md` |
| 어드민 UI 변경 | `docs/ADMIN-GUIDE.md` |
| 시드 데이터 변경 | `docs/SEED-DATA.md` |

## 자주 하는 실수

- 구현만 하고 CHANGELOG 누락 → 리뷰 시 지적
- `.env.example` 업데이트 누락 → 다음 세션에서 환경 구성 실패
- 설계 결정을 구두로만 기록 → 3세션 후 컨텍스트 상실
- 코드 컨벤션 바꾸고 `docs/rules/naming.md` 안 고치기

## Rule of Thumb

> "미래의 나와 AI에게 보내는 편지라고 생각하고 써라."

코드를 읽지 않고도 "이 프로젝트가 뭘 하는지, 어떻게 굴러가는지, 왜 이렇게 만들어졌는지"를 알 수 있어야 한다.
