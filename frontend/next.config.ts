import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Strict mode catches potential React issues early
  reactStrictMode: true,

  // Phase 2: uncomment to proxy API calls through Next.js (avoids CORS in production)
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/:path*',
  //       destination: 'http://localhost:8000/api/:path*',
  //     },
  //   ]
  // },
}

export default nextConfig
