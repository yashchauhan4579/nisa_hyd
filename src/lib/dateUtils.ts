/**
 * Date and time utilities for IST (Indian Standard Time) conversion
 * IST = UTC + 5:30
 */

// IST timezone offset in minutes
const IST_OFFSET_MINUTES = 330; // 5 hours 30 minutes = 330 minutes

/**
 * Convert UTC date to IST
 */
export function toIST(date: Date | string): Date {
  const utcDate = typeof date === 'string' ? new Date(date) : date;
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return istDate;
}

/**
 * Format date to IST string
 * @param date - UTC date string or Date object
 * @param format - 'full' | 'date' | 'time' | 'datetime' | 'relative'
 */
export function formatIST(
  date: Date | string | null | undefined,
  format: 'full' | 'date' | 'time' | 'datetime' | 'relative' = 'datetime'
): string {
  if (!date) return 'N/A';

  try {
    const istDate = toIST(date);

    switch (format) {
      case 'full':
        // "Thursday, Feb 6, 2026 at 10:30 PM IST"
        return istDate.toLocaleString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'UTC' // Already converted to IST, so use UTC to prevent double conversion
        }) + ' IST';

      case 'date':
        // "Feb 6, 2026"
        return istDate.toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC'
        });

      case 'time':
        // "10:30 PM"
        return istDate.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'UTC'
        });

      case 'datetime':
        // "Feb 6, 10:30 PM"
        return istDate.toLocaleString('en-IN', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'UTC'
        });

      case 'relative':
        // "2 hours ago", "just now", etc.
        return getRelativeTime(istDate);

      default:
        return istDate.toISOString();
    }
  } catch (error) {
    console.error('Error formatting IST date:', error);
    return 'Invalid date';
  }
}

/**
 * Get relative time string (e.g., "2 hours ago", "just now")
 */
function getRelativeTime(date: Date): string {
  const now = toIST(new Date());
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return formatIST(date, 'date');
}

/**
 * Get current IST time
 */
export function nowIST(): Date {
  return toIST(new Date());
}

/**
 * Format time range for display
 */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatIST(start, 'datetime')} - ${formatIST(end, 'time')} IST`;
}

/**
 * Get IST date string for API queries (ISO format but IST time)
 */
export function getISTDateString(date: Date | string): string {
  const istDate = toIST(date);
  return istDate.toISOString();
}

/**
 * Format for charts/graphs (compact format)
 */
export function formatChartTime(date: Date | string, groupBy: 'hour' | 'day' | 'month' = 'hour'): string {
  const istDate = toIST(date);

  switch (groupBy) {
    case 'hour':
      // "10 PM" or "2 AM"
      return istDate.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        hour12: true,
        timeZone: 'UTC'
      });

    case 'day':
      // "Feb 6"
      return istDate.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
      });

    case 'month':
      // "Feb 2026"
      return istDate.toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      });

    default:
      return formatIST(date, 'datetime');
  }
}

/**
 * Convert UTC hour (0-23) to IST hour (0-23)
 * Example: UTC hour 4 -> IST hour 9 (4:00 UTC = 9:30 IST, displayed as 9)
 */
export function utcHourToIST(utcHour: number): number {
  // Add 5.5 hours (IST offset)
  const istHour = (utcHour + 5.5) % 24;
  return Math.floor(istHour);
}

/**
 * Format UTC hour to IST time range
 * Example: 4 -> "9:30 AM - 10:30 AM IST"
 */
export function formatUTCHourToIST(utcHour: number): string {
  const istHour = utcHour + 5; // 5 hours
  const istMinute = 30; // 30 minutes

  const startHour = (istHour + Math.floor(istMinute / 60)) % 24;
  const startMinute = istMinute % 60;
  const endHour = (startHour + 1) % 24;
  const endMinute = startMinute;

  const formatHour = (hour: number, minute: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
  };

  return `${formatHour(startHour, startMinute)} - ${formatHour(endHour, endMinute)} IST`;
}

/**
 * Format UTC hour to IST time range (compact for lists)
 * Example: 4 -> "9:30 - 10:30"
 */
export function formatUTCHourToISTCompact(utcHour: number): string {
  const istHour = utcHour + 5;
  const istMinute = 30;

  const startHour = (istHour + Math.floor(istMinute / 60)) % 24;
  const startMinute = istMinute % 60;
  const endHour = (startHour + 1) % 24;
  const endMinute = startMinute;

  return `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')} - ${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
}

/**
 * Get start of today in IST (as UTC Date for API calls)
 * Returns a Date object representing 00:00 IST today in UTC time
 * Example: If IST date is Feb 16, returns Feb 15 18:30 UTC
 */
export function getTodayStartIST(): Date {
  const now = new Date(); // Current UTC time
  const istNow = toIST(now); // Convert to IST

  // Get IST date at 00:00
  const istYear = istNow.getUTCFullYear();
  const istMonth = istNow.getUTCMonth();
  const istDate = istNow.getUTCDate();

  // Create date at 00:00 IST
  const istMidnight = new Date(Date.UTC(istYear, istMonth, istDate, 0, 0, 0, 0));

  // Convert back to UTC by subtracting IST offset
  const utcMidnight = new Date(istMidnight.getTime() - IST_OFFSET_MINUTES * 60 * 1000);

  return utcMidnight;
}
