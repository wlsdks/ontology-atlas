import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "demo-aslan-project-map";

function ensureAdminApp() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:19099";
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:18080";

  if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT_ID });
  }
}

export async function createAccountMemberUser(input: {
  email: string;
  password: string;
  displayName: string;
  accountId: string;
  role: "owner" | "editor" | "viewer";
}) {
  ensureAdminApp();

  const auth = getAuth();
  const db = getFirestore();
  const normalizedEmail = input.email.trim().toLowerCase();

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(normalizedEmail);
  } catch {
    userRecord = await auth.createUser({
      email: normalizedEmail,
      password: input.password,
      displayName: input.displayName,
    });
  }

  const now = new Date();
  await db
    .doc(`accountMemberships/${userRecord.uid}__${input.accountId}`)
    .set({
      accountId: input.accountId,
      uid: userRecord.uid,
      email: normalizedEmail,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    });

  return userRecord;
}

export async function deleteAccountProject(accountId: string, slug: string) {
  ensureAdminApp();

  const db = getFirestore();
  await db.doc(`accounts/${accountId}/projects/${slug}`).delete();
}
