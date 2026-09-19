export default function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <rect x="24" y="9" width="16" height="7" rx="2" fill="#f5b400" />
      <rect x="14" y="16" width="36" height="42" rx="6" stroke="#f5b400" strokeWidth="4" />
      <path d="M35 24 23 40h8l-2 11 12-17h-8z" fill="#f5b400" />
    </svg>
  );
}
