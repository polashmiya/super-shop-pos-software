import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

type Side = 'top' | 'bottom' | 'right' | 'left';

interface TooltipProps {
  content: ReactNode;
  /** Keyboard shortcut shown next to the text. */
  shortcut?: string;
  side?: Side;
  delay?: number;
  disabled?: boolean;
  children: ReactElement<Record<string, unknown>>;
}

interface Position {
  top: number;
  left: number;
}

const GAP = 8;

const TRANSFORM: Record<Side, string> = {
  top: 'translate(-50%, -100%)',
  bottom: 'translate(-50%, 0)',
  right: 'translate(0, -50%)',
  left: 'translate(-100%, -50%)',
};

function placement(element: Element, side: Side): Position {
  const rect = element.getBoundingClientRect();
  switch (side) {
    case 'bottom':
      return { top: rect.bottom + GAP, left: rect.left + rect.width / 2 };
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.right + GAP };
    case 'left':
      return { top: rect.top + rect.height / 2, left: rect.left - GAP };
    default:
      return { top: rect.top - GAP, left: rect.left + rect.width / 2 };
  }
}

/** Lightweight tooltip (portal, hover + keyboard focus). The child keeps its own ref. */
export function Tooltip({ content, shortcut, side = 'top', delay = 350, disabled, children }: TooltipProps) {
  const id = useId();
  const [target, setTarget] = useState<Element | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  // Show after the delay while the trigger stays hovered/focused.
  useEffect(() => {
    if (!target || disabled) return;
    const timer = setTimeout(() => {
      if (target.isConnected) setPosition(placement(target, side));
    }, delay);
    return () => clearTimeout(timer);
  }, [target, delay, side, disabled]);

  const show = (element: Element) => setTarget(element);
  const hide = () => {
    setTarget(null);
    setPosition(null);
  };

  if (!isValidElement(children)) return children;

  const own = children.props;
  const forward = (name: string, event: SyntheticEvent) => {
    const handler = own[name];
    if (typeof handler === 'function') (handler as (event: SyntheticEvent) => void)(event);
  };

  const trigger = cloneElement(children, {
    onMouseEnter: (event: SyntheticEvent) => {
      forward('onMouseEnter', event);
      show(event.currentTarget);
    },
    onMouseLeave: (event: SyntheticEvent) => {
      forward('onMouseLeave', event);
      hide();
    },
    onFocus: (event: SyntheticEvent) => {
      forward('onFocus', event);
      show(event.currentTarget);
    },
    onBlur: (event: SyntheticEvent) => {
      forward('onBlur', event);
      hide();
    },
    onPointerDown: (event: SyntheticEvent) => {
      forward('onPointerDown', event);
      hide();
    },
    'aria-describedby': position ? id : undefined,
  });

  return (
    <>
      {trigger}
      {position &&
        content &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className={cn('pointer-events-none fixed z-[80] max-w-xs rounded-md bg-fg px-2.5 py-1.5 text-xs font-medium text-fg-inverse shadow-lg animate-fade-in')}
            style={{ top: position.top, left: position.left, transform: TRANSFORM[side] }}
          >
            <span>{content}</span>
            {shortcut && <kbd className="ms-2 rounded-sm bg-fg-inverse/15 px-1 font-mono text-[0.68rem]">{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}
