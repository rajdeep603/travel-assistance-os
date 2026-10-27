/** The platform logo mark — matches src/app/icon.svg. */
export function BrandMark({ size = 28, idSuffix = "" }: { size?: number; idSuffix?: string }) {
  // One id per size (and suffix): the sidebar's mark is display:none on smaller
  // screens, and a gradient defined inside a hidden SVG can't paint another copy.
  const gradientId = `brand-g-${size}${idSuffix}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
      <path
        d="M32 10l16 6v12c0 11-6.8 19.6-16 24-9.2-4.4-16-13-16-24V16z"
        fill="#ffffff"
        opacity="0.94"
      />
      <path d="M28.5 21h7v7.5H43v7h-7.5V43h-7v-7.5H21v-7h7.5z" fill="#2563eb" />
    </svg>
  );
}

/**
 * The CareTrail logo: the mark and the wordmark (public/brand/caretrail-*.svg).
 * With `tagline`, "Powered by Sthiram" sits under the wordmark; it is only
 * legible from about 80 px tall, so smaller places use the wordmark alone.
 */
export function BrandLogo({ height = 32, tagline = false, className = "" }: { height?: number; tagline?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG, also shown before sign-in
    <img
      src={tagline ? "/brand/caretrail-logo.svg" : "/brand/caretrail-wordmark.svg"}
      alt={tagline ? "CareTrail, powered by Sthiram" : "CareTrail"}
      height={height}
      width={Math.round((height * 515) / 100)}
      translate="no"
      className={`block shrink-0 ${className}`}
      style={{ height, width: "auto" }}
    />
  );
}
