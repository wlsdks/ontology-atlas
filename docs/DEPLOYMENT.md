# Deployment Guide

> Firebase Hosting 기반 정적 배포 가이드. **Live**: https://
>
> 이 문서는 Firebase에 배포할 때 필요한 모든 단계를 한 곳에 모아놓은 체크리스트다. 처음 세팅하는 경우부터 일상 배포, 롤백, 커스텀 도메인까지 커버한다.
>
> **운영 정책 (2026-05-01)**: 현재 user 정책상 firebase 배포 안 함. local-first vault + AI agent partner (MCP) 가 default 사용 흐름. 본 문서는 future-ref 로 보관 + emulator 로컬 테스트는 여전히 유효.

## 목차

1. [최초 세팅 (한 번만)](#1-최초-세팅-한-번만)
2. [일상 배포 플로우](#2-일상-배포-플로우)
3. [부분 배포 (hosting만 / rules만)](#3-부분-배포)
4. [환경변수](#4-환경변수)
5. [Firebase 프로젝트 구성](#5-firebase-프로젝트-구성)
6. [커스텀 도메인 연결](#6-커스텀-도메인-연결)
7. [롤백 · 버전 관리](#7-롤백--버전-관리)
8. [배포 전 체크리스트](#8-배포-전-체크리스트)
9. [트러블슈팅](#9-트러블슈팅)

---

## 1. 최초 세팅 (한 번만)

```bash
# 1. Firebase CLI 설치 (전역)
pnpm add -g firebase-tools

# 2. Google 계정으로 로그인
firebase login

# 3. 프로젝트 연결 (이 repo에선 이미 .firebaserc에 기록되어 있음)
firebase use oh-my-ontology

# 4. 접근 권한 확인
firebase projects:list
```

**`.env.local` 파일 생성** — `.env.example`을 복사해 실제 값 입력:

```bash
cp .env.example .env.local
# 편집기로 열어서 Firebase Console → 프로젝트 설정 → 일반 → 내 앱의 값 붙여넣기
```

**Google 로그인 도메인 허용** — Firebase Console → Authentication → Settings → Authorized domains:
- `localhost` (개발)
- `` (기본)
- `oh-my-ontology.firebaseapp.com` (대체 도메인)
- 커스텀 도메인 (있다면)

**admin 화이트리스트 등록** — Firebase Console → Firestore → `admins` 컬렉션:
- 문서 ID: 이메일 (예: `you@example.com`)
- 문서 내용은 비워도 됨 (존재 여부만 체크)

---

## 2. 일상 배포 플로우

```bash
# 1. 최신 main 받기
git checkout main
git pull

# 2. 검증
pnpm tsc --noEmit           # 타입 체크
pnpm lint                   # ESLint + FSD 경계 검증
pnpm test:run               # 유닛 테스트
pnpm build                  # 정적 빌드 → out/

# 3. 배포
pnpm firebase deploy        # hosting + firestore.rules + storage.rules 전부
```

배포 완료 후 Firebase CLI가 호스팅 URL을 출력한다. 바로 확인.

> **Tip**: `firebase` 커맨드를 자주 친다면 전역 설치(`pnpm add -g firebase-tools`) 해두는 게 편함. 설치 안 했으면 `pnpm firebase ...`로 로컬 devDep 실행.

---

## 3. 부분 배포

전부 올릴 필요 없을 때:

```bash
# 호스팅만 (정적 파일만 바뀐 경우)
pnpm firebase deploy --only hosting

# Firestore 룰만 (보안 규칙 수정한 경우)
pnpm firebase deploy --only firestore:rules

# Storage 룰만 (스크린샷 업로드 규칙 수정한 경우)
pnpm firebase deploy --only storage

# hosting + storage 룰 둘 다
pnpm firebase deploy --only hosting,storage
```

룰만 바뀐 경우 build 없이 바로 deploy 해도 된다 (hosting 대상이 아님).

---

## 4. 환경변수

`.env.local`에 다음이 모두 채워져야 한다:

| Key | 설명 |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `xxx.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `oh-my-ontology` |
| `ASLAN_BUILD_PROJECT_SOURCE` | 선택값. 기본값은 비워둔다. `firestore`로 설정하면 정적 빌드 중 Firestore REST에서 프로젝트 목록을 읽는다. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `xxx.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | 숫자 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:xxx:web:xxx` |

> Firebase Web `apiKey`는 공개 값이다. Git에 올려도 보안 위험 아님 (실제 보안은 Firestore Security Rules + admins 화이트리스트가 담당). 다만 `.env.local`은 `.gitignore`에 있어 로컬 전용이다.

**빌드 시점에 주입됨** — `NEXT_PUBLIC_*` 접두사가 붙은 값만 클라이언트 번들에 포함된다. `.env.local` 수정 후엔 반드시 `pnpm build`를 다시 돌려야 새 값이 반영된다.

---

## 5. Firebase 프로젝트 구성

- **프로젝트 ID**: `oh-my-ontology`
- **Firestore 리전**: `asia-northeast3` (Seoul)
- **Storage 리전**: `US-EAST1` (무료 티어)
- **Auth Provider**: Google (`admins/{email}` 화이트리스트)
- **Hosting**: 정적 파일 `out/` (Next.js `output: 'export'`)

### Firestore 컬렉션

| 컬렉션 | 쓰기 권한 |
|---|---|
| `projects` | admins 화이트리스트 |
| `categories` | admins 화이트리스트 |
| `statuses` | admins 화이트리스트 |
| `admins` | **쓰기 완전 금지** — Firebase Console에서 수동 관리 |

Security Rules 정의는 [`firestore.rules`](../firestore.rules), [`storage.rules`](../storage.rules) 참고.

---

## 6. 커스텀 도메인 연결

### 준비물

- **도메인 소유권** — 레지스트라(가비아/Cloudflare/Namecheap 등)에서 구매해 DNS 관리 가능해야 함. Firebase는 도메인 판매 안 함.
- Firebase Hosting 자체 · SSL 인증서는 무료.

### 연결 절차

1. **Firebase Console → Hosting → 커스텀 도메인 추가**
2. 원하는 도메인 입력 (예: `map.demo.io` 또는 `demo.io`)
3. Firebase가 소유권 검증용 `TXT` 레코드 제공 → 레지스트라 DNS에 추가
4. Firebase가 검증 완료되면 최종 DNS 레코드를 제공:
   - **서브도메인** (`map.demo.io`): `CNAME` 레코드 하나 추가하면 끝
     ```
     Type   Name   Value
     CNAME  map    
     ```
   - **apex 도메인** (`demo.io`): `A` 레코드 2개 추가 (IPv4)
     ```
     Type   Name   Value
     A      @      151.101.x.x
     A      @      151.101.y.y
     ```
     (Firebase가 제공하는 실제 IP로 교체)
5. DNS 전파 대기 (10분–24시간) → Firebase가 자동으로 Let's Encrypt SSL 발급
6. 완료되면 `https://map.demo.io`로 접속 가능

### 연결 후 반드시 할 일

- Firebase Console → **Authentication → Settings → Authorized domains**에 새 도메인 추가 (안 하면 Google 로그인 팝업에서 에러)
- `src/app/layout.tsx`의 `SITE_URL` metadata 업데이트 (SEO · OpenGraph 때문에)
- `.env.local`의 `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`은 `xxx.firebaseapp.com` 유지 — 커스텀 도메인으로 바꾸면 OAuth 리다이렉트 깨진다

### apex 도메인 지원 여부

`map.demo.io` 같은 서브도메인은 CNAME으로 간단히 되고, `demo.io` 같은 apex는 레지스트라가 **ALIAS/ANAME** 레코드를 지원해야 깔끔하게 된다. Cloudflare는 "CNAME flattening"으로 자동 지원. 가비아는 A 레코드만 되므로 Firebase가 제공하는 정적 IP를 써야 한다.

---

## 7. 롤백 · 버전 관리

Firebase Hosting은 배포 히스토리를 자동 보관한다.

```bash
# 이전 릴리스 목록 확인
pnpm firebase hosting:releases:list

# 특정 버전으로 롤백 (Console에서도 클릭 한 번으로 가능)
pnpm firebase hosting:rollback
```

Firebase Console → Hosting → 릴리스 탭에서 타임라인·크기·작성자 확인 및 원클릭 롤백 가능. **배포 실수했을 때 가장 빠른 복구법**.

Firestore/Storage 룰은 롤백 대상 아님 — Git에서 이전 버전 체크아웃 후 재배포.

---

## 8. 배포 전 체크리스트

- [ ] `git status` 깨끗한가? 커밋 안 된 변경 없나?
- [ ] `pnpm tsc --noEmit` → 0 errors
- [ ] `pnpm lint` → 0 errors (FSD 경계 포함)
- [ ] `pnpm test:run` → all passing
- [ ] `pnpm build` → 성공 + `out/` 생성
- [ ] 로컬에서 `pnpm dev`로 한 번 돌려봤나? (특히 UI 변경)
- [ ] `firestore.rules` 변경했으면 Firestore Emulator로 테스트해봤나?
- [ ] admin 기능 건드렸으면 실제 admin 계정으로 테스트해봤나?
- [ ] CHANGELOG.md · 관련 docs 업데이트했나?

---

## 9. 트러블슈팅

**Q. 배포 후 빈 화면 또는 "아직 등록된 프로젝트가 없습니다"가 3초 이상 지속**
- Firestore 초기 연결이 느릴 수 있음. 새로고침 후에도 지속되면 환경변수 확인.
- Dev Console → Network 탭에서 Firestore 요청 실패(401/403) 여부 확인.
- `.env.local`이 `pnpm build` 시점에 로드됐는지 확인 (`NEXT_PUBLIC_*`만 번들됨).

**Q. Google 로그인 팝업이 뜨지 않음 (운영 환경)**
- Firebase Console → Authentication → Settings → **Authorized domains**에 현재 도메인 포함되어 있는지 확인.
- Firebase가 기본 도메인은 자동 추가하지만 커스텀 도메인은 수동 등록 필요.
- 팝업 차단기 끈 상태에서 테스트.

**Q. Google 로그인은 되는데 admin 접근 거부**
- Firestore → `admins` 컬렉션에 해당 이메일 문서 있는지 확인. 문서 ID = 이메일이어야 함.
- Firestore 리전 확인 — `asia-northeast3`가 맞는지.

**Q. 정적 빌드 실패 (`pnpm build`)**
- `output: 'export'` 모드에서 서버 컴포넌트가 서버 전용 API를 사용하면 실패.
- `shared/api/firebase.ts`는 lazy getter 패턴이라 빌드 시점엔 초기화 안 됨 (의도한 동작).
- 기본 `pnpm build`는 `entities/project/api/build-time-fetch.ts`에서 seed/demo 데이터를 사용해 네트워크에 의존하지 않는다.
- 운영 빌드에서 Firestore를 정적 페이지 source로 삼아야 하면 `ASLAN_BUILD_PROJECT_SOURCE=firestore`를 명시한다. 이 경우 Firestore 공개 읽기 권한과 `NEXT_PUBLIC_FIREBASE_PROJECT_ID`가 맞는지 확인.

**Q. `firebase deploy` 시 "HTTP Error: 403"**
- `firebase login --reauth`로 재로그인.
- `firebase projects:list`에 `oh-my-ontology`이 보이는지 확인 — 안 보이면 접근권한 없음.
- 프로젝트 소유자에게 IAM 권한 요청 (Firebase Admin 또는 Hosting Admin 이상).

**Q. `firebase deploy --only hosting` 시 "No HTTP hosts found for site"**
- `firebase.json`의 `hosting.public`이 `out`인지 확인.
- `pnpm build`를 먼저 돌렸는지 확인 (`out/` 디렉토리가 있어야 함).

**Q. Storage 업로드 403 (스크린샷 업로드 실패)**
- [`storage.rules`](../storage.rules) 확인 — admin 화이트리스트 체크 함수가 Firestore `admins` 컬렉션을 참조한다.
- 로그인 세션 확인. 로그아웃 후 재로그인.

**Q. Firestore 룰 변경이 안 먹음**
- `pnpm firebase deploy --only firestore:rules`로 룰만 재배포했는지 확인.
- Console → Firestore → 규칙 탭에서 최신 버전 타임스탬프 확인.
- 에뮬레이터에서 테스트한 룰이 실제 파일과 싱크되어 있는지 확인.

**Q. 캐시가 너무 강해서 새 배포가 반영 안 됨**
- `firebase.json`의 Cache-Control은 JS/CSS/폰트에 1년 immutable 설정 — 이건 파일명 해시 기반이라 정상.
- HTML은 no-cache가 기본이라 즉시 반영됨. 안 되면 브라우저 하드 리프레시(⌘+Shift+R).
- 정적 폰트/이미지를 같은 파일명으로 교체한 경우엔 파일명을 바꿔야 무효화됨.

---

## 변경 이력

- 2026-04-13: 커스텀 도메인 · 롤백 · 체크리스트 · 부분 배포 · 확장 트러블슈팅 추가
- 2026-04-12: 초기 작성 (Phase 0)
