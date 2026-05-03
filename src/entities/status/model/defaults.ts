import type { Status } from './types';

/**
 * 기본 상태 — 8 단계 라이프사이클. ID 는 이전 리터럴 유니온과 호환.
 */
export const DEFAULT_STATUSES: Status[] = [
  { id: 'idea', label: '아이디어', dotColor: 'neutral' },
  { id: 'planning', label: '기획', dotColor: 'warning' },
  { id: 'developing', label: '개발중', dotColor: 'warning' },
  { id: 'deploy-ready', label: '배포준비', dotColor: 'warning' },
  { id: 'completed', label: '개발완료', dotColor: 'success' },
  { id: 'live', label: '운영중', dotColor: 'success' },
  { id: 'paused', label: '일시중단', dotColor: 'paused' },
  { id: 'deprecated', label: '중단', dotColor: 'paused' },
];
