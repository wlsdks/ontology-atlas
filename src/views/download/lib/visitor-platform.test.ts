import { describe, expect, it } from 'vitest';
import { detectVisitorDesktopPlatform } from './visitor-platform';

describe('detectVisitorDesktopPlatform', () => {
  it('recognises Windows from every mainstream Windows UA', () => {
    for (const ua of [
      // Chrome/Edge on Windows 10+ — 실제 UA 원문 형태.
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    ]) {
      expect(detectVisitorDesktopPlatform(ua)).toBe('windows');
    }
  });

  it('defaults everything else — mac, Linux, iOS, empty — to mac', () => {
    for (const ua of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      // Linux: 받을 앱이 없으므로 「다른 무언가를 감지해 내밀」 대상이 아니다 —
      // macOS 기본 + 항상 떠 있는 브라우저 CTA 가 그 방문자의 정직한 경로다.
      'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
      '',
    ]) {
      expect(detectVisitorDesktopPlatform(ua)).toBe('mac');
    }
  });
});
