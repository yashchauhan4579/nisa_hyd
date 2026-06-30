import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@sringeri/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
}

/**
 * Custom Select dropdown styled to match the dashboard theme.
 *  • dark zinc surface, amber active state
 *  • click-outside closes, ↑ / ↓ navigate, Enter selects, Esc closes
 *  • optional inline filter
 *
 * Self-contained Tailwind only — no external CSS dependency.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  className,
  disabled,
  searchable = false,
  required,
  name,
  id,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [filter, setFilter] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = filter
    ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Reset filter & highlight when opening
  useEffect(() => {
    if (open) {
      setFilter('');
      setHighlighted(filtered.findIndex((o) => o.value === value) || 0);
      if (searchable) {
        setTimeout(() => filterInputRef.current?.focus(), 0);
      }
    }
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlighted];
      if (opt) {
        onValueChange?.(opt.value);
        setOpen(false);
      }
    }
  };

  return (
    <div className={cn('relative inline-block', className)}>
      {/* Hidden native input for forms */}
      {name && (
        <input type="hidden" name={name} value={value ?? ''} required={required} />
      )}

      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center justify-between gap-2 w-full',
          'h-9 px-3 rounded-md text-xs',
          'bg-zinc-900/50 border border-white/10',
          'text-zinc-200 hover:bg-zinc-800 hover:border-amber-500/30',
          open && 'ring-1 ring-amber-500/40 border-amber-500/40',
          disabled && 'opacity-50 cursor-not-allowed',
          'transition-colors',
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected?.icon && <span className="shrink-0 text-amber-300">{selected.icon}</span>}
          <span className={cn('truncate', !selected && 'text-zinc-500')}>
            {selected?.label || placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-zinc-500 transition-transform shrink-0', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="listbox"
          className="absolute left-0 top-full mt-1 z-50 min-w-full max-h-[280px] flex flex-col rounded-md border border-white/10 bg-zinc-950/95 backdrop-blur-md shadow-xl overflow-hidden"
        >
          {searchable && (
            <div className="border-b border-white/5 p-1.5">
              <input
                ref={filterInputRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search…"
                className="w-full h-7 px-2 rounded bg-zinc-900/60 border border-white/5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40"
              />
            </div>
          )}
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-600">No matches</div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isHi = i === highlighted;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onValueChange?.(opt.value);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs',
                      'transition-colors',
                      isHi ? 'bg-amber-500/10' : 'hover:bg-white/[0.04]',
                      isSelected ? 'text-amber-200' : 'text-zinc-300',
                    )}
                  >
                    {opt.icon && <span className="shrink-0 text-amber-300/80">{opt.icon}</span>}
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="truncate">{opt.label}</span>
                      {opt.description && (
                        <span className="text-[10px] text-zinc-500 truncate">{opt.description}</span>
                      )}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
