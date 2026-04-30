/**
 * Docs Vault 에서 임시 공개 링크 `/share?t={token}` 로 발급된 문서 스냅샷.
 * 원본 md 를 복사해서 저장하므로 원본이 바뀌어도 공유 링크 내용은 그대로.
 * 만료되면 클라이언트가 읽기 UI 에서 "만료" 표시.
 */
export interface SharedDoc {
  /** 문서 ID. short url-safe 토큰. */
  token: string;
  /** 원본 문서 slug (역추적용). */
  slug: string;
  /** 원본 제목 스냅샷. */
  title: string;
  /** md 본문 스냅샷 (frontmatter 제거된 상태 권장). */
  content: string;
  /** 생성자 uid. */
  createdBy: string;
  createdAt: Date;
  /** 만료 일시. null 이면 영구. */
  expiresAt: Date | null;
  /** 최대 조회 수. null 이면 무제한. */
  maxViews: number | null;
  /** 누적 조회 수. */
  viewCount: number;
}

export interface CreateSharedDocInput {
  slug: string;
  title: string;
  content: string;
  expiresInDays?: number | null;
  maxViews?: number | null;
}
