/**
 * 정적 export 빌드에서 프로젝트 라우트/메타데이터에 쓸 프로젝트 목록.
 *
 * 기본 빌드는 네트워크에 의존하지 않는다. `output: 'export'` 앱에서
 * generateStaticParams / generateMetadata 중 Firestore REST를 호출하면
 * NEXT_STATIC_GEN_BAILOUT 로그와 HTTP 403 로그가 수천 번 증폭될 수 있기
 * 때문이다.
 *
 * 운영 빌드가 Firestore를 source로 삼아야 할 때만
 * `ASLAN_BUILD_PROJECT_SOURCE=firestore`를 명시한다.
 */

import type { Project } from '@/entities/project/model';
import { resolveFallbackProjects } from '@/entities/project/model/fallback';
import { getDemoProjects } from '@/shared/mocks/demo-data';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const BUILD_PROJECT_SOURCE = process.env.ASLAN_BUILD_PROJECT_SOURCE;
const USE_FIRESTORE_REST = BUILD_PROJECT_SOURCE === 'firestore';
let cachedProjects: Promise<Project[]> | null = null;

/**
 * 정적 export 빌드가 네트워크 없이도 데모/seed 슬러그로 페이지를 생성할 수
 * 있게 기본 데모 데이터셋을 합친다.
 */
function buildFallback(): Project[] {
  const seeded = resolveFallbackProjects();
  const seededSlugs = new Set(seeded.map((p) => p.slug));
  const demo = getDemoProjects().filter((p) => !seededSlugs.has(p.slug));
  return [...seeded, ...demo];
}

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

function fromFirestoreValue(value: FirestoreValue | undefined): unknown {
  if (value === undefined) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) {
    // fromFirestore 매퍼가 Timestamp 객체를 기대하므로 최소 인터페이스 제공
    const date = new Date(value.timestampValue);
    return {
      toDate: () => date,
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
      // 매퍼가 instanceof Timestamp를 쓰지만 여기선 duck-typing 우회
    };
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  }
  if ('mapValue' in value) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value.mapValue.fields ?? {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function parseFields(fields?: Record<string, FirestoreValue>): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

/**
 * 빌드 시점에 모든 프로젝트 문서를 준비한다.
 */
export async function fetchAllProjectsAtBuild(): Promise<Project[]> {
  cachedProjects ??= loadProjectsAtBuild();
  return cachedProjects;
}

async function loadProjectsAtBuild(): Promise<Project[]> {
  if (!USE_FIRESTORE_REST) {
    return buildFallback();
  }

  if (!PROJECT_ID) {
    console.warn('[build-time-fetch] NEXT_PUBLIC_FIREBASE_PROJECT_ID missing');
    return buildFallback();
  }

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/projects?pageSize=300`;
    // module-level promise cache 로 sitemap·generateStaticParams·generateMetadata
    // 가 같은 프로젝트 집합을 공유한다. Next static fetch cache에 의존하지 않는다.
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) {
      console.warn(`[build-time-fetch] HTTP ${res.status}`);
      return buildFallback();
    }
    const data = (await res.json()) as { documents?: FirestoreDocument[] };
    const docs = data.documents ?? [];

    return docs
      .map((doc) => {
        const slug = doc.name.split('/').pop() ?? '';
        const plainFields = parseFields(doc.fields);
        // fromFirestore는 Timestamp instanceof 체크를 하므로
        // 매퍼를 직접 쓰지 않고 plain 데이터로 Project를 구성한다.
        return buildProject(slug, plainFields);
      })
      .filter((p): p is Project => p !== null);
  } catch (err) {
    console.warn('[build-time-fetch] error:', err);
    return buildFallback();
  }
}

function buildProject(slug: string, data: Record<string, unknown>): Project | null {
  if (!slug) return null;

  const tl = (data.timeline as Record<string, unknown> | undefined) ?? {};
  const pos = (data.position as Record<string, unknown> | undefined) ?? {};

  const toDate = (v: unknown): Date | undefined => {
    if (!v) return undefined;
    if (typeof v === 'object' && v !== null && 'toDate' in v) {
      return (v as { toDate: () => Date }).toDate();
    }
    return undefined;
  };

  return {
    slug,
    name: String(data.name ?? ''),
    nameEn: data.nameEn ? String(data.nameEn) : undefined,
    category: (data.category as Project['category']) ?? 'in-progress',
    status: (data.status as Project['status']) ?? 'idea',
    description: String(data.description ?? ''),
    detail: data.detail ? String(data.detail) : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    stack: Array.isArray(data.stack) ? (data.stack as string[]) : [],
    links: Array.isArray(data.links) ? (data.links as Project['links']) : [],
    dependencies: Array.isArray(data.dependencies) ? (data.dependencies as string[]) : [],
    owner: data.owner ? String(data.owner) : undefined,
    icon: data.icon ? String(data.icon) : undefined,
    screenshots: Array.isArray(data.screenshots) ? (data.screenshots as string[]) : [],
    timeline: {
      startedAt: toDate(tl.startedAt),
      launchedAt: toDate(tl.launchedAt),
    },
    progress: typeof data.progress === 'number' ? data.progress : undefined,
    isHub: Boolean(data.isHub),
    position: {
      x: typeof pos.x === 'number' ? pos.x : 0,
      y: typeof pos.y === 'number' ? pos.y : 0,
    },
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  };
}
