import { type ReactNode } from 'react';
import { cn } from '@irisdrone/lib/utils';
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
 * Tactical filter bar with grouped icon-pill filters.
 * Each group has its own label + icon, and a row of selectable pills.
 * Active pills get accent glow + corner brackets.
 */
export function FilterBar({ groups, leading, trailing, className, compact = false }: FilterBarProps) {
  const activeFilters = groups.filter((g) => g.defaultValue && g.value !== g.defaultValue);
  const hasActive = activeFilters.length > 0;

  return (
    <div className={cn('tact-filter-bar', className)}>
      {leading && <div className="tact-filter-leading">{leading}</div>}

      <div className="tact-filter-groups">
        {groups.map((group) => (
          <FilterGroupView key={group.id} group={group} compact={compact} />
        ))}
      </div>

      {trailing && <div className="tact-filter-trailing">{trailing}</div>}

      {hasActive && (
        <div className="tact-filter-active-bar">
          <span className="tact-filter-active-label">ACTIVE</span>
          {activeFilters.map((g) => {
            const opt = g.options.find((o) => o.value === g.value);
            return (
              <button
                key={g.id}
                onClick={() => g.defaultValue && g.onChange(g.defaultValue)}
                className="tact-filter-active-chip"
                aria-label={`Clear ${g.label}`}
              >
                <span className="tact-filter-active-chip-label">{g.label}:</span>
                <span className="tact-filter-active-chip-value">{opt?.label || g.value}</span>
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            );
          })}
          <button
            onClick={() => groups.forEach((g) => g.defaultValue && g.onChange(g.defaultValue))}
            className="tact-filter-active-clear"
          >
            CLEAR ALL
          </button>
        </div>
      )}
    </div>
  );
}

function FilterGroupView({ group, compact }: { group: FilterGroup; compact: boolean }) {
  const GroupIcon = group.icon;

  return (
    <div className="tact-filter-group">
      {!compact && (
        <div className="tact-filter-group-head">
          {GroupIcon && <GroupIcon className="w-3 h-3" strokeWidth={1.75} />}
          <span>{group.label}</span>
        </div>
      )}
      <div className="tact-filter-group-pills">
        {group.options.map((opt) => {
          const isActive = group.value === opt.value;
          const OptIcon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => group.onChange(opt.value)}
              data-active={isActive}
              className="tact-filter-pill"
              aria-pressed={isActive}
            >
              {OptIcon && <OptIcon className="w-3.5 h-3.5" strokeWidth={1.75} />}
              <span>{opt.label}</span>
              {opt.count !== undefined && (
                <span className="tact-filter-pill-count">{opt.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
