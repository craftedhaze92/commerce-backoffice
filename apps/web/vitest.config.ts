import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.json의 "@/*" alias를 그대로 사용
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    // 상대 경로 fetch('/api/v1/...')가 동작하도록 jsdom 기준 URL을 고정한다.
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
