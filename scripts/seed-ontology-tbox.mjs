#!/usr/bin/env node

/**
 * Ontology TBox seed — `ontologyClasses` (6 종: project/domain/capability/
 * element/document + unknown placeholder) + `ontologyRelations` (7 종).
 *
 * 사용법 (emulator):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-aslan-project-map \
 *     node scripts/seed-ontology-tbox.mjs
 *
 * 사용법 (production — T-11 측정용):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your-prod-project-id> \
 *     node scripts/seed-ontology-tbox.mjs
 *
 * 운영 DB 시드는 별도 GCP 자격 증명을 거쳐서 명시적으로 실행할 것.
 *
 * 시드 데이터는 `src/entities/ontology-class/model/defaults.ts` 와
 * `src/entities/ontology-relation/model/defaults.ts` 의 내용과 일치해야 한다.
 * 변경 시 두 곳 모두 갱신.
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'demo-aslan-project-map';

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

const ONTOLOGY_CLASSES = [
  {
    id: 'project',
    name: '프로젝트',
    description: '외부에 드러나는 제품·시스템·이니셔티브 단위.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'domain',
    name: '도메인',
    description: '프로젝트 안의 큰 문제 영역 또는 운영 영역.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'capability',
    name: '역량',
    description: '도메인이 제공하는 기능적 능력.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'element',
    name: '요소',
    description: '실제 구현체·자산·인터페이스·데이터 구조. elementType 으로 세분화.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'document',
    name: '문서',
    description: '근거 노드. 계층 트리에 매달지 않고 describes 관계로 개념과 연결.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'unknown',
    name: '미지',
    description: 'frontmatter relates.target 이 가리키는 미존재 노드의 placeholder. 검수자가 promote 또는 dismiss.',
    version: 1,
    createdBy: 'system',
  },
];

const ONTOLOGY_RELATIONS = [
  {
    id: 'contains',
    name: '포함',
    inverseName: 'belongs_to',
    description: '상위 구조가 하위 구조를 품음. Project → Domain → Capability → Element 트리의 구조 관계.',
    sourceClassIds: ['project', 'domain', 'capability'],
    targetClassIds: ['domain', 'capability', 'element'],
    category: 'structure',
    symmetric: false,
    transitive: true,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'belongs_to',
    name: '소속',
    inverseName: 'contains',
    description: '특정 개념이 상위 개념에 속함. contains 의 역방향이지만 데이터 모델상 별도 엣지로 저장 가능.',
    sourceClassIds: ['domain', 'capability', 'element'],
    targetClassIds: ['project', 'domain', 'capability'],
    category: 'structure',
    symmetric: false,
    transitive: true,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'depends_on',
    name: '의존',
    description: '기능·요소가 다른 기능·요소에 의존. 동작 관계.',
    sourceClassIds: ['project', 'capability', 'element'],
    targetClassIds: ['project', 'capability', 'element'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'implements',
    name: '구현',
    description: '요소가 역량을 구현.',
    sourceClassIds: ['element'],
    targetClassIds: ['capability'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'uses',
    name: '사용',
    description: '한 요소가 다른 요소를 사용. 동작 관계.',
    sourceClassIds: ['element', 'capability'],
    targetClassIds: ['element'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'describes',
    name: '설명',
    description: '문서가 개념을 설명. 근거 관계 — 모든 ontology 관계는 describes 로 문서에 닿아야 신뢰도 평가 가능.',
    sourceClassIds: ['document'],
    targetClassIds: ['project', 'domain', 'capability', 'element'],
    category: 'evidence',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'related_to',
    name: '연관',
    description: '약 연관. 초기 추출에서 보조 관계로 사용. 충분한 근거가 쌓이면 더 구체적 타입으로 승격.',
    sourceClassIds: [],
    targetClassIds: [],
    category: 'weak',
    symmetric: true,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
];

async function seedCollection(collectionName, entries) {
  const colRef = db.collection(collectionName);
  const existing = await colRef.limit(1).get();
  if (!existing.empty) {
    console.log(`[skip] ${collectionName} already has documents (${existing.size}+)`);
    return { skipped: true, count: 0 };
  }
  const batch = db.batch();
  for (const entry of entries) {
    const { id, ...rest } = entry;
    batch.set(colRef.doc(id), {
      ...rest,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`[seed] ${collectionName}: wrote ${entries.length} docs`);
  return { skipped: false, count: entries.length };
}

async function main() {
  console.log(`[seed-ontology-tbox] target project: ${PROJECT_ID}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`[seed-ontology-tbox] using emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  } else {
    console.log('[seed-ontology-tbox] WARNING: no emulator set — will write to real project!');
  }

  const classes = await seedCollection('ontologyClasses', ONTOLOGY_CLASSES);
  const relations = await seedCollection('ontologyRelations', ONTOLOGY_RELATIONS);

  console.log(
    `[seed-ontology-tbox] done. classes ${classes.skipped ? 'skipped' : `+${classes.count}`}, ` +
      `relations ${relations.skipped ? 'skipped' : `+${relations.count}`}`,
  );
}

main().catch((err) => {
  console.error('[seed-ontology-tbox] failed:', err);
  process.exit(1);
});
