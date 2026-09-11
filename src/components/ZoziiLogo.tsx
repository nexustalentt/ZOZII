interface ZoziiLogoProps {
  size?: number
}

export default function ZoziiLogo({ size = 28 }: ZoziiLogoProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="zozii-logo"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="zozii-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d472" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path
        d="M6 6h12L8 18h10"
        stroke="url(#zozii-logo-grad)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="6" r="2.8" fill="#22d472" />
      <circle cx="18" cy="6" r="2.8" fill="#38bdf8" />
      <circle cx="8" cy="18" r="2.8" fill="#22d472" />
      <circle cx="18" cy="18" r="2.8" fill="#38bdf8" />
    </svg>
  )
}