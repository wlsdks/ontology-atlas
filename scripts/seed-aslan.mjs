#!/usr/bin/env node
/**
 * Aslan 워크스페이스 전용 시드 — emulator 에 aslan account + flat projects + 4-layer tree 적재.
 *
 * 사용:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 GCLOUD_PROJECT=demo-aslan-project-map \
 *     node scripts/seed-aslan.mjs
 *
 * `seed-emulator.mjs` 의 공통 시드 (categories, statuses, sandbox 등) 를 끝낸 뒤 추가로 실행하거나,
 * aslan 만 갱신할 때 단독 실행한다.
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { SEED_ASLAN_ACCOUNT, SEED_ASLAN_MEMBERSHIP, SEED_ASLAN_PROJECTS } from './seed-fixtures.mjs';
import { ASLAN_TREE } from './fixtures/aslan-tree.mjs';

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'demo-aslan-project-map';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required to seed the Firestore emulator.');
}

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

function normalizeProject(project) {
  return {
    name: project.name,
    nameEn: project.nameEn ?? null,
    category: project.category,
    status: project.status,
    description: project.description,
    detail: project.detail ?? null,
    tags: project.tags ?? [],
    stack: project.stack ?? [],
    links: project.links ?? [],
    dependencies: project.dependencies ?? [],
    owner: project.owner ?? null,
    icon: project.icon ?? null,
    screenshots: project.screenshots ?? [],
    timeline: project.timeline ?? {},
    progress: project.progress ?? null,
    isHub: project.isHub ?? false,
    position: project.position,
  };
}

function ringPosition(index, total, radius) {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: Math.round(radius * Math.cos(angle)),
    y: Math.round(radius * Math.sin(angle)),
  };
}

function buildHubDoc({ slug, name, description, tags, position, accountId, projectId }) {
  return {
    accountId,
    projectId,
    slug,
    name,
    nameEn: null,
    category: 'in-progress',
    status: 'developing',
    description,
    detail: null,
    tags: tags ?? [],
    stack: [],
    links: [],
    dependencies: [],
    owner: null,
    icon: null,
    screenshots: [],
    timeline: {},
    progress: null,
    isHub: true,
    position,
  };
}

function buildNodeDoc({ slug, name, description, tags, position, hubIds, accountId, projectId }) {
  return {
    accountId,
    projectId,
    slug,
    name,
    nameEn: null,
    category: 'in-progress',
    status: 'developing',
    description,
    detail: null,
    tags: tags ?? [],
    stack: [],
    links: [],
    // node → hub 의존을 시각 엣지로 표현 (hubIds 와 동일).
    dependencies: hubIds ?? [],
    owner: null,
    icon: null,
    screenshots: [],
    timeline: {},
    progress: null,
    isHub: false,
    hubIds,
    position,
  };
}

async function seedAccountProjects(accountId, entries) {
  const batch = db.batch();
  for (const entry of entries) {
    const ref = db
      .collection('accounts')
      .doc(accountId)
      .collection('projects')
      .doc(entry.slug);
    batch.set(ref, {
      ...normalizeProject(entry),
      accountId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

async function seedAslanTree(accountId, tree) {
  const HUB_RING_RADIUS = 320;
  const NODE_RING_RADIUS = 140;
  let containerCount = 0;
  let hubCount = 0;
  let nodeCount = 0;

  for (const container of tree) {
    const projectRef = db
      .collection('accounts')
      .doc(accountId)
      .collection('workspaceProjects')
      .doc(container.id);

    const containerBatch = db.batch();
    containerBatch.set(projectRef, {
      accountId,
      name: container.name,
      description: container.description ?? null,
      isPublic: true,
      order: container.order ?? 0,
      metadata: container.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    container.hubs.forEach((hub, hubIndex) => {
      const hubPosition = ringPosition(hubIndex, container.hubs.length, HUB_RING_RADIUS);
      const hubRef = projectRef.collection('hubs').doc(hub.slug);
      containerBatch.set(hubRef, {
        ...buildHubDoc({
          slug: hub.slug,
          name: hub.name,
          description: hub.description,
          tags: hub.tags,
          position: hubPosition,
          accountId,
          projectId: container.id,
        }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      hubCount += 1;

      hub.nodes.forEach((node, nodeIndex) => {
        const nodeRingOffset = ringPosition(nodeIndex, hub.nodes.length, NODE_RING_RADIUS);
        const nodePosition = {
          x: hubPosition.x + nodeRingOffset.x,
          y: hubPosition.y + nodeRingOffset.y,
        };
        const nodeRef = projectRef.collection('nodes').doc(node.slug);
        containerBatch.set(nodeRef, {
          ...buildNodeDoc({
            slug: node.slug,
            name: node.name,
            description: node.description,
            tags: node.tags ?? hub.tags ?? [],
            position: nodePosition,
            hubIds: [hub.slug],
            accountId,
            projectId: container.id,
          }),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        nodeCount += 1;
      });
    });

    await containerBatch.commit();
    containerCount += 1;
  }

  return { containerCount, hubCount, nodeCount };
}

// 1. account + membership upsert
const accountBatch = db.batch();
accountBatch.set(db.collection('accounts').doc(SEED_ASLAN_ACCOUNT.id), {
  ...SEED_ASLAN_ACCOUNT,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
accountBatch.set(
  db.collection('accountMemberships').doc(SEED_ASLAN_MEMBERSHIP.id),
  {
    ...SEED_ASLAN_MEMBERSHIP,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  },
);
await accountBatch.commit();

// 2. flat workspace topology (cross-project deps)
await seedAccountProjects(SEED_ASLAN_ACCOUNT.id, SEED_ASLAN_PROJECTS);

// 3. 4-layer tree (workspaceProjects → hubs → nodes)
const treeStats = await seedAslanTree(SEED_ASLAN_ACCOUNT.id, ASLAN_TREE);

console.log(
  `[seed-aslan] account=${SEED_ASLAN_ACCOUNT.id} flatProjects=${SEED_ASLAN_PROJECTS.length} containers=${treeStats.containerCount} hubs=${treeStats.hubCount} nodes=${treeStats.nodeCount}`,
);
