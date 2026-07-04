import { addDays, differenceInCalendarDays, differenceInMonths, differenceInYears, format, isAfter, isValid, parseISO } from 'date-fns';
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

export function isFutureIsoDate(iso: string, today: Date = new Date()) {
  const date = parseISO(iso);
  return isValid(date) && isAfter(date, today);
}

export function formatAgeFromBirthday(birthday?: string, today: Date = new Date()) {
  if (!birthday) return '未設定';
  const birthdayDate = parseISO(birthday);
  if (!isValid(birthdayDate) || isAfter(birthdayDate, today)) return '未設定';

  const years = differenceInYears(today, birthdayDate);
  const months = differenceInMonths(today, birthdayDate) % 12;
  if (years <= 0) return `${Math.max(0, months)}か月`;
  return months > 0 ? `${years}歳${months}か月` : `${years}歳`;
}

export function formatTodayJapanese() {
  return format(new Date(), 'yyyy年M月d日 EEEE', { locale: ja });
}
