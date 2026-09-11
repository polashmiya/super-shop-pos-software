import { accentPalette } from '@/config/theme.config';
import type { AccentId, ResolvedTheme, ThemeMode } from '@/types';
import { cn } from '@/components/ui/cn';
import { PREVIEW_PALETTES } from '../themePreview';

/** A tiny drawing of the app window in a theme + accent (sidebar, top bar, cards, Pay button). */
export function MiniWindow({ theme, accent, className }: { theme: ResolvedTheme; accent: AccentId; className?: string }) {
  const palette = PREVIEW_PALETTES[theme];
  const colors = accentPalette(accent, theme);
  const panel = { background: palette.surface, border: `1px solid ${palette.border}` };
  return (
    <div aria-hidden className={cn('flex h-full w-full overflow-hidden', className)} style={{ background: palette.bg }}>
      <div className="flex w-[18%] flex-col items-center gap-1.5 py-2" style={{ background: palette.surface, borderInlineEnd: `1px solid ${palette.border}` }}>
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colors.primary }} />
        <span className="h-1.5 w-3/5 rounded-full" style={{ background: colors.primarySoft }} />
        <span className="h-1.5 w-3/5 rounded-full" style={{ background: palette.surface2 }} />
        <span className="h-1.5 w-3/5 rounded-full" style={{ background: palette.surface2 }} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <div className="h-2.5 rounded-[3px]" style={panel} />
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="flex flex-col justify-end gap-0.5 rounded-[3px] p-1" style={panel}>
              <span className="h-1 w-4/5 rounded-full" style={{ background: palette.fg, opacity: 0.55 }} />
              <span className="h-1 w-2/5 rounded-full" style={{ background: palette.muted, opacity: 0.6 }} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="h-1.5 w-1/3 rounded-full" style={{ background: palette.muted, opacity: 0.45 }} />
          <span className="h-3 w-1/4 rounded-[3px]" style={{ background: colors.primary }} />
        </div>
      </div>
    </div>
  );
}

/** Preview for a theme mode; "System" shows dark and light side by side. */
export function ThemeModePreview({ mode, accent, className }: { mode: ThemeMode; accent: AccentId; className?: string }) {
  if (mode !== 'system') return <MiniWindow theme={mode} accent={accent} className={className} />;
  return (
    <div className={cn('relative h-full w-full', className)}>
      <MiniWindow theme="dark" accent={accent} className="absolute inset-0" />
      <div className="absolute inset-0" style={{ clipPath: 'polygon(56% 0, 100% 0, 100% 100%, 44% 100%)' }}>
        <MiniWindow theme="light" accent={accent} />
      </div>
    </div>
  );
}
