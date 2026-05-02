/**
 * Ontology TBox snapshot — 클래스·관계 정의의 시점 단위 묶음.
 *
 * 기존 `ontologyClasses` / `ontologyRelations` 컬렉션은 mutable (현재 활성
 * 정의). 그 변경 시점마다 immutable snapshot 을 `ontologyTBoxVersions/{vN}`
 * 에 저장해, fact node 가 "어느 시점 schema 로 만들어졌는지" 추적 가능.
 *
 * 활성 version 포인터는 `ontologyTBoxState/{accountId}` 에 단일 doc.
 *
 * 도입 동기 + 옵션 비교: docs/superpowers/specs/2026-04-28-ontology-tbox-evolution.md
 */

import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';

/**
 * 한 시점의 TBox snapshot. classes / relations 는 그 시점 정의를 그대로 박은
 * immutable copy — 활성 컬렉션이 후속 수정돼도 이 snapshot 은 변하지 않음.
 */
export interface OntologyTBoxVersion {
  /**
   * Firestore document ID. 'v1' / 'v2' / ... 또는 ISO timestamp.
   * 형식 자유 — 내부 ordering 은 createdAt 기준.
   */
  versionId: string;
  accountId: string;
  /** 이 version 을 만든 시점. */
  createdAt: Date;
  /** 이 version 을 만든 uid. */
  createdBy: string;
  /** 사람이 읽는 변경 요약 (예: "concept 클래스 추가"). */
  changeNote?: string;
  /** snapshot 시점의 클래스 정의들 (id ASC). */
  classes: OntologyClass[];
  /** snapshot 시점의 관계 정의들 (id ASC). */
  relations: OntologyRelation[];
}

/** 새 version 을 만들 때 호출자가 채워야 할 입력. */
export type OntologyTBoxVersionInput = Omit<OntologyTBoxVersion, 'createdAt'>;

/**
 * 활성 TBox version 포인터. account 당 한 doc.
 *
 * Firestore 구조: `ontologyTBoxState/{accountId}` → 이 객체.
 * fact node 생성 시 이 포인터를 읽어 활성 versionId 식별 (cloud 모드).
 */
export interface OntologyTBoxActiveState {
  accountId: string;
  /** 현재 활성 version 의 ID — `ontologyTBoxVersions/{versionId}` 가 존재해야 함. */
  versionId: string;
  /** 활성화 시점 (이전 version → 새 version 전환). */
  activatedAt: Date;
  /** 활성화한 uid. */
  activatedBy: string;
}

export type OntologyTBoxActiveStateInput = Omit<OntologyTBoxActiveState, 'activatedAt'>;
