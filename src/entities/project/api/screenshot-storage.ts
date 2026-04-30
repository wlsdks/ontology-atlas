import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getBucket } from '@/shared/api';
import { normalizeAccountId } from '@/shared/lib/account-scope';

/**
 * 프로젝트 스크린샷을 Firebase Storage에 업로드하고 download URL을 반환.
 * 저장 경로: screenshots/{slug}/{timestamp}-{safeName} — storage.rules와 일치해야 함.
 */
export async function uploadScreenshot(
  slug: string,
  file: File,
  accountId?: string | null,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const normalizedAccountId = normalizeAccountId(accountId);
  const path = normalizedAccountId
    ? `accounts/${normalizedAccountId}/screenshots/${slug}/${Date.now()}-${safeName}`
    : `screenshots/${slug}/${Date.now()}-${safeName}`;
  const bucket = getBucket();
  const r = ref(bucket, path);
  await uploadBytes(r, file, { contentType: file.type });
  return await getDownloadURL(r);
}

/**
 * 스토리지에서 스크린샷 삭제. 실패(없는 객체 등)는 무시.
 * URL은 `https://firebasestorage.googleapis.com/v0/b/.../o/projects%2Fslug%2Ffile` 형태.
 */
export async function deleteScreenshot(url: string): Promise<void> {
  try {
    const bucket = getBucket();
    // URL에서 /o/ 뒤의 경로를 디코드
    const match = url.match(/\/o\/([^?]+)/);
    if (!match) return;
    const path = decodeURIComponent(match[1]);
    await deleteObject(ref(bucket, path));
  } catch (err) {
    console.warn('[deleteScreenshot] failed', err);
  }
}
