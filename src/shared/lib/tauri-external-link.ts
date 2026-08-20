import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * 앱 **밖**으로 나가는 링크를 실제로 열어 주는 한 곳.
 *
 * ## 왜 있나 (2026-08-20 워크스루에서 적발)
 *
 * 앱 안의 `<a target="_blank">` 는 **아무 일도 안 했다.** Tauri WebView 는 새
 * 창을 열지 않고 이 앱에는 그것을 처리하는 플러그인도 없었다. 그래서 설정의
 * 「↗ 설치 방법」을 눌러도 조용히 아무 일도 안 일어났다 — 도구가 하나도 없는
 * 사람에게 우리가 준 **유일한 다음 걸음**이 그것이었는데.
 *
 * 소유자 보고 그대로다: *"눌러도 반응이없음 설치방법은!"*
 *
 * ## 왜 링크마다 고치지 않고 가로채나
 *
 * 밖으로 나가는 링크는 **10개 파일**에 흩어져 있다. 하나씩 고치면 열한 번째를
 * 빠뜨리고, 그때 그 링크는 **아무 소리 없이** 죽는다(에러도 안 난다). 그래서
 * 한 곳에서 클릭을 가로챈다 — 새로 만드는 링크도 저절로 덮인다.
 *
 * ## 웹에서는 아무것도 안 한다
 *
 * 브라우저는 이미 `target="_blank"` 를 제대로 연다. Tauri 가 아니면 이
 * 가로채기는 붙지도 않는다.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  try {
    return isTauri() ? (tauriInvoke as TauriInvoke) : null;
  } catch {
    return null;
  }
}

/** 앱이 열어 줄 수 있는 주소인가. Rust 쪽 `is_openable_url` 과 같은 규칙. */
export function isExternalHttpUrl(href: string): boolean {
  const value = href.trim().toLowerCase();
  return (
    (value.startsWith('https://') || value.startsWith('http://')) && !/\s/.test(href)
  );
}

/**
 * 밖으로 나가는 링크 클릭을 가로채 OS 에 넘긴다. 떼는 함수를 돌려준다.
 *
 * 캡처 단계에서 듣는다 — 그래야 링크를 감싼 다른 핸들러가 먼저 삼켜도 이쪽이
 * 먼저 본다.
 */
export function installExternalLinkOpener(doc: Document = document): () => void {
  const invoke = getInvoke();
  if (!invoke) return () => undefined;

  const onClick = (event: MouseEvent) => {
    // 새 탭/새 창을 뜻하는 보조키 조합은 건드리지 않는다 — 그건 사용자가
    // 브라우저 관습대로 한 것이고, 앱에서는 어차피 같은 결과가 된다.
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const href = anchor.getAttribute('href') ?? '';
    if (!isExternalHttpUrl(href)) return;

    event.preventDefault();
    void invoke('open_external_url', { url: href }).catch(() => {
      // 못 열었다고 앱을 세우지 않는다. 이 자리에서 할 수 있는 정직한 일은
      // 아무 일도 안 하는 것이고, 그건 고치기 전과 같은 상태다.
    });
  };

  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}
