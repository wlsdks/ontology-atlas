import { describe, expect, it } from 'vitest';
import { isLoopbackAuthority } from './loopback';

describe('isLoopbackAuthority', () => {
  it('is true for this computer, with or without a port', () => {
    for (const authority of ['localhost', 'LocalHost:11434', '127.0.0.1:1234', '127.8.9.10', '[::1]:8080', '[::1]', '[0:0:0:0:0:0:0:1]']) {
      expect(isLoopbackAuthority(authority), authority).toBe(true);
    }
  });

  it('is false for another computer, even one whose name starts like a loopback address', () => {
    for (const authority of [
      '127.0.0.1.evil.example',
      '127.0.0.1.evil.example:443',
      'localhost.example.com',
      '192.168.0.4:11434',
      '10.0.0.127',
      '127.1',
      '127.000.0.1',
      '0x7f.0.0.1',
      '127.0.0.256',
      '[::ffff:127.0.0.1]',
      '[::2]',
      'example.com',
    ]) {
      expect(isLoopbackAuthority(authority), authority).toBe(false);
    }
  });
});
