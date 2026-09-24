/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the link-preview thumbnails read these fonts from disk at run time
  outputFileTracingIncludes: { '/og/[dest]/[file]': ['./assets/fonts/**'] },
  async rewrites() {
    // the Test Prep marketing page ships as static HTML under /public
    return [{ source: '/test-prep', destination: '/test-prep/index.html' }];
  },
  async headers() {
    return [
      {
        // Belt and braces: search engines stay out, on every response. No
        // "nosnippet" — that would also blank the WhatsApp / social previews.
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};
export default nextConfig;
