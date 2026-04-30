import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
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
      '@': path.resolve(__dirname, './'),
    },
  },
});
