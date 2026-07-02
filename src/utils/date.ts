import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function nowIso() {
  return new Date().toISOString();
}

export function addDaysIso(baseDate: string, days: number) {
  return format(addDays(parseISO(baseDate), days), 'yyyy-MM-dd');
}

export function daysUntil(targetIso: string, today: Date = new Date()) {
  return differenceInCalendarDays(parseISO(targetIso), today);
}

export function formatDisplayDate(iso?: string) {
  if (!iso) return '未設定';
  return format(parseISO(iso), 'yyyy年M月d日', { locale: ja });
}

export function formatTodayJapanese() {
  return format(new Date(), 'yyyy年M月d日 EEEE', { locale: ja });
}
