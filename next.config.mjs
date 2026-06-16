/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native/heavy packages are only used by the standalone worker, never bundled
  // into Next.js server functions. Mark them external so Next does not try to
  // trace/bundle their binaries.
  serverExternalPackages: [
    "mongoose",
    "playwright",
    "@remotion/renderer",
    "@remotion/bundler",
    "fluent-ffmpeg",
  ],
  eslint: {
    // Linting is run separately; do not block production builds on lint errors.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
