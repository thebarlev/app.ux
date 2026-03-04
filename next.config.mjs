/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep typechecking enabled for production safety
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // `playwright-core` must remain a server-only external dependency.
    // Bundling it causes webpack to chase optional deps (electron/chromium-bidi) and fail.
    serverComponentsExternalPackages: ["playwright-core"],
  },
}

export default nextConfig