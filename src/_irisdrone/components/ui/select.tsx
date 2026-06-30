import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@irisdrone/lib/utils';

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
 * Custom tactical Select — replaces native <select>.
 * - Click outside to close
 * - Arrow keys navigate, Enter selects, Esc closes
 * - Optional inline filter
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
      )
        return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Reset highlight when opening or filter changes
  useEffect(() => {
    if (open) {
      const idx = Math.max(0, filtered.findIndex((o) => o.value === value));
      setHighlighted(idx);
      setFilter('');
      if (searchable) setTimeout(() => filterInputRef.current?.focus(), 30);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard handler when popover is open
  const onKeyDown = (e: React.KeyboardEvent) => {
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
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(filtered.length - 1, h + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlighted];
      if (opt) {
        onValueChange?.(opt.value);
        setOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setHighlighted(0);
    }
    if (e.key === 'End') {
      e.preventDefault();
      setHighlighted(filtered.length - 1);
    }
  };

  return (
    <div className={cn('tact-select', className)} onKeyDown={onKeyDown}>
      {/* Hidden native input for form submission */}
      {name && <input type="hidden" name={name} value={value || ''} required={required} />}

      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="tact-select-trigger"
      >
        <span className="tact-select-value">
          {selected ? (
            <>
              {selected.icon && <span className="tact-select-icon">{selected.icon}</span>}
              <span>{selected.label}</span>
            </>
          ) : (
            <span className="tact-select-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={cn('tact-select-chevron', open && 'tact-select-chevron-open')}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="tact-select-popover tact-brackets-4"
          role="listbox"
          aria-labelledby={id}
        >
          <span className="tact-corner tact-corner-tl" />
          <span className="tact-corner tact-corner-tr" />
          <span className="tact-corner tact-corner-bl" />
          <span className="tact-corner tact-corner-br" />

          {searchable && (
            <div className="tact-select-search">
              <input
                ref={filterInputRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search…"
                className="tact-select-search-input"
              />
            </div>
          )}

          <div className="tact-select-list scroll-hidden">
            {filtered.length === 0 ? (
              <div className="tact-select-empty">No options</div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isHighlighted = i === highlighted;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onValueChange?.(opt.value);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={cn(
                      'tact-select-option',
                      isHighlighted && 'tact-select-option-highlighted',
                      isSelected && 'tact-select-option-selected'
                    )}
                  >
                    {opt.icon && <span className="tact-select-option-icon">{opt.icon}</span>}
                    <span className="tact-select-option-label">
                      {opt.label}
                      {opt.description && (
                        <span className="tact-select-option-desc">{opt.description}</span>
                      )}
                    </span>
                    {isSelected && (
                      <Check size={12} strokeWidth={2} className="tact-select-option-check" />
                    )}
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
