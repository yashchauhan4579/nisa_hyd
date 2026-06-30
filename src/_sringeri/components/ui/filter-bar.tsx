import { type ReactNode } from 'react';
import { cn } from '@sringeri/lib/utils';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export interface FilterGroup {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Currently selected value (for single-select) */
  value: string;
  /** Default value that means "no filter" — usually 'all' */
  defaultValue?: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  groups: FilterGroup[];
  /** Optional left-side action node (e.g., search input) */
  leading?: ReactNode;
  /** Optional right-side action node (e.g., reset button) */
  trailing?: ReactNode;
  className?: string;
  /** Hide group labels (compact mode) */
  compact?: boolean;
}

/**
 * Filter bar themed to match the dashboard:
 *   • dark zinc card surface with subtle white/5 border
 *   • saffron-amber active pill state
 *   • grouped pills with optional leading area for search/select inputs
 */
export function FilterBar({ groups, leading, trailing, className, compact = false }: FilterBarProps) {
  const activeFilters = groups.filter((g) => g.defaultValue && g.value !== g.defaultValue);
  const hasActive = activeFilters.length > 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-white/5 bg-zinc-900/40 backdrop-blur-sm px-4 py-3',
        'flex flex-col gap-3',
        className,
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-end gap-x-6 gap-y-3 flex-wrap">
        {leading && <div className="flex-shrink-0 min-w-0">{leading}</div>}

        <div className="flex flex-wrap gap-x-6 gap-y-3 flex-1 min-w-0">
          {groups.map((group) => (
            <FilterGroupView key={group.id} group={group} compact={compact} />
          ))}
        </div>

        {trailing && <div className="flex-shrink-0">{trailing}</div>}
      </div>

      {hasActive && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300/70 mr-1">Active</span>
          {activeFilters.map((g) => {
            const opt = g.options.find((o) => o.value === g.value);
            return (
              <button
                key={g.id}
                onClick={() => g.defaultValue && g.onChange(g.defaultValue)}
                className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 hover:bg-amber-500/15 transition-colors"
                aria-label={`Clear ${g.label}`}
              >
                <span className="text-[9px] uppercase tracking-wider text-amber-400/70">{g.label}:</span>
                <span className="text-[10px] font-semibold">{opt?.label || g.value}</span>
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            );
          })}
          <button
            onClick={() => groups.forEach((g) => g.defaultValue && g.onChange(g.defaultValue))}
            className="ml-auto text-[9px] uppercase tracking-widest font-bold text-zinc-500 hover:text-amber-300 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function FilterGroupView({ group, compact }: { group: FilterGroup; compact: boolean }) {
  const GroupIcon = group.icon;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {!compact && (
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          {GroupIcon && <GroupIcon className="w-3 h-3" strokeWidth={1.75} />}
          <span>{group.label}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 bg-black/20 border border-white/5 rounded-lg p-0.5">
        {group.options.map((opt) => {
          const isActive = group.value === opt.value;
          const OptIcon = opt.icon;
          return (
            <button
              key={opt.value}
              onClick={() => group.onChange(opt.value)}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all',
                isActive
                  ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40 shadow-[0_0_10px_rgba(251,191,36,0.15)]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent',
              )}
            >
              {OptIcon && <OptIcon className="w-3 h-3" strokeWidth={1.75} />}
              <span>{opt.label}</span>
              {typeof opt.count === 'number' && (
                <span
                  className={cn(
                    'ml-0.5 text-[9px] font-mono',
                    isActive ? 'text-amber-300/80' : 'text-zinc-500',
                  )}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Simple labeled wrapper for an arbitrary input (search/select/range picker)
 * that mirrors the FilterGroupView header so leading inputs line up cleanly
 * with grouped pills.
 */
export function FilterField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
        {Icon && <Icon className="w-3 h-3" strokeWidth={1.75} />}
        <span>{label}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
