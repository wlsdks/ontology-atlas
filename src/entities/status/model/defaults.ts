import type { Status } from './types';

/**
 * The eight lifecycle statuses. IDs stay compatible with the earlier literal
 * union, so stored project records keep resolving.
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
