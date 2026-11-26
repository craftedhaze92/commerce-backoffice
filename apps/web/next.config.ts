import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 모노레포 루트를 명시해 다른 lockfile을 워크스페이스 루트로 오인하지 않도록 한다
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  reactCompiler: true,
  // 상품 등록·상세는 목록 위 모달로 옮겼다. 예전 주소로 들어오면 목록(상세는 ?detail=)으로 보낸다
  async redirects() {
    return [
      { source: '/products/new', destination: '/products', permanent: false },
      { source: '/products/:id', destination: '/products?detail=:id', permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:4000'}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${process.env.MEDIA_ORIGIN ?? 'http://localhost:9090/bo-media'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
