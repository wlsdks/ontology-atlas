/**
 * 클라이언트 측 예기치 않은 에러 관찰 기록.
 * 경로: `accounts/{accountId}/clientErrors/{errorId}`
 *
 * Sentry 같은 외부 관찰 도구 도입 전까지의 간이 로깅.
 * append-only · admin/member 읽기.
 */
export interface ClientError {
  id: string;
  accountId: string;
  /** Error.message 또는 throw 된 값의 문자열 표현. */
  message: string;
  /** Error.stack 을 최대 2_000 자로 잘라 저장. 파이어스토어 doc 크기 방어. */
  stack?: string;
  /** 에러 발생 시점의 location.pathname + search. */
  url: string;
  /** navigator.userAgent. 브라우저·OS 트렌드 파악용. */
  userAgent: string;
  /** 공간 내 원인 사용자. 익명 로깅 유지 — uid 만. */
  uid: string | null;
  /** React error boundary 가 주는 digest. 빌드 해시 기반 재현 단서. */
  digest?: string;
  /** 'global' = layout 레벨, 'route' = 페이지 레벨 (error.tsx). */
  kind: "global" | "route";
  createdAt: Date;
}

export interface ClientErrorInput {
  accountId: string;
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  uid: string | null;
  digest?: string;
  kind: "global" | "route";
}
