# Seed Data

> 초기 프로젝트 목록을 Firestore에 주입하는 스크립트. 본격 구현은 Phase 6.

## 실행

```bash
pnpm seed
```

## 사전 준비

1. Firebase Console → 프로젝트 설정 → 서비스 계정 → **"새 비공개 키 생성"** → JSON 다운로드
2. 다운로드한 파일을 프로젝트 루트의 `serviceAccountKey.json`으로 저장
3. **이 파일은 절대 Git에 커밋 금지** — `.gitignore`에 포함됨 (`serviceAccountKey.json`, `*-firebase-adminsdk-*.json`)
4. 실수로 커밋했다면 즉시 **Firebase Console에서 해당 키 revoke** 후 새 키 발급

## 시드 데이터 구조

설계 문서 [섹션 4.8](superpowers/specs/2026-04-12-aslan-project-map-design.md) 참조. 요약:

### 작업중 (in-progress)

- Aslan maps
- 뉴스 클리핑 (Lantern), 커뮤니티 (Paravel), Aslan Verse, 현장강의 플랫폼 (Pick)
  Pick은 AI 질문 생성, 응답 요약, AI 조교, 7인 과제 심사, 수업 인사이트/리포트까지 포함한다.
- Reactor (**허브**), IAM (**허브**)
- Reactor Web, atlassian mcp, swagger mcp
- 각종 Admin들

### 예정 (planned)

- cronos mcp, groupware mcp, 도메인 지식 mcp, Aslan Scale

## 허브 관계

Reactor와 IAM은 나머지 작업중 프로젝트들과 `dependencies` 배열로 연결되어 허브-앤-스포크 토폴로지를 만든다.

## 스크립트 동작

1. 각 프로젝트 객체의 `slug`를 문서 ID로 Firestore에 upsert
2. `createdAt`/`updatedAt`은 서버 타임스탬프로 설정
3. 초기 `position.x`/`position.y`는 force-directed 레이아웃으로 계산 후 고정 저장

## 재실행

시드 스크립트는 **멱등**이어야 한다. 여러 번 실행해도 동일한 결과.

## 변경 이력

- 2026-04-13: 컨설팅 카테고리 및 프로젝트 시드 제거
- 2026-04-12: 초기 작성 (Phase 0)
