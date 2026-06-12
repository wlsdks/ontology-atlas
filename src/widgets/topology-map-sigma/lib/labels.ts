/**
 * 토폴로지 툴팁·hover UI 에서 쓰는 텍스트 라벨 매핑.
 * 디자인 지침이 색 구분을 금지하므로 도메인·상태는 텍스트로만 표현.
 */

export interface StatusMeta {
  label: string;
  color: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  idea: { label: 'Idea', color: 'rgba(160, 170, 190, 0.75)' },
  planning: { label: 'Planning', color: 'rgba(200, 180, 130, 0.85)' },
  developing: { label: 'Developing', color: 'rgba(200, 180, 130, 0.85)' },
  'deploy-ready': { label: 'Deploy Ready', color: 'rgba(200, 180, 130, 0.85)' },
  completed: { label: 'Completed', color: 'rgba(120, 190, 150, 0.9)' },
  live: { label: 'Live', color: 'rgba(120, 190, 150, 0.9)' },
  paused: { label: 'Paused', color: 'rgba(180, 150, 170, 0.8)' },
  deprecated: { label: 'Deprecated', color: 'rgba(180, 150, 170, 0.8)' },
};

export function statusLabel(id: string): string {
  return STATUS_META[id]?.label ?? id;
}

export function statusDotColor(id: string): string | null {
  return STATUS_META[id]?.color ?? null;
}

const DOMAIN_LABEL_MAP: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend API',
  data: 'Data Platform',
  ml: 'ML · AI',
  mobile: 'Mobile',
  infra: 'Infra',
  security: 'Security',
  observability: 'Observability',
  devops: 'DevOps',
  'internal-tools': 'Internal Tools',
  docs: 'Workspace',
};

/**
 * slug prefix 로 도메인 라벨 추론. "internal-tools" 같은 하이픈 포함 prefix 를
 * 먼저 매칭하고, 실패 시 첫 토큰만 룩업.
 */
export function extractDomainLabel(slug: string): string {
  for (const key of Object.keys(DOMAIN_LABEL_MAP)) {
    if (slug.startsWith(`${key}-`)) return DOMAIN_LABEL_MAP[key];
  }
  const first = slug.split('-')[0];
  return DOMAIN_LABEL_MAP[first] ?? first;
}
