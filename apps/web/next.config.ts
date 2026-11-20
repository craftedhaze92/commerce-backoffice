import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 모노레포 루트를 명시해 다른 lockfile을 워크스페이스 루트로 오인하지 않도록 한다
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
