// Internal tool: never allow search engines to index or follow anything.
export default function robots() {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
