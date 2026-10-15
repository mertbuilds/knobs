import { props, type StyleXStyles } from '@stylexjs/stylex';

/**
 * Brand marks from Simple Icons (CC0), drawn inline so two logos do not need a
 * package. Filled with `currentColor`, sized like the lucide icons beside them.
 */

type MarkProps = { size?: number };

export function GitHubMark({ size = 16 }: MarkProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function NpmMark({ size = 16 }: MarkProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
    </svg>
  );
}

/**
 * The knobs logo: a copy of `src/assets/logo.svg`, the master. Its colors are
 * its own, the same on the light and the dark ground.
 */
export function KnobsMark({ size = 20, style }: MarkProps & { style?: StyleXStyles | undefined }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 200 200" width={size} {...props(style)}>
      <defs>
        <filter height="180%" id="knob-shadow" width="180%" x="-40%" y="-40%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id="knob-top" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3b3b3a" />
          <stop offset="1" stopColor="#262625" />
        </linearGradient>
      </defs>
      <rect fill="#d6d6d2" height="200" rx="44" width="200" />
      <g stroke="#1b1a17" strokeWidth="2.2">
        <line x1="47.67" x2="42.02" y1="152.33" y2="157.98" />
        <line x1="29.62" x2="22.01" y1="122.87" y2="125.34" />
        <line x1="26.91" x2="19.01" y1="88.42" y2="87.17" />
        <line x1="40.13" x2="33.66" y1="56.5" y2="51.8" />
        <line x1="66.4" x2="62.77" y1="34.07" y2="26.94" />
        <line x1="100" x2="100" y1="26" y2="18" />
        <line x1="133.6" x2="137.23" y1="34.07" y2="26.94" />
        <line x1="159.87" x2="166.34" y1="56.5" y2="51.8" />
        <line x1="173.09" x2="180.99" y1="88.42" y2="87.17" />
        <line x1="170.38" x2="177.99" y1="122.87" y2="125.34" />
        <line x1="152.33" x2="157.98" y1="152.33" y2="157.98" />
      </g>
      <circle cx="100" cy="106" fill="#000" filter="url(#knob-shadow)" opacity="0.28" r="60" />
      <circle cx="100" cy="100" fill="#1f1f1e" r="58" />
      <circle cx="100" cy="100" fill="url(#knob-top)" r="51" />
      <line
        stroke="#f4f3ef"
        strokeLinecap="round"
        strokeWidth="5.5"
        x1="112.86"
        x2="130.21"
        y1="84.68"
        y2="64"
      />
      <circle cx="165.05" cy="165.05" fill="#f25c1b" r="4.5" />
    </svg>
  );
}
