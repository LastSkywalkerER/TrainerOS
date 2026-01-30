import { format, addDays, getDay, startOfDay, parseISO, isBefore, isAfter } from 'date-fns';

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'dd.MM.yyyy');
}

export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'dd.MM.yyyy HH:mm');
}

export function formatTime(time: string): string {
  return time; // Already in HH:mm format
}

export function getWeekday(date: Date | string): number {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const day = getDay(dateObj);
  // Convert from Sunday=0 to Monday=1
  return day === 0 ? 7 : day;
}

export function getDatesInRange(startDate: Date, days: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(addDays(startDate, i));
  }
  return dates;
}

export function isDateInRange(date: Date, from?: Date, to?: Date): boolean {
  if (from && isBefore(date, startOfDay(from))) {
    return false;
  }
  if (to && isAfter(date, startOfDay(to))) {
    return false;
  }
  return true;
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

export function addMinutes(timeStr: string, minutes: number): string {
  const { hours, minutes: mins } = parseTime(timeStr);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}
