// Disable TLS cert verification for local dev (Supabase SSL chain not trusted on Windows)
if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const securityHeaders = [
  // Prevent browsers from MIME-sniffing the content type
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block the page from being loaded in an iframe on another origin (clickjacking)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Limit referrer info sent to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict browser feature access
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()"
  },
  // Force HTTPS for 1 year in production (browsers ignore this over plain HTTP)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "qskqppddmqudtauzckdn.supabase.co" }
    ]
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
