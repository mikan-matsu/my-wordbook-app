import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.appsync-api.ap-northeast-1.amazonaws.com https://*.amazonaws.com; img-src 'self' data: https:; font-src 'self' data:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
