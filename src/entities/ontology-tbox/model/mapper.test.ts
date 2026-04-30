import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';
import {
  activeStateFromFirestore,
  activeStateToFirestore,
  versionFromFirestore,
  versionToFirestore,
} from './mapper';

const SAMPLE_CLASSES: OntologyClass[] = [
  {
    id: 'capability',
    name: '역량',
    description: '도메인이 제공하는 기능적 능력.',
    version: 1,
    createdBy: 'system',
    createdAt: new Date('2026-04-27T00:00:00Z'),
  },
  {
    id: 'concept',
    name: '개념',
    description: '도메인 핵심 추상 — capability 보다 추상적.',
    version: 1,
    createdBy: 'user-1',
    createdAt: new Date('2026-04-28T00:00:00Z'),
  },
];

const SAMPLE_RELATIONS: OntologyRelation[] = [
  {
    id: 'depends_on',
    name: '의존',
    description: 'A 가 B 없이는 작동 안 함.',
    sourceClassIds: [],
    targetClassIds: [],
    category: 'behavior',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
    createdAt: new Date('2026-04-27T00:00:00Z'),
  },
];

describe('OntologyTBoxVersion mapper', () => {
  it('round-trip — toFirestore + fromFirestore 가 의미 보존', () => {
    const input = {
      versionId: 'v2',
      accountId: 'acc-1',
      createdBy: 'uid-1',
      changeNote: 'concept 클래스 추가',
      classes: SAMPLE_CLASSES,
      relations: SAMPLE_RELATIONS,
    };
    const fsPayload = versionToFirestore(input);
    // Firestore 가 추가하는 createdAt 을 mocking — Timestamp.fromDate.
    const stored = {
      ...fsPayload,
      createdAt: Timestamp.fromDate(new Date('2026-04-28T01:00:00Z')),
    };
    const round = versionFromFirestore('v2', stored);
    expect(round.versionId).toBe('v2');
    expect(round.accountId).toBe('acc-1');
    expect(round.createdBy).toBe('uid-1');
    expect(round.changeNote).toBe('concept 클래스 추가');
    expect(round.classes).toHaveLength(2);
    // 정렬 확인 (capability < concept).
    expect(round.classes[0]?.id).toBe('capability');
    expect(round.classes[1]?.id).toBe('concept');
    expect(round.classes[1]?.name).toBe('개념');
    expect(round.relations).toHaveLength(1);
    expect(round.relations[0]?.id).toBe('depends_on');
    expect(round.relations[0]?.symmetric).toBe(false);
  });

  it('changeNote 누락 — undefined', () => {
    const input = {
      versionId: 'v1',
      accountId: 'acc-1',
      createdBy: 'system',
      classes: SAMPLE_CLASSES,
      relations: SAMPLE_RELATIONS,
    };
    const stored = {
      ...versionToFirestore(input),
      createdAt: Timestamp.fromDate(new Date(0)),
    };
    const round = versionFromFirestore('v1', stored);
    expect(round.changeNote).toBeUndefined();
  });

  it('classes / relations 빈 배열도 정상', () => {
    const input = {
      versionId: 'v0',
      accountId: 'acc-1',
      createdBy: 'system',
      classes: [],
      relations: [],
    };
    const stored = {
      ...versionToFirestore(input),
      createdAt: Timestamp.fromDate(new Date(0)),
    };
    const round = versionFromFirestore('v0', stored);
    expect(round.classes).toEqual([]);
    expect(round.relations).toEqual([]);
  });

  it('Firestore data classes/relations 누락 — 빈 배열로 fallback', () => {
    const stored = {
      accountId: 'acc-1',
      createdBy: 'system',
      createdAt: Timestamp.fromDate(new Date(0)),
    };
    const round = versionFromFirestore('v-broken', stored);
    expect(round.classes).toEqual([]);
    expect(round.relations).toEqual([]);
  });
});

describe('OntologyTBoxActiveState mapper', () => {
  it('round-trip — toFirestore + fromFirestore 가 의미 보존', () => {
    const input = {
      accountId: 'acc-1',
      versionId: 'v2',
      activatedBy: 'uid-1',
    };
    const fsPayload = activeStateToFirestore(input);
    const stored = {
      ...fsPayload,
      activatedAt: Timestamp.fromDate(new Date('2026-04-28T01:00:00Z')),
    };
    const round = activeStateFromFirestore('acc-1', stored);
    expect(round.accountId).toBe('acc-1');
    expect(round.versionId).toBe('v2');
    expect(round.activatedBy).toBe('uid-1');
    expect(round.activatedAt.toISOString()).toBe('2026-04-28T01:00:00.000Z');
  });
});
