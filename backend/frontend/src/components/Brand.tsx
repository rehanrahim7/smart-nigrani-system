/**
 * The Smart Nigrani System mark and wordmark.
 *
 * The mark is an eye (oversight) whose iris holds three bars (public data),
 * on a burnt-orange tile. It is the same drawing as public/favicon.svg, so the
 * browser tab, the phone icon and the header all match.
 */

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <path
        d="M8 32C16.5 19.5 24.5 14.5 32 14.5S47.5 19.5 56 32C47.5 44.5 39.5 49.5 32 49.5S16.5 44.5 8 32Z"
        fill="none"
        stroke="#fffaf5"
        strokeWidth="4.2"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="10.5" fill="#fffaf5" />
      <rect x="25.6" y="31" width="3.4" height="7" rx="1" fill="#29352d" />
      <rect x="30.3" y="26" width="3.4" height="12" rx="1" fill="#29352d" />
      <rect x="35" y="29" width="3.4" height="9" rx="1" fill="#29352d" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="row brand" style={{ gap: 10 }}>
      <Mark size={compact ? 26 : 32} />
      <span className="col" style={{ gap: 1, lineHeight: 1.1, minWidth: 0 }}>
        <span className="brand-name">
          Smart <em>Nigrani</em> System
        </span>
        <span className="brand-sub">MPLADS Overview</span>
      </span>
    </span>
  );
}
