import type { PosLayout } from '@/types';
import { cn } from '@/components/ui/cn';

/* Tiny drawings of the two cashier screens for the layout choice (tokens only). */

function Row({ wide }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn('h-1 rounded-full bg-fg/55', wide ? 'w-3/5' : 'w-2/5')} />
      <span className="ms-auto h-1 w-[12%] rounded-full bg-fg/35" />
    </div>
  );
}

function PayBar() {
  return <span className="mt-auto block h-2.5 w-full rounded-[3px] bg-primary" />;
}

export function PosLayoutPreview({ layout, className }: { layout: PosLayout; className?: string }) {
  return (
    <div aria-hidden className={cn('flex h-full w-full gap-1.5 overflow-hidden rounded-md border border-border bg-bg p-1.5', className)}>
      {layout === 'grid' ? (
        <>
          <div className="flex min-w-0 flex-[3] flex-col gap-1.5">
            <div className="h-2.5 rounded-[3px] border border-primary/60 bg-surface" />
            <div className="grid flex-1 grid-cols-3 gap-1">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <div key={index} className="flex flex-col justify-end gap-0.5 rounded-[3px] border border-border bg-surface p-1">
                  <span className="mb-auto h-2 w-full rounded-[2px] bg-surface-3" />
                  <span className="h-1 w-4/5 rounded-full bg-fg/55" />
                  <span className="h-1 w-2/5 rounded-full bg-fg/35" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-[1.4] flex-col gap-1 rounded-[3px] border border-border bg-surface p-1.5">
            <Row />
            <Row />
            <Row />
            <PayBar />
          </div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-[3.2] flex-col gap-1.5">
            <div className="h-3 rounded-[3px] border border-primary/60 bg-surface" />
            <div className="flex flex-1 flex-col gap-1 rounded-[3px] border border-border bg-surface p-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                <Row key={index} wide />
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1 rounded-[3px] border border-border bg-surface p-1.5">
            <span className="h-3 w-full rounded-[2px] bg-primary-soft" />
            <Row />
            <PayBar />
          </div>
        </>
      )}
    </div>
  );
}
