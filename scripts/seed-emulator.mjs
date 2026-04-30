#!/usr/bin/env node

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  SEED_ACCOUNT_MEMBERSHIPS,
  SEED_ACCOUNTS,
  SEED_ASLAN_PROJECTS,
  SEED_CATEGORIES,
  SEED_PROJECTS,
  SEED_SANDBOX_PROJECTS,
  SEED_STATUSES,
} from './seed-fixtures.mjs';
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

async function seedCollection(collectionName, entries, keyField, mapper = (value) => value) {
  const batch = db.batch();
  for (const entry of entries) {
    const id = entry[keyField];
    const ref = db.collection(collectionName).doc(id);
    batch.set(ref, {
      ...mapper(entry),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
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
    // node → hub 의존을 시각 엣지로 표현 (hubIds 와 같은 값. UI 가 dependencies 를 엣지로 변환).
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

await seedCollection('accounts', SEED_ACCOUNTS, 'id');
await seedCollection('accountMemberships', SEED_ACCOUNT_MEMBERSHIPS, 'id');
await seedCollection('categories', SEED_CATEGORIES, 'id');
await seedCollection('statuses', SEED_STATUSES, 'id');
await seedCollection('projects', SEED_PROJECTS, 'slug', normalizeProject);
await seedAccountProjects('sandbox-lab', SEED_SANDBOX_PROJECTS);
await seedAccountProjects('aslan', SEED_ASLAN_PROJECTS);
const aslanTreeStats = await seedAslanTree('aslan', ASLAN_TREE);

console.log(
  `[seed-emulator] accounts=${SEED_ACCOUNTS.length} memberships=${SEED_ACCOUNT_MEMBERSHIPS.length} categories=${SEED_CATEGORIES.length} statuses=${SEED_STATUSES.length} projects=${SEED_PROJECTS.length} sandboxProjects=${SEED_SANDBOX_PROJECTS.length} aslanProjects=${SEED_ASLAN_PROJECTS.length} aslanContainers=${aslanTreeStats.containerCount} aslanHubs=${aslanTreeStats.hubCount} aslanNodes=${aslanTreeStats.nodeCount}`,
);
