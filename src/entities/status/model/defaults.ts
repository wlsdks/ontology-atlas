import type { Status } from './types';

/**
 * 기본 상태 — 기존 6단계 라이프사이클. ID는 이전 리터럴 유니온과 호환.
 */
export const DEFAULT_STATUSES: Omit<Status, 'createdAt' | 'updatedAt'>[] = [
  { id: 'idea', label: '아이디어', labelEn: 'Idea', order: 0, dotColor: 'neutral' },
  { id: 'planning', label: '기획', labelEn: 'Planning', order: 1, dotColor: 'warning' },
  { id: 'developing', label: '개발중', labelEn: 'Developing', order: 2, dotColor: 'warning' },
  { id: 'deploy-ready', label: '배포준비', labelEn: 'Deploy Ready', order: 3, dotColor: 'warning' },
  { id: 'completed', label: '개발완료', labelEn: 'Completed', order: 4, dotColor: 'success' },
  { id: 'live', label: '운영중', labelEn: 'Live', order: 5, dotColor: 'success' },
  { id: 'paused', label: '일시중단', labelEn: 'Paused', order: 6, dotColor: 'paused' },
  { id: 'deprecated', label: '중단', labelEn: 'Deprecated', order: 7, dotColor: 'paused' },
];
