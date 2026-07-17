import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  isSameDay,
  isSameMonth,
  parseISO,
  setYear,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import { AppButton } from '@/components/AppButton';
import { colors } from '@/constants/colors';
import { formatDisplayDate, todayIso } from '@/utils/date';

type Props = {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  requirement?: 'required' | 'optional';
  placeholder?: string;
  openSignal?: number;
};

export function DatePickerField({
  label,
  value,
  onChange,
  requirement,
  placeholder = '日付を選択',
  openSignal,
}: Props) {
  const [shownMonth, setShownMonth] = useState(() => parseDateOrToday(value));
  const [open, setOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [yearRangeStart, setYearRangeStart] = useState(() => getYearRangeStart(shownMonth));
  const selectedDate = value ? parseDateOrToday(value) : undefined;
  const visibleYears = useMemo(
    () => Array.from({ length: 12 }, (_, index) => yearRangeStart + index),
    [yearRangeStart],
  );
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(shownMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(endOfMonth(monthStart)),
    });
  }, [shownMonth]);

  useEffect(() => {
    if (!openSignal) return;
    setShownMonth(parseDateOrToday(value));
    setYearPickerOpen(false);
    setOpen(true);
  }, [openSignal, value]);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {requirement ? (
          <Text
            style={[
              styles.requirementBadge,
              requirement === 'required' ? styles.requiredBadge : styles.optionalBadge,
            ]}
          >
            {requirement === 'required' ? '必須' : '任意'}
          </Text>
        ) : null}
      </View>
      <AppButton
        title={value ? formatDisplayDate(value) : placeholder}
        variant="secondary"
        onPress={() => {
          const nextMonth = parseDateOrToday(value);
          setShownMonth(nextMonth);
          setYearRangeStart(getYearRangeStart(nextMonth));
          setYearPickerOpen(false);
          setOpen((current) => !current);
        }}
      />
      {requirement === 'optional' && value ? (
        <AppButton title="未設定に戻す" variant="ghost" onPress={() => onChange('')} />
      ) : null}
      {open ? (
        <View style={styles.calendarBox}>
          <View style={styles.calendarHeader}>
            <AppButton
              title={yearPickerOpen ? '前の12年' : '前月'}
              variant="secondary"
              onPress={() => {
                if (yearPickerOpen) {
                  setYearRangeStart((current) => current - 12);
                  return;
                }
                setShownMonth((current) => addMonths(current, -1));
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="年を選ぶ"
              onPress={() => {
                setYearRangeStart(getYearRangeStart(shownMonth));
                setYearPickerOpen((current) => !current);
              }}
              style={({ pressed }) => [styles.calendarTitleButton, pressed && styles.calendarTitlePressed]}
            >
              <Text style={styles.calendarTitle}>
                {yearPickerOpen ? `${yearRangeStart}年〜${yearRangeStart + 11}年` : format(shownMonth, 'yyyy年M月')}
              </Text>
              <Text style={styles.yearPickerHint}>{yearPickerOpen ? '月を選ぶ' : '年を選ぶ'}</Text>
            </Pressable>
            <AppButton
              title={yearPickerOpen ? '次の12年' : '翌月'}
              variant="secondary"
              onPress={() => {
                if (yearPickerOpen) {
                  setYearRangeStart((current) => current + 12);
                  return;
                }
                setShownMonth((current) => addMonths(current, 1));
              }}
            />
          </View>
          {yearPickerOpen ? (
            <View style={styles.yearGrid}>
              {visibleYears.map((year) => {
                const selected = year === shownMonth.getFullYear();
                return (
                  <Pressable
                    key={year}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setShownMonth((current) => setYear(current, year));
                      setYearPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.yearButton,
                      selected && styles.yearButtonSelected,
                      pressed && styles.calendarDayPressed,
                    ]}
                  >
                    <Text style={[styles.yearButtonText, selected && styles.yearButtonTextSelected]}>{year}年</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
          <View style={styles.calendarGrid}>
            {['日', '月', '火', '水', '木', '金', '土'].map((dayLabel) => (
              <Text key={dayLabel} style={styles.calendarWeekday}>
                {dayLabel}
              </Text>
            ))}
            {calendarDays.map((day) => {
              const dayIso = format(day, 'yyyy-MM-dd');
              const selected = selectedDate ? isSameDay(day, selectedDate) : false;
              const inMonth = isSameMonth(day, shownMonth);
              return (
                <Pressable
                  key={dayIso}
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(dayIso);
                    setShownMonth(day);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.calendarDay,
                    !inMonth && styles.calendarDayOutside,
                    selected && styles.calendarDaySelected,
                    pressed && styles.calendarDayPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      !inMonth && styles.calendarDayTextOutside,
                      selected && styles.calendarDayTextSelected,
                    ]}
                  >
                    {format(day, 'd')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function parseDateOrToday(value?: string) {
  if (!value) return parseISO(todayIso());
  const date = parseISO(value);
  return isValid(date) ? date : parseISO(todayIso());
}

function getYearRangeStart(date: Date) {
  return Math.floor(date.getFullYear() / 12) * 12;
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  requirementBadge: {
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  requiredBadge: {
    backgroundColor: colors.dangerLight,
    color: colors.danger,
  },
  optionalBadge: {
    backgroundColor: colors.muted,
    color: colors.subText,
  },
  calendarBox: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  calendarTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  calendarTitleButton: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    paddingVertical: 4,
  },
  calendarTitlePressed: {
    opacity: 0.7,
  },
  yearPickerHint: {
    color: colors.subText,
    fontSize: 11,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearButton: {
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 42,
    width: '31.5%',
  },
  yearButtonSelected: {
    backgroundColor: colors.primary,
  },
  yearButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  yearButtonTextSelected: {
    color: colors.card,
  },
  calendarWeekday: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'center',
    width: `${100 / 7}%`,
  },
  calendarDay: {
    alignItems: 'center',
    aspectRatio: 1,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  calendarDayOutside: {
    opacity: 0.45,
  },
  calendarDaySelected: {
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  calendarDayPressed: {
    opacity: 0.75,
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  calendarDayTextOutside: {
    color: colors.subText,
  },
  calendarDayTextSelected: {
    color: colors.card,
  },
});
