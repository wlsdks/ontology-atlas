#!/usr/bin/env node
/**
 * Aslan 워크스페이스 시드를 운영 Firestore (aslan-project-map) 로 직접 push.
 *
 * Firebase Admin SDK + ADC 사용. firestore.rules 를 우회하므로 admin 권한이 자동.
 *
 * 사전 준비 (둘 중 하나):
 *   - gcloud auth application-default login            # 사용자 로그인 (가장 흔함)
 *   - GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json # service account key 파일
 *
 * 실행:
 *   node scripts/push-aslan-prod.mjs
 *   OWNER_UID=<firebase-uid> OWNER_EMAIL=you@example.com node scripts/push-aslan-prod.mjs
 *
 * 멱등성: 모든 쓰기는 set() — 같은 ID 면 덮어쓴다. 기존 다른 컬렉션/도큐먼트는 건드리지 않는다.
 */

import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import crypto from "node:crypto";
import fs from "node:fs";

import {
  SEED_ASLAN_ACCOUNT,
  SEED_ASLAN_MEMBERSHIP,
  SEED_ASLAN_PROJECTS,
} from "./seed-fixtures.mjs";
import { ASLAN_TREE } from "./fixtures/aslan-tree.mjs";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "aslan-project-map";

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn(
    `[push-aslan-prod] WARNING: FIRESTORE_EMULATOR_HOST is set (${process.env.FIRESTORE_EMULATOR_HOST}). 운영이 아닌 emulator 로 push 됩니다. 의도라면 무시하세요.`,
  );
}

let credential;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (keyPath && fs.existsSync(keyPath)) {
  credential = cert(JSON.parse(fs.readFileSync(keyPath, "utf8")));
  console.log(`[push-aslan-prod] using service account key: ${keyPath}`);
} else {
  credential = applicationDefault();
  console.log(
    "[push-aslan-prod] using Application Default Credentials (ADC). 실패 시 'gcloud auth application-default login' 후 재시도.",
  );
}

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID, credential });
const db = getFirestore(app);

function ringPosition(index, total, radius) {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: Math.round(radius * Math.cos(angle)),
    y: Math.round(radius * Math.sin(angle)),
  };
}

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

function buildHubDoc({ slug, name, description, tags, position, accountId, projectId }) {
  return {
    accountId,
    projectId,
    slug,
    name,
    nameEn: null,
    category: "in-progress",
    status: "developing",
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
    category: "in-progress",
    status: "developing",
    description,
    detail: null,
    tags: tags ?? [],
    stack: [],
    links: [],
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

function generatePassword() {
  // 16자: 대소문자 + 숫자 + 특수. 발음/혼동 가능 문자 제외.
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%^&*";
  const all = upper + lower + digit + special;
  const pick = (set) => set[crypto.randomInt(set.length)];
  let pw = pick(upper) + pick(lower) + pick(digit) + pick(special);
  for (let i = 0; i < 12; i += 1) pw += pick(all);
  // 셔플
  return pw
    .split("")
    .map((c) => ({ c, r: crypto.randomInt(1_000_000) }))
    .sort((a, b) => a.r - b.r)
    .map(({ c }) => c)
    .join("");
}

async function ensureAslanAuthUser(auth, { uid, email, password, displayName }) {
  try {
    const created = await auth.createUser({
      uid,
      email,
      password,
      displayName,
      emailVerified: true,
    });
    return { user: created, created: true, password };
  } catch (err) {
    if (err.code === "auth/uid-already-exists" || err.code === "auth/email-already-exists") {
      const existing = err.code === "auth/uid-already-exists"
        ? await auth.getUser(uid)
        : await auth.getUserByEmail(email);
      // 비밀번호 재설정 (공유하기 위해 매번 새 비밀번호 발급)
      await auth.updateUser(existing.uid, { password, displayName, emailVerified: true });
      return { user: existing, created: false, password };
    }
    throw err;
  }
}

async function main() {
  const aslanEmail = process.env.ASLAN_EMAIL || "aslan@narnia.dev";
  const aslanPassword = process.env.ASLAN_PASSWORD || generatePassword();
  const aslanUid = process.env.ASLAN_UID || "aslan";
  const aslanDisplayName = process.env.ASLAN_DISPLAY_NAME || "Aslan";

  console.log(`[push-aslan-prod] project=${PROJECT_ID}`);

  // 0. Firebase Auth: aslan 전용 로그인 사용자 (이메일/비밀번호) 생성/갱신
  const auth = getAuth(app);
  const authResult = await ensureAslanAuthUser(auth, {
    uid: aslanUid,
    email: aslanEmail,
    password: aslanPassword,
    displayName: aslanDisplayName,
  });
  console.log(
    `  ${authResult.created ? "✓ created" : "↻ updated"} firebase-auth user uid=${authResult.user.uid} email=${aslanEmail}`,
  );

  const ownerUid = authResult.user.uid;
  const ownerEmail = aslanEmail;

  // 1. account
  await db.collection("accounts").doc(SEED_ASLAN_ACCOUNT.id).set(
    {
      name: SEED_ASLAN_ACCOUNT.name,
      description: SEED_ASLAN_ACCOUNT.description,
      isPublic: SEED_ASLAN_ACCOUNT.isPublic,
      ownerUid,
      ownerEmail,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`  ✓ accounts/${SEED_ASLAN_ACCOUNT.id}`);

  // 2. owner membership
  const membershipId = `${ownerUid}__${SEED_ASLAN_ACCOUNT.id}`;
  await db.collection("accountMemberships").doc(membershipId).set(
    {
      accountId: SEED_ASLAN_ACCOUNT.id,
      uid: ownerUid,
      email: ownerEmail,
      role: "owner",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`  ✓ accountMemberships/${membershipId} (owner)`);

  // 3. flat projects (cross-project deps)
  let flatOk = 0;
  const flatBatch = db.batch();
  for (const project of SEED_ASLAN_PROJECTS) {
    const ref = db
      .collection("accounts")
      .doc(SEED_ASLAN_ACCOUNT.id)
      .collection("projects")
      .doc(project.slug);
    flatBatch.set(
      ref,
      {
        ...normalizeProject(project),
        accountId: SEED_ASLAN_ACCOUNT.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    flatOk += 1;
  }
  await flatBatch.commit();
  console.log(`  ✓ flat projects: ${flatOk}/${SEED_ASLAN_PROJECTS.length}`);

  // 4. 4-layer tree
  const HUB_R = 320;
  const NODE_R = 140;
  let containerOk = 0;
  let hubOk = 0;
  let nodeOk = 0;
  for (const container of ASLAN_TREE) {
    const projectRef = db
      .collection("accounts")
      .doc(SEED_ASLAN_ACCOUNT.id)
      .collection("workspaceProjects")
      .doc(container.id);

    const batch = db.batch();
    batch.set(
      projectRef,
      {
        accountId: SEED_ASLAN_ACCOUNT.id,
        name: container.name,
        description: container.description ?? null,
        isPublic: true,
        order: container.order ?? 0,
        metadata: container.metadata ?? {},
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    container.hubs.forEach((hub, hi) => {
      const hubPos = ringPosition(hi, container.hubs.length, HUB_R);
      batch.set(
        projectRef.collection("hubs").doc(hub.slug),
        {
          ...buildHubDoc({
            slug: hub.slug,
            name: hub.name,
            description: hub.description,
            tags: hub.tags,
            position: hubPos,
            accountId: SEED_ASLAN_ACCOUNT.id,
            projectId: container.id,
          }),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      hubOk += 1;

      hub.nodes.forEach((node, ni) => {
        const off = ringPosition(ni, hub.nodes.length, NODE_R);
        const nodePos = { x: hubPos.x + off.x, y: hubPos.y + off.y };
        batch.set(
          projectRef.collection("nodes").doc(node.slug),
          {
            ...buildNodeDoc({
              slug: node.slug,
              name: node.name,
              description: node.description,
              tags: node.tags ?? hub.tags ?? [],
              position: nodePos,
              hubIds: [hub.slug],
              accountId: SEED_ASLAN_ACCOUNT.id,
              projectId: container.id,
            }),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        nodeOk += 1;
      });
    });

    await batch.commit();
    containerOk += 1;
    console.log(
      `  ✓ ${container.id} — hubs=${container.hubs.length} nodes=${container.hubs.reduce(
        (s, h) => s + h.nodes.length,
        0,
      )}`,
    );
  }

  console.log(
    `\n[push-aslan-prod] done. flatProjects=${flatOk} containers=${containerOk} hubs=${hubOk} nodes=${nodeOk}`,
  );

  console.log("\n========== ASLAN 로그인 정보 (공유용) ==========");
  console.log(`  URL:       https://aslan-project-map.web.app/login/`);
  console.log(`  워크스페이스: https://aslan-project-map.web.app/?account=${SEED_ASLAN_ACCOUNT.id}`);
  console.log(`  이메일:     ${ownerEmail}`);
  console.log(`  비밀번호:   ${authResult.password}`);
  console.log(`  uid:       ${ownerUid}`);
  console.log("================================================");
}

main().catch((err) => {
  console.error("[push-aslan-prod] fatal:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
