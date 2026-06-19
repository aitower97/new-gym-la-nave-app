/**
 * DaySelector.tsx - Selector horizontal de días con scroll
 * Migración 1:1 del diseño original de HomeScreen/ReservationScreen
 *
 * Uso:
 * <DaySelector
 *   ref={scrollRef}
 *   days={WEEK_DAYS}
 *   selectedDate={selectedDate}
 *   onSelect={(date, index) => ...}
 *   dayWidth={dayWidth}
 * />
 */

import { forwardRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

interface DaySelectorProps {
    days: Date[];
    selectedDate: Date;
    onSelect: (date: Date, index: number) => void;
    dayWidth: number;
}

export const DaySelector = forwardRef<ScrollView, DaySelectorProps>(
    ({ days, selectedDate, onSelect, dayWidth }, ref) => {
        return (
            <View style={{
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255,255,255,0.05)',
            }}>
                <ScrollView
                    ref={ref}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 4, paddingVertical: 8 }}
                >
                    {days.map((date, i) => {
                        const isSelected = date.toDateString() === selectedDate.toDateString();
                        const isToday = date.toDateString() === new Date().toDateString();

                        return (
                            <Pressable
                                key={i}
                                onPress={() => onSelect(date, i)}
                                style={{
                                    width: dayWidth - 4,
                                    paddingVertical: 12,
                                    borderRadius: 12,
                                    alignItems: 'center',
                                    backgroundColor: isSelected
                                        ? 'rgba(59,130,246,0.15)'
                                        : 'rgba(255,255,255,0.03)',
                                    borderWidth: isToday && !isSelected ? 2 : 1,
                                    borderColor: isSelected
                                        ? 'rgba(59,130,246,0.3)'
                                        : isToday
                                        ? '#F59E0B'
                                        : 'rgba(255,255,255,0.05)',
                                }}
                            >
                                <Text style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color: isSelected ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                    marginBottom: 4,
                                }}>
                                    {DAY_LETTERS[date.getDay()]}
                                </Text>
                                <Text style={{
                                    fontSize: 18,
                                    fontWeight: '800',
                                    color: isSelected ? '#3B82F6' : 'rgba(255,255,255,0.5)',
                                }}>
                                    {date.getDate()}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>
        );
    }
);

DaySelector.displayName = 'DaySelector';
