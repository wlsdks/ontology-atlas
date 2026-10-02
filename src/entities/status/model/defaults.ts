import type { Status } from './types';

/** The eight lifecycle statuses; ids stay compatible so stored records resolve. */
export const DEFAULT_STATUSES: Status[] = [
  { id: 'idea', label: '아이디어', labelEn: 'Idea', labels: { ja: 'アイデア', zh: '创意' }, dotColor: 'neutral' },
  { id: 'planning', label: '기획', labelEn: 'Planning', labels: { ja: '企画', zh: '策划' }, dotColor: 'warning' },
  { id: 'developing', label: '개발중', labelEn: 'In development', labels: { ja: '開発中', zh: '开发中' }, dotColor: 'warning' },
  { id: 'deploy-ready', label: '배포준비', labelEn: 'Ready to ship', labels: { ja: '公開準備', zh: '发布准备' }, dotColor: 'warning' },
  { id: 'completed', label: '개발완료', labelEn: 'Built', labels: { ja: '開発完了', zh: '开发完成' }, dotColor: 'success' },
  { id: 'live', label: '운영중', labelEn: 'Live', labels: { ja: '運用中', zh: '运行中' }, dotColor: 'success' },
  { id: 'paused', label: '일시중단', labelEn: 'Paused', labels: { ja: '一時停止', zh: '暂停' }, dotColor: 'paused' },
  { id: 'deprecated', label: '중단', labelEn: 'Discontinued', labels: { ja: '中止', zh: '终止' }, dotColor: 'paused' },
];
