/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // pdf-parse (pdf.js) must be required at runtime, not bundled by webpack.
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

export default nextConfig;
