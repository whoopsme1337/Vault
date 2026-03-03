/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No backend — purely static-compatible
  output: 'standalone',
};

module.exports = nextConfig;
