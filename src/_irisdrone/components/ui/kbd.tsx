import { type ReactNode } from 'react';
import { cn } from '@irisdrone/lib/utils';

interface KbdProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'subtle' | 'accent';
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Tactical keyboard key chip — visually represents a key the user can press.
 * Use inline next to actions: <button>Submit <Kbd>↵</Kbd></button>
 * Or to render a chord: <Kbd>⌘</Kbd><Kbd>K</Kbd>
 */
export function Kbd({ children, className, variant = 'default', size = 'sm' }: KbdProps) {
  return (
    <kbd className={cn('tact-kbd', `tact-kbd--${variant}`, `tact-kbd--${size}`, className)}>
      {children}
    </kbd>
  );
}

interface KbdGroupProps {
  keys: ReadonlyArray<string>;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'default' | 'subtle' | 'accent';
  separator?: ReactNode;
  className?: string;
}

/**
 * Renders a chord like ["⌘", "K"] or ["G", "I"] as a sequence of key chips.
 */
export function KbdGroup({ keys, size = 'sm', variant = 'default', separator, className }: KbdGroupProps) {
  return (
    <span className={cn('tact-kbd-group', className)}>
      {keys.map((k, i) => (
        <span key={i} className="tact-kbd-group-item">
          {i > 0 && separator !== undefined ? <span className="tact-kbd-sep">{separator}</span> : null}
          <Kbd size={size} variant={variant}>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}
