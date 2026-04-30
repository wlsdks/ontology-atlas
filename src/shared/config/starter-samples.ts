import type { ProjectInput } from "@/entities/project";

/**
 * 빈 워크스페이스 사용자를 위한 스타터 샘플 세트.
 *
 * 설계 원칙:
 * - 5개 — 최소한의 토폴로지 감각을 보이되 overwhelming 하지 않게.
 * - 일반적인 B2B SaaS 예시 (auth · API gateway · 결제 · 카탈로그 · 알림) 로,
 *   특정 내부 프로젝트에 편향되지 않음.
 * - 카테고리/상태는 DEFAULT_CATEGORIES / DEFAULT_STATUSES 의 기본 ID 만 사용.
 * - 허브 2개 + 일반 3개, 의존 관계로 간단한 토폴로지를 만든다.
 * - 좌표는 force-settle 에 맡기기 위해 원점 근처 작은 값. 정확히 0 을 피해
 *   settleLayout 초기 분산이 자연스럽게 작동하도록.
 */
export const STARTER_SAMPLE_PROJECTS: ProjectInput[] = [
  {
    slug: "sample-iam-hub",
    name: "통합 인증 허브",
    nameEn: "Identity Hub",
    category: "in-progress",
    status: "developing",
    description:
      "모든 서비스의 인증·권한을 담당하는 허브. 토큰 발급과 검증을 한 곳에서 책임진다.",
    detail:
      "스타터 샘플입니다. 수정하거나 자유롭게 삭제해도 됩니다. 의존성이 여러 서비스로부터 들어오는 허브 구조 예시를 보여줍니다.",
    tags: ["Auth", "Hub"],
    stack: ["Node.js", "PostgreSQL"],
    isHub: true,
    position: { x: -40, y: 0 },
  },
  {
    slug: "sample-api-gateway",
    name: "API 게이트웨이",
    nameEn: "API Gateway",
    category: "in-progress",
    status: "live",
    description:
      "외부 클라이언트의 모든 요청이 통과하는 관문. 인증 확인과 라우팅을 담당한다.",
    detail:
      "스타터 샘플입니다. 통합 인증 허브와 함께 플랫폼의 두 번째 허브 역할을 합니다.",
    tags: ["Platform", "Hub"],
    stack: ["Go"],
    dependencies: ["sample-iam-hub"],
    isHub: true,
    position: { x: 60, y: 0 },
  },
  {
    slug: "sample-checkout",
    name: "결제 서비스",
    nameEn: "Checkout",
    category: "in-progress",
    status: "developing",
    description: "주문 완료와 결제 승인을 처리하는 서비스.",
    detail: "스타터 샘플입니다. 두 허브를 모두 의존하는 일반 서비스 예시입니다.",
    tags: ["Commerce"],
    stack: ["TypeScript", "Stripe"],
    dependencies: ["sample-iam-hub", "sample-api-gateway"],
    position: { x: 30, y: -60 },
  },
  {
    slug: "sample-catalog",
    name: "상품 카탈로그",
    nameEn: "Catalog",
    category: "in-progress",
    status: "live",
    description: "판매 상품의 메타데이터와 재고를 관리한다.",
    detail: "스타터 샘플입니다.",
    tags: ["Commerce"],
    stack: ["TypeScript"],
    dependencies: ["sample-api-gateway"],
    position: { x: 80, y: 50 },
  },
  {
    slug: "sample-notifications",
    name: "알림 서비스",
    nameEn: "Notifications",
    category: "planned",
    status: "planning",
    description: "결제·배송 등 중요한 사건 발생 시 이메일·푸시를 발송한다.",
    detail:
      "스타터 샘플입니다. planned 카테고리 예시로, 결제 서비스가 이 서비스를 호출하는 구조입니다.",
    tags: ["Messaging"],
    stack: ["TypeScript"],
    dependencies: ["sample-checkout"],
    position: { x: -30, y: 70 },
  },
];
