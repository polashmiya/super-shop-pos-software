import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Store logo: the uploaded logo, or the built-in mark (a basket in the
 * accent colour). Used in the sidebar, login screen and receipts.
 */
export function StoreLogo({ size = 36, className }: { size?: number; className?: string }) {
  const logo = useSettingsStore((state) => state.business.store.logo);
  if (logo) {
    return <img src={logo} alt="" width={size} height={size} className={className} style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8 }} />;
  }
  return <LogoMark size={size} className={className} />;
}

export function LogoMark({ size = 36, className, color = 'var(--c-primary)', ink = 'var(--c-primary-fg)' }: { size?: number; className?: string; color?: string; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill={color} />
      <path d="M14.5 20h19l-2.2 12.6a3 3 0 0 1-3 2.4h-8.6a3 3 0 0 1-3-2.4Z" fill="none" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
      <path d="M18.5 20 22 12.5M29.5 20 26 12.5" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <path d="M12 20h24" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <path d="M21 25v5M27 25v5" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
