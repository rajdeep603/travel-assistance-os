/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // Required at runtime instead of bundled by webpack: pdf-parse (pdf.js
    // worker), the Twilio SDK (large, dynamic requires) and pdfkit (reads its
    // font metrics from disk). Output tracing
    // copies them into the standalone build.
    serverComponentsExternalPackages: ["pdf-parse", "twilio", "pdfkit"],
  },
};

export default nextConfig;
