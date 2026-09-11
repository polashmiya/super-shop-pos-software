import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, ScanBarcode, TriangleAlert } from 'lucide-react';
import { t } from '@/i18n';

interface Props {
  children: ReactNode;
  onGoHome?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a failing screen from crashing the whole application (spec §101).
 * Other screens keep working and no data is lost (everything is saved
 * transactionally before the UI updates).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-soft text-warning-text">
          <TriangleAlert size={32} aria-hidden />
        </span>
        <div>
          <h2 className="type-h2 text-fg">{t('shell.errorBoundary.title')}</h2>
          <p className="type-body mt-1 text-fg-muted">{t('shell.errorBoundary.message')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="inline-flex min-h-touch items-center gap-2 rounded-md border border-border bg-surface-2 px-4 font-semibold text-fg hover:bg-surface-3"
          >
            <RotateCcw size={18} aria-hidden />
            {t('shell.errorBoundary.reload')}
          </button>
          {this.props.onGoHome && (
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onGoHome?.();
              }}
              className="inline-flex min-h-touch items-center gap-2 rounded-md bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <ScanBarcode size={18} aria-hidden />
              {t('shell.errorBoundary.goPos')}
            </button>
          )}
        </div>
      </div>
    );
  }
}
