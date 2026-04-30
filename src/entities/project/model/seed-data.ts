import type { ProjectInput } from "./types";

/**
 * 초기 시드 데이터 — 설계 문서 섹션 4.8 기준.
 *
 * 위치(position)는 force-directed 느낌의 수동 배치:
 * - 허브(IAM, Reactor)를 중심축에 배치
 * - 작업중 프로젝트는 허브 주변에 방사형
 * - 예정은 왼쪽 상단 클러스터에 배치
 */
export const SEED_PROJECTS: ProjectInput[] = [
  // ── 허브 (중앙) ──────────────────────────
  {
    slug: "iam",
    name: "IAM",
    nameEn: "Integrated Access Management",
    category: "in-progress",
    status: "deploy-ready",
    description:
      "통합 인증 서비스. JWT 발급의 유일한 권한을 갖고 타 서비스는 공개키로 로컬 검증만 한다.",
    detail:
      "Aslan 플랫폼의 인증·권한 게이트웨이. Kotlin · Spring Boot 3.3 기반 헥사고날 아키텍처, PostgreSQL · Redis, JWT(Access/Refresh) + TOTP 2FA, RSA 키 발급/롤오버, Rate Limit, Admin API(사용자 상태·감사 로그)까지 포함.",
    tags: ["Auth", "Hub"],
    stack: ["Kotlin", "Spring Boot", "PostgreSQL", "Redis", "JWT"],
    owner: "오민혁, 김경훈",
    isHub: true,
    position: { x: -240, y: 0 },
  },
  {
    slug: "reactor",
    name: "Reactor",
    nameEn: "Arc Reactor",
    category: "in-progress",
    status: "deploy-ready",
    description:
      "엔터프라이즈 지향 AI Agent 런타임. 모든 아슬란 서비스가 공통으로 얹을 AI 허브.",
    detail:
      "Spring AI 기반 ReAct 루프(Reasoning+Acting) · 5단계 Guard 파이프라인 · 4지점 Hook 라이프사이클 · 동적 MCP 등록(STDIO/SSE) · Human-in-the-Loop 승인 · 툴 정책 엔진 · 프롬프트 버전·Lab · RAG(PGVector) · 멀티에이전트(Sequential/Parallel/Supervisor) · Slack/REST SSE 멀티채널 · 옵저버빌리티(OpenTelemetry, Prometheus) · K8s Helm 차트까지 포함한 풀 플랫폼.",
    tags: ["AI", "Agent", "Hub"],
    stack: ["Kotlin", "Spring Boot", "Spring AI", "PGVector", "MCP"],
    owner: "최진안, 김경훈, 정민혁, 오민혁, 이다혜",
    isHub: true,
    position: { x: 240, y: 0 },
  },

  // ── 작업중 — 핵심 서비스 ────────────────────
  {
    slug: "aslan-maps",
    name: "Narnia",
    category: "in-progress",
    status: "developing",
    description: "아슬란의 프로젝트·도메인·서비스를 인터랙티브 토폴로지 지도로 보여주는 서비스.",
    detail:
      "Next.js 정적 export + Firebase Hosting. Sigma/WebGL로 허브·서비스 의존 그래프를 시각화, 추천 경로·포트폴리오 모드·가이드 투어·영향도 분석 제공. 화이트리스트 어드민만 노드·관계·시드 편집 가능.",
    tags: ["Portfolio", "Visualization"],
    stack: ["Next.js", "Sigma.js", "Firebase", "TypeScript"],
    dependencies: ["iam"],
    position: { x: -480, y: -160 },
  },
  {
    slug: "aslan-verse",
    name: "Aslan Verse",
    category: "in-progress",
    status: "deploy-ready",
    description:
      "AI 페르소나들이 실제 팀원처럼 협업하는 가상 조직 플랫폼.",
    detail:
      "조직 안의 모든 AI 에이전트를 하나의 팀으로 연결해 실제 업무처럼 논의·보고·의사결정을 수행하게 하는 가상 휴먼 네트워크(Virtual Human Network). 에이전트에게 역할(role)과 소속(team)을 부여하고 맥락을 워크스페이스에 누적.",
    tags: ["AI", "Multi-agent"],
    stack: ["React", "TypeScript", "Vite", "Firebase"],
    owner: "정민혁, 최진안",
    dependencies: ["reactor", "iam"],
    position: { x: 480, y: -160 },
  },
  {
    slug: "news-clipping",
    name: "뉴스 클리핑 (Lantern)",
    category: "in-progress",
    status: "deploy-ready",
    description:
      "RSS 기반 뉴스 클리핑 MCP 서버 — 수집 → 요약 → 일일 다이제스트.",
    detail:
      "카테고리·소스·페르소나 관리, 비동기 수집/요약 잡, 일일 다이제스트 생성. Gemini 기반 AI 요약. Admin SPA(React+Vite) 내장으로 운영 대시보드 제공. Reactor에 MCP 툴(clip_collect, clip_summarize, clip_digest 등) 노출.",
    tags: ["Content", "MCP"],
    stack: ["Kotlin", "Spring Boot", "Spring AI", "PostgreSQL", "Gemini"],
    owner: "최진안, 김경훈, 정민혁, 이다혜",
    dependencies: ["iam", "reactor"],
    position: { x: -320, y: -280 },
  },
  {
    slug: "paravel",
    name: "커뮤니티 (Paravel)",
    category: "in-progress",
    status: "developing",
    description: "사내 커뮤니티.",
    tags: ["Community", "Internal"],
    owner: "오민혁, 김경훈, 최진안, 정민혁",
    dependencies: ["iam"],
    position: { x: 0, y: 280 },
  },
  {
    slug: "pick",
    name: "현장강의 플랫폼 (Pick)",
    category: "in-progress",
    status: "completed",
    description:
      "실시간 강의 참여 플랫폼 — 20+ 참여 도구와 AI 질문 생성·요약·조교·심사·수업 인사이트까지.",
    detail:
      "강사가 수업 중 질문을 출제하면 학생들이 QR로 즉시 참여. 객관식·O/X·워드클라우드·Q&A·순위·빈칸채우기·힌트 퀴즈 등 20+ 참여 도구를 제공하고, 실시간 동기화(Firebase RTDB)와 프레젠터 뷰(/live)를 기본으로 갖춘다. AI 기능도 깊다. Gemini 기반 AI 질문 생성, 응답 요약, 제출 전 예심, 7인 AI 심사위원 과제 평가, AI 수업 인사이트와 다음 수업 액션 추천, 사실 기반 개인 학습 리포트, 오답 패턴 해설, 어려운 개념 설명용 비유 생성, 수업 중 학생 질문에 답하는 AI 조교 기능까지 묶여 있다.",
    tags: ["Education", "Realtime", "AI"],
    stack: ["React", "Firebase RTDB", "Gemini"],
    owner: "최진안",
    dependencies: ["iam"],
    position: { x: 320, y: -280 },
  },

  // ── 작업중 — Reactor 위성(운영 콘솔 + MCP) ───
  {
    slug: "reactor-admin",
    name: "Reactor Admin",
    category: "in-progress",
    status: "developing",
    description: "Arc Reactor 운영 콘솔.",
    detail:
      "MCP 서버 등록·툴 정책·프롬프트 버전·승인 큐·감사 로그·출력 가드 룰을 관리하는 어드민 워크스페이스. React + TypeScript + Vite. Reactor operator stack (백엔드 18081, 어드민 4174)과 함께 구동.",
    tags: ["Admin", "Console"],
    stack: ["React", "TypeScript", "Vite"],
    owner: "최진안, 김경훈, 정민혁, 오민혁, 이다혜",
    dependencies: ["reactor", "iam"],
    position: { x: 240, y: -200 },
  },
  {
    slug: "reactor-web",
    name: "Reactor Web",
    nameEn: "Arc Reactor Web",
    category: "in-progress",
    status: "developing",
    description: "Arc Reactor를 위한 웹 채팅 UI이자 운영 워크스페이스.",
    detail:
      "React 19 + Vite 7 + TanStack Query 기반 프론트엔드. SSE 스트리밍 채팅, 세션 기반 대화, 페르소나 관리, JWT 인증, MCP 서버·툴 정책·스케줄러·클리핑까지 포함한 어드민 대시보드를 한 화면에서 다룬다.",
    tags: ["AI", "Frontend", "Console"],
    stack: ["React", "Vite", "TypeScript", "TanStack Query"],
    links: [
      {
        label: "GitHub",
        url: "https://github.com/AslanLabs/arc-reactor-web",
      },
    ],
    dependencies: ["reactor", "iam"],
    position: { x: 620, y: -180 },
  },
  {
    slug: "atlassian-mcp",
    name: "Atlassian MCP",
    category: "in-progress",
    status: "developing",
    description:
      "Jira · Confluence · Bitbucket 55개 툴을 AI 에이전트에게 노출하는 MCP 서버.",
    detail:
      "Jira 16 · Confluence 15 · Bitbucket 9 · 복합 워크플로 15개. 이슈 검색/생성/전이/연결, 페이지 CRUD, 런북/포스트모템/스프린트 요약, PR 리뷰 큐/SLA 알림까지. Reactor에서 동적으로 등록해 사용.",
    tags: ["MCP", "Integration"],
    stack: ["Kotlin", "Spring Boot", "Spring AI", "MCP"],
    owner: "최진안, 김경훈, 정민혁, 오민혁, 이다혜",
    dependencies: ["reactor"],
    position: { x: 480, y: 160 },
  },
  {
    slug: "swagger-mcp",
    name: "Swagger MCP",
    category: "in-progress",
    status: "developing",
    description:
      "OpenAPI/Swagger spec을 로드·탐색하는 MCP 서버 (2.0/3.0/3.1 지원).",
    detail:
      "spec_load · spec_search · spec_detail · spec_schema · spec_validate 등으로 스펙을 에이전트가 질의. SSE(8081)·STDIO 두 모드. 카탈로그 source/revision 관리 + preview/published 접근 정책 내장.",
    tags: ["MCP", "API"],
    stack: ["Kotlin", "Spring Boot", "Spring AI", "MCP"],
    owner: "최진안, 김경훈, 정민혁, 오민혁, 이다혜",
    dependencies: ["reactor"],
    position: { x: 560, y: 0 },
  },
  {
    slug: "domain-knowledge-mcp",
    name: "도메인 지식 MCP",
    category: "planned",
    status: "planning",
    description: "사내 도메인 지식 베이스 MCP 서버 — 용어·정책·사례를 에이전트가 즉시 인용.",
    detail:
      "아슬란 각 팀의 도메인 지식(용어집·절차·의사결정 기록)을 구조화해 Reactor 에이전트가 질의로 불러쓸 수 있게 노출한다. 새 직원·외부 협업 인물이 맥락을 빠르게 따라오는 채널이 된다.",
    tags: ["MCP", "Knowledge"],
    stack: ["MCP"],
    dependencies: [],
    position: { x: -700, y: 0 },
  },

  // ── 예정 ───────────────────────────────
  {
    slug: "cronos-mcp",
    name: "Cronos MCP",
    category: "planned",
    status: "planning",
    description: "일정·시간 기반 MCP 서버 — 반복 작업과 리마인더를 에이전트에게.",
    detail:
      "정기 보고서 생성, 마감 임박 이슈 알림, 캘린더 기반 리서치 체크인 같은 시간 트리거를 Reactor 에서 다룰 수 있게 노출할 예정.",
    tags: ["MCP", "Schedule"],
    position: { x: -700, y: -320 },
  },
  {
    slug: "groupware-mcp",
    name: "Groupware MCP",
    category: "planned",
    status: "planning",
    description: "그룹웨어(메일·캘린더·출퇴근) MCP 서버.",
    detail:
      "사내 그룹웨어 데이터를 에이전트가 조회·작성할 수 있게 한다. 회의 요약 저장, 캘린더 충돌 검사, 휴가/결재 상태 조회 같은 일상 업무 자동화 채널.",
    tags: ["MCP", "Enterprise"],
    position: { x: -700, y: -160 },
  },
  {
    slug: "aslan-scale",
    name: "Aslan Scale",
    category: "planned",
    status: "idea",
    description: "대규모 처리·배치·큐 인프라.",
    detail:
      "여러 프로젝트가 공통으로 필요로 하는 배치 작업·큐·스트리밍 처리 계층을 하나로 정리하는 인프라 트랙.",
    tags: ["Infra", "Scale"],
    position: { x: -700, y: 160 },
  },
];
