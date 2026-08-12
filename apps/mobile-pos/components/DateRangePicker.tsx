import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

/**
 * Self-contained month calendar for picking an arbitrary start/end date.
 *
 * Deliberately dependency-free: adding a native date-picker module would force
 * everyone to rebuild the dev client, and the POS only needs day granularity.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Days to render for a month grid, padded with nulls for the leading blanks. */
function monthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export function DateRangePicker({
  visible,
  initial,
  onCancel,
  onApply,
}: {
  visible: boolean;
  initial: DateRange;
  onCancel: () => void;
  onApply: (range: DateRange) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date(initial.start.getFullYear(), initial.start.getMonth(), 1));
  const [start, setStart] = useState<Date>(startOfDay(initial.start));
  const [end, setEnd] = useState<Date | null>(startOfDay(initial.end));

  const today = startOfDay(new Date());

  function pick(day: Date) {
    // First tap sets the start and clears the end; second tap closes the range.
    if (!end) {
      if (day < start) {
        setEnd(start);
        setStart(day);
      } else {
        setEnd(day);
      }
      return;
    }
    setStart(day);
    setEnd(null);
  }

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const canApply = !!end;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Select date range</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={s.rangeSummary}>
            <View style={s.rangeChip}>
              <Text style={s.rangeChipLabel}>From</Text>
              <Text style={s.rangeChipValue}>
                {start.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={Colors.textSecondary} />
            <View style={s.rangeChip}>
              <Text style={s.rangeChipLabel}>To</Text>
              <Text style={[s.rangeChipValue, !end && { color: Colors.textSecondary }]}>
                {end
                  ? end.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Tap a day'}
              </Text>
            </View>
          </View>

          <View style={s.monthNav}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={10} style={s.navBtn}>
              <Ionicons name="chevron-back" size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={s.monthLabel}>
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={10} style={s.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={s.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`${w}-${i}`} style={s.weekday}>{w}</Text>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 280 }}>
            <View style={s.grid}>
              {cells.map((day, i) => {
                if (!day) return <View key={`blank-${i}`} style={s.cell} />;
                const isFuture = day > today;
                const isStart = sameDay(day, start);
                const isEnd = !!end && sameDay(day, end);
                const inRange = !!end && day > start && day < end;
                return (
                  <TouchableOpacity
                    key={day.toISOString()}
                    style={[s.cell, inRange && s.cellInRange, (isStart || isEnd) && s.cellEdge]}
                    disabled={isFuture}
                    onPress={() => pick(day)}
                  >
                    <Text
                      style={[
                        s.cellText,
                        inRange && s.cellTextInRange,
                        (isStart || isEnd) && s.cellTextEdge,
                        isFuture && s.cellTextDisabled,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={s.actions}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onCancel}>
              <Text style={s.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, !canApply && { opacity: 0.4 }]}
              disabled={!canApply}
              onPress={() => end && onApply({ start, end })}
            >
              <Text style={s.btnPrimaryText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    paddingBottom: 28,
    gap: 12,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  rangeSummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rangeChip: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rangeChipLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: '700', textTransform: 'uppercase' },
  rangeChipValue: { fontSize: 14, color: Colors.text, fontWeight: '700' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  navBtn: { padding: 6 },
  monthLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    paddingVertical: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellInRange: { backgroundColor: Colors.primary + '1A' },
  cellEdge: { backgroundColor: Colors.primary, borderRadius: 999 },
  cellText: { fontSize: 14, color: Colors.text },
  cellTextInRange: { color: Colors.primaryDark, fontWeight: '600' },
  cellTextEdge: { color: '#FFFFFF', fontWeight: '800' },
  cellTextDisabled: { color: Colors.border },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 6 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: Colors.background },
  btnGhostText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 15 },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
