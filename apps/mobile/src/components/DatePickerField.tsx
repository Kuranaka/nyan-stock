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
  const selectedDate = value ? parseDateOrToday(value) : undefined;
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
          setShownMonth(parseDateOrToday(value));
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
              title="前月"
              variant="secondary"
              onPress={() => setShownMonth((current) => addMonths(current, -1))}
            />
            <Text style={styles.calendarTitle}>{format(shownMonth, 'yyyy年M月')}</Text>
            <AppButton
              title="翌月"
              variant="secondary"
              onPress={() => setShownMonth((current) => addMonths(current, 1))}
            />
          </View>
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
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
