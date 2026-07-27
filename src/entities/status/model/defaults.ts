import type { Status } from './types';

/**
 * 기본 상태 — 8 단계 라이프사이클. ID 는 이전 리터럴 유니온과 호환.
 */
export const DEFAULT_STATUSES: Status[] = [
  { id: 'idea', label: '아이디어', labelEn: 'Idea', dotColor: 'neutral' },
  { id: 'planning', label: '기획', labelEn: 'Planning', dotColor: 'warning' },
  { id: 'developing', label: '개발중', labelEn: 'In development', dotColor: 'warning' },
  { id: 'deploy-ready', label: '배포준비', labelEn: 'Ready to ship', dotColor: 'warning' },
  { id: 'completed', label: '개발완료', labelEn: 'Built', dotColor: 'success' },
  { id: 'live', label: '운영중', labelEn: 'Live', dotColor: 'success' },
  { id: 'paused', label: '일시중단', labelEn: 'Paused', dotColor: 'paused' },
  { id: 'deprecated', label: '중단', labelEn: 'Discontinued', dotColor: 'paused' },
];
