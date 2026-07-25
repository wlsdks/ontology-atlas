import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'app/**/*.test.{ts,tsx}',
      'app/**/*.spec.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      'tests/contract/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**'],
    // next-intl 을 Node ESM 으로 externalize 하면 `next/navigation` 서브패스가
    // pnpm 가상 스토어 realpath 기준으로 resolve 되지 못해 테스트 파일 로드
    // 자체가 깨진다 (2026-07 재구성 중 15개 파일 동시 실패로 표면화). vite
    // 인라인 처리로 vite 리졸버가 서브패스를 해석하게 한다.
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
  },
  resolve: {
    // @rollup/plugin-alias 는 등록 순서대로 prefix 매칭해 첫 매칭을 채택한다.
    // 따라서 구체적 prefix (`@/shared` 등) 를 일반 prefix (`@`) 보다 먼저 둬야
    // `@/shared/api` → `src/shared/api` 로 올바로 리라이트 된다.
    alias: {
      '@/app-providers': path.resolve(__dirname, './src/app'),
      '@/views': path.resolve(__dirname, './src/views'),
      '@/widgets': path.resolve(__dirname, './src/widgets'),
      '@/features': path.resolve(__dirname, './src/features'),
      '@/entities': path.resolve(__dirname, './src/entities'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      // tsconfig paths 의 `@/i18n/*` 와 정합 — vitest 의 fallback `@/*` →
      // `./*` 가 `@/i18n/foo` 를 `./i18n/foo` (존재 X) 로 잘못 resolve 하지
      // 않도록 명시. 현재 .test.{ts,tsx} 에 i18n alias import 가 없어 latent
      // 회귀였음.
      '@/i18n': path.resolve(__dirname, './src/i18n'),
      '@': path.resolve(__dirname, './'),
    },
  },
});
