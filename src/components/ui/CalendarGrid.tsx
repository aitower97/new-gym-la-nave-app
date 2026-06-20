/**
 * CalendarGrid.tsx - Grid de calendario mensual
 *
 * FIX IMPORTANTE: Pressable con `style` como función (callback con {pressed})
 * rompe el layout flex en este proyecto (New Architecture + css-interop).
 * Por eso aquí el estado "pressed" se maneja con useState y el style
 * se pasa siempre como objeto plano, nunca como función.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../../theme';
import { DAY_NAMES } from '../../utils/adminClasses';

interface ClassInfo {
  id: string;
  class_time: string;
  max_spots: number;
  bookings?: Array<{ id: string }>;
}

interface CalendarGridProps {
  monthDays: (number | null)[];
  classesByDate: Record<string, ClassInfo[]>;
  currentYear: number;
  currentMonth: number;
  today: Date;
  selectedDate: string | null;
  selectionMode: boolean;
  selectWholeDays: boolean;
  selectedClasses: Set<string>;
  expandedDates: Set<string>;
  onDayPress: (dateStr: string) => void;
  onDaySelect: (dateStr: string) => void;
}

function chunkAndPad<T>(arr: (T | null)[], size: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    rows.push(arr.slice(i, i + size));
  }
  const last = rows[rows.length - 1];
  if (last && last.length < size) {
    while (last.length < size) last.push(null);
  }
  return rows;
}

// ─── CELDA INDIVIDUAL - componente propio para poder usar useState ───
function DayCell({
  day, dateStr, dayClasses, isToday, isSelected, isExpanded, selectionMode,
  selectWholeDays, hasSelectedClasses, allClassesSelected, onPress,
}: {
  day: number;
  dateStr: string;
  dayClasses: ClassInfo[];
  isToday: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  selectionMode: boolean;
  selectWholeDays: boolean;
  hasSelectedClasses: boolean;
  allClassesSelected: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const hasClasses = dayClasses.length > 0;
  const maxDots = 3;
  const visibleDots = dayClasses.slice(0, maxDots);
  const extraCount = dayClasses.length - maxDots;

  const bgColor = isExpanded
    ? 'rgba(59,130,246,0.2)'
    : hasSelectedClasses
    ? 'rgba(239,68,68,0.15)'
    : isSelected && !selectionMode
    ? 'rgba(59,130,246,0.25)'
    : isToday
    ? 'rgba(59,130,246,0.15)'
    : 'transparent';

  const borderColor = isExpanded || (isSelected && !selectionMode) || isToday
    ? Colors.blue500
    : hasSelectedClasses
    ? Colors.danger
    : 'rgba(255,255,255,0.05)';

  const textColor = isExpanded || (isSelected && !selectionMode) || isToday
    ? Colors.blue500
    : hasSelectedClasses
    ? Colors.danger
    : 'rgba(255,255,255,0.8)';

  // style SIEMPRE como objeto plano, nunca como función
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        flex: 1,
        aspectRatio: 0.85,
        paddingTop: 6,
        paddingHorizontal: 2,
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        backgroundColor: bgColor,
        borderWidth: 1,
        borderColor,
        borderRadius: 8,
        opacity: pressed ? 0.7 : 1,
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: textColor }}>
        {day}
      </Text>

      {selectionMode && hasClasses && selectWholeDays && (
        <View style={{
          width: 16, height: 16, borderRadius: 8,
          borderWidth: 2, marginTop: 4,
          borderColor: allClassesSelected ? Colors.danger : 'rgba(255,255,255,0.3)',
          backgroundColor: allClassesSelected ? Colors.danger : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {allClassesSelected && (
            <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>✓</Text>
          )}
        </View>
      )}

      {selectionMode && hasClasses && !selectWholeDays && (
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 10, color: Colors.blue500, fontWeight: '700' }}>
            {isExpanded ? '▼' : '▶'}
          </Text>
        </View>
      )}

      {hasClasses && !selectionMode && (
        <View style={{
          flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
          justifyContent: 'center', marginTop: 5, width: '100%', maxWidth: '100%',
        }}>
          {visibleDots.map((cls) => {
            const booked = cls.bookings?.length || 0;
            const pct = (booked / cls.max_spots) * 100;
            const dotColor = pct >= 100 ? Colors.danger : pct >= 80 ? Colors.warning : Colors.success;
            return (
              <View
                key={cls.id}
                style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dotColor, marginHorizontal: 1.5 }}
              />
            );
          })}
          {extraCount > 0 && (
            <Text numberOfLines={1} style={{ fontSize: 8, color: Colors.textMuted, fontWeight: '700', marginLeft: 2 }}>
              +{extraCount}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ─── GRID PRINCIPAL ────────────────────────────────────────────────
export function CalendarGrid({
  monthDays, classesByDate, currentYear, currentMonth, today,
  selectedDate, selectionMode, selectWholeDays,
  selectedClasses, expandedDates, onDayPress, onDaySelect,
}: CalendarGridProps) {
  const rows = chunkAndPad(monthDays, 7);

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(180).springify()}>
      <View style={{ flexDirection: 'row' }}>
        {DAY_NAMES.map((day) => (
          <View key={day} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted }}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      {rows.map((row, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={{
            flexDirection: 'row',
            borderBottomWidth: rowIndex < rows.length - 1 ? 1 : 0,
            borderBottomColor: 'rgba(255,255,255,0.03)',
          }}
        >
          {row.map((day, colIndex) => {
            const globalIndex = rowIndex * 7 + colIndex;

            if (day === null) {
              return <View key={`empty-${globalIndex}`} style={{ flex: 1, aspectRatio: 0.85 }} />;
            }

            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayClasses = classesByDate[dateStr] || [];
            const hasClasses = dayClasses.length > 0;

            const isToday =
              day === today.getDate() &&
              currentMonth === today.getMonth() &&
              currentYear === today.getFullYear();

            const isSelected = selectedDate === dateStr;
            const isExpanded = expandedDates.has(dateStr);
            const hasSelectedClasses = selectionMode && dayClasses.some(cls => selectedClasses.has(cls.id));
            const allClassesSelected = selectionMode && dayClasses.length > 0 && dayClasses.every(cls => selectedClasses.has(cls.id));

            return (
              <DayCell
                key={day}
                day={day}
                dateStr={dateStr}
                dayClasses={dayClasses}
                isToday={isToday}
                isSelected={isSelected}
                isExpanded={isExpanded}
                selectionMode={selectionMode}
                selectWholeDays={selectWholeDays}
                hasSelectedClasses={hasSelectedClasses}
                allClassesSelected={allClassesSelected}
                onPress={() => {
                  if (selectionMode && hasClasses) onDayPress(dateStr);
                  else if (!selectionMode) onDaySelect(dateStr);
                }}
              />
            );
          })}
        </View>
      ))}
    </Animated.View>
  );
}
