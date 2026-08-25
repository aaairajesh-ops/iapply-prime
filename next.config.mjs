/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // the Test Prep marketing page ships as static HTML under /public
    return [{ source: '/test-prep', destination: '/test-prep/index.html' }];
  },
  async headers() {
    return [
      {
        // Belt and braces: tell every crawler to stay out, on every response.
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};
export default nextConfig;
