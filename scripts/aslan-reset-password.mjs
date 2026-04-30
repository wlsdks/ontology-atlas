#!/usr/bin/env node
/**
 * aslan@narnia.dev 운영 계정 비밀번호만 재설정 — push-aslan-prod 의 데이터
 * 시드 단계는 건너뛰고 Auth user 의 password 만 update.
 *
 * 자율 루프가 운영 계정으로 로그인해 ontology 시드 / 검증 작업 할 때 1 회
 * 사용. 진안에게 비번을 알리고 자율 루프가 환경 변수로 받아 사용.
 *
 * 사용:
 *   gcloud auth application-default login
 *   node scripts/aslan-reset-password.mjs            # 새 16 자 비번 자동 생성
 *   ASLAN_PASSWORD='custom-pw' node scripts/aslan-reset-password.mjs  # 직접 지정
 */

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import crypto from "node:crypto";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "aslan-project-map";
const ASLAN_EMAIL = process.env.ASLAN_EMAIL || "aslan@narnia.dev";
const ASLAN_UID = process.env.ASLAN_UID || "aslan";
const ASLAN_DISPLAY_NAME = process.env.ASLAN_DISPLAY_NAME || "Aslan";

function generatePassword() {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%^&*";
  const all = upper + lower + digit + special;
  const pick = (set) => set[crypto.randomInt(set.length)];
  let pw = pick(upper) + pick(lower) + pick(digit) + pick(special);
  for (let i = 0; i < 12; i += 1) pw += pick(all);
  return pw
    .split("")
    .map((c) => ({ c, r: crypto.randomInt(1_000_000) }))
    .sort((a, b) => a.r - b.r)
    .map(({ c }) => c)
    .join("");
}

const password = process.env.ASLAN_PASSWORD || generatePassword();

const app =
  getApps()[0] ??
  initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });
const auth = getAuth(app);

let user;
try {
  user = await auth.getUser(ASLAN_UID);
} catch (err) {
  if (err.code === "auth/user-not-found") {
    user = await auth.createUser({
      uid: ASLAN_UID,
      email: ASLAN_EMAIL,
      password,
      displayName: ASLAN_DISPLAY_NAME,
      emailVerified: true,
    });
    console.log(`[aslan-reset] created new user uid=${user.uid}`);
  } else {
    throw err;
  }
}

if (user) {
  await auth.updateUser(user.uid, {
    password,
    email: ASLAN_EMAIL,
    displayName: ASLAN_DISPLAY_NAME,
    emailVerified: true,
  });
  console.log(`[aslan-reset] updated user uid=${user.uid} email=${ASLAN_EMAIL}`);
}

console.log("");
console.log("==============================================");
console.log(`  email    : ${ASLAN_EMAIL}`);
console.log(`  password : ${password}`);
console.log("==============================================");
console.log("이 비밀번호로 운영 (https://aslan-project-map.web.app) 로그인 가능.");
console.log("자율 루프가 시드/검증할 때 ASLAN_PASSWORD 환경 변수로 전달.");
