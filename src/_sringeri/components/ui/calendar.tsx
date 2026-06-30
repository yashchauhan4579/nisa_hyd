'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@sringeri/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3 select-none', className)}
      classNames={{
        root: '',
        months: '',
        month: '',
        month_caption: 'flex justify-center items-center relative h-8 mb-2',
        caption_label: 'text-sm font-medium text-zinc-100',
        nav: '',
        button_previous: [
          'absolute left-0 h-7 w-7 rounded-md border border-white/10',
          'hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors',
          'inline-flex items-center justify-center',
        ].join(' '),
        button_next: [
          'absolute right-0 h-7 w-7 rounded-md border border-white/10',
          'hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors',
          'inline-flex items-center justify-center',
        ].join(' '),
        month_grid: 'w-full border-collapse',
        weekdays: '',                          // <tr> — keep as table-row
        weekday: 'text-zinc-500 text-[11px] font-normal text-center pb-1 w-9',  // <th>
        weeks: '',                             // <tbody> — keep as table
        week: '',                              // <tr> — keep as table-row
        day: 'p-0 text-center align-middle w-9 h-8',   // <td>
        day_button: [
          'h-8 w-9 p-0 font-normal rounded-md text-sm text-zinc-300',
          'hover:bg-white/10 hover:text-zinc-100 transition-colors',
          'inline-flex items-center justify-center',
        ].join(' '),
        selected: '[&>button]:!bg-amber-600 [&>button]:!text-white',
        today: '[&>button]:bg-white/10 [&>button]:text-zinc-100',
        outside: '[&>button]:text-zinc-600 [&>button]:opacity-40',
        disabled: '[&>button]:text-zinc-700 [&>button]:opacity-30 [&>button]:cursor-not-allowed',
        hidden: 'invisible',
        range_middle: '[&>button]:bg-amber-500/20 [&>button]:rounded-none',
        range_start: '[&>button]:!bg-amber-600 [&>button]:!text-white',
        range_end: '[&>button]:!bg-amber-600 [&>button]:!text-white',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left'
            ? <ChevronLeft className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
