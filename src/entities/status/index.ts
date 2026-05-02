export type { Status, StatusInput, StatusDotColor } from './model';
export { DEFAULT_STATUSES } from './model';
// API 함수는 `@/entities/status/api` 로 분리 — firebase 정적 leak 차단.
