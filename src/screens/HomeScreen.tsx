import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { generateWeekDays, getClassesForDate } from '../data/mockClasses';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
  route: RouteProp<RootStackParamList, 'Home'>;
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const TYPE_CONFIG = {
  'CROSS TRAINING': { accent: '#3B82F6', icon: '⚡' },
  'POWERLIFTING': { accent: '#F59E0B', icon: '🏋️' },
  'HALTEROFILIA': { accent: '#EF4444', icon: '🔴' },
  'OPEN BOX': { accent: '#10B981', icon: '🟢' },
};

function getOccupancyColor(booked: number, capacity: number): string {
  const ratio = booked / capacity;
  if (ratio >= 1) return '#EF4444';
  if (ratio >= 0.7) return '#F59E0B';
  return '#10B981';
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function HomeScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [myBookings, setMyBookings] = useState<Set<string>>(new Set());
  
  const weekDays = generateWeekDays().slice(0, 7);
  const classes = getClassesForDate(selectedDate);

  const handleBook = (classId: string, className: string) => {
    if (myBookings.has(classId)) {
      Alert.alert(
        'Cancelar reserva',
        `¿Cancelar ${className}?`,
        [
          { text: 'No', style: 'cancel' },
          { 
            text: 'Sí', 
            onPress: () => {
              const newBookings = new Set(myBookings);
              newBookings.delete(classId);
              setMyBookings(newBookings);
              Alert.alert('Reserva cancelada');
            }
          },
        ]
      );
    } else {
      // Verificar si ya tiene reserva ese día
      const hasBookingToday = Array.from(myBookings).some(id => {
        const cls = classes.find(c => c.id === id);
        return cls !== undefined;
      });

      if (hasBookingToday) {
        Alert.alert('Ya tienes reserva', 'Solo puedes reservar 1 clase por día');
        return;
      }

      const newBookings = new Set(myBookings);
      newBookings.add(classId);
      setMyBookings(newBookings);
      Alert.alert('¡Reservado! 💪', className);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {getGreeting()}, {name || email.split('@')[0]}
          </Text>
          <Text style={styles.gymName}>La Nave Strength</Text>
        </View>
        
        <Pressable 
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('Welcome')}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      {/* Day selector */}
      <View style={styles.daysRow}>
        {weekDays.map((date, i) => {
          const isSelected = date.toDateString() === selectedDate.toDateString();
          const letter = DAY_LETTERS[date.getDay()];
          const num = date.getDate();
          
          return (
            <Pressable
              key={i}
              style={[styles.dayBtn, isSelected && styles.dayBtnActive]}
              onPress={() => {
                setSelectedDate(date);
                setExpandedId(null);
              }}
            >
              <Text style={[styles.dayLetter, isSelected && styles.dayLetterActive]}>
                {letter}
              </Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>
                {num}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Day context */}
      <View style={styles.contextBar}>
        <Text style={styles.contextDate}>
          {DAY_NAMES[selectedDate.getDay()]} {selectedDate.getDate()} · Marzo
        </Text>
        <Text style={styles.contextCount}>
          {classes.length} {classes.length === 1 ? 'clase' : 'clases'}
        </Text>
      </View>

      {/* Timeline */}
      <ScrollView 
        style={styles.timeline}
        showsVerticalScrollIndicator={false}
      >
        {classes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏖</Text>
            <Text style={styles.emptyTitle}>Día de descanso</Text>
            <Text style={styles.emptyText}>No hay clases programadas</Text>
          </View>
        ) : (
          classes.map((classItem, index) => {
            const isExpanded = expandedId === classItem.id;
            const isBooked = myBookings.has(classItem.id);
            const isFull = classItem.status === 'full';
            const isFinished = classItem.status === 'finished';
            const config = TYPE_CONFIG[classItem.name as keyof typeof TYPE_CONFIG] || TYPE_CONFIG['CROSS TRAINING'];
            const occColor = getOccupancyColor(classItem.bookedUsers.length, classItem.maxSpots);
            const free = classItem.maxSpots - classItem.bookedUsers.length;

            return (
              <View key={classItem.id} style={styles.timelineRow}>
                {/* Timeline column */}
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{classItem.time}</Text>
                  {index < classes.length - 1 && (
                    <View style={styles.timeLine} />
                  )}
                </View>

                {/* Card */}
                <Pressable
                  style={[
                    styles.classCard,
                    isExpanded && styles.classCardExpanded,
                    { borderLeftColor: config.accent },
                  ]}
                  onPress={() => setExpandedId(isExpanded ? null : classItem.id)}
                >
                  {/* Top row */}
                  <View style={styles.cardTop}>
                    <View style={styles.cardLeft}>
                      <View style={styles.cardTitle}>
                        <Text style={styles.cardIcon}>{config.icon}</Text>
                        <Text style={styles.cardName}>{classItem.name}</Text>
                      </View>
                      
                      {/* Avatar stack */}
                      <View style={styles.avatarStack}>
                        {classItem.bookedUsers.slice(0, 5).map((user, i) => (
                          <Image
                            key={user.id}
                            source={{ uri: user.avatar }}
                            style={[styles.avatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 5 - i }]}
                          />
                        ))}
                        {classItem.bookedUsers.length > 5 && (
                          <Text style={styles.avatarExtra}>
                            +{classItem.bookedUsers.length - 5}
                          </Text>
                        )}
                        
                        <View style={styles.statusDot}>
                          <View style={[styles.dot, { backgroundColor: occColor }]} />
                          <Text style={styles.statusText}>
                            {isFull ? 'Completa' : `${free} ${free === 1 ? 'plaza' : 'plazas'}`}
                          </Text>
                        </View>
                      </View>

                      {/* Occupancy bar */}
                      <View style={styles.occBar}>
                        <View 
                          style={[
                            styles.occFill, 
                            { 
                              width: `${(classItem.bookedUsers.length / classItem.maxSpots) * 100}%`,
                              backgroundColor: occColor 
                            }
                          ]} 
                        />
                      </View>
                    </View>

                    {/* Right button */}
                    <Pressable 
                      style={styles.cardButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        setExpandedId(isExpanded ? null : classItem.id);
                      }}
                    >
                      <Text style={styles.cardButtonIcon}>
                        {isExpanded ? '−' : '+'}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Expanded content */}
                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      <View style={styles.stats}>
                        <View style={styles.statItem}>
                          <Text style={styles.statLabel}>Capacidad</Text>
                          <Text style={styles.statValue}>{classItem.maxSpots}</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={styles.statLabel}>Ocupación</Text>
                          <Text style={styles.statValue}>
                            {Math.round((classItem.bookedUsers.length / classItem.maxSpots) * 100)}%
                          </Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={styles.statLabel}>Plazas libres</Text>
                          <Text style={styles.statValue}>{free}</Text>
                        </View>
                      </View>

                      {!isFinished && (
                        <Pressable 
                          style={[
                            styles.bookButton,
                            isBooked && styles.bookButtonBooked,
                            isFull && !isBooked && styles.bookButtonFull,
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleBook(classItem.id, classItem.name);
                          }}
                          disabled={isFull && !isBooked}
                        >
                          <Text style={styles.bookButtonText}>
                            {isBooked ? 'Cancelar reserva' : isFull ? 'Clase completa' : 'Reservar plaza'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    marginBottom: 4,
  },
  gymName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 20,
    marginTop: 24,
    justifyContent: 'space-between',
  },
  dayBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  dayBtnActive: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderColor: 'rgba(59,130,246,0.3)',
  },
  dayLetter: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dayLetterActive: {
    color: 'rgba(255,255,255,0.6)',
  },
  dayNum: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
  },
  dayNumActive: {
    color: '#3B82F6',
  },
  contextBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  contextDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  contextCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
    fontFamily: 'monospace',
  },
  timeline: {
    flex: 1,
    paddingTop: 20,
    paddingLeft: 8,
    paddingRight: 20,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 10,
  },
  timeColumn: {
    width: 52,
    flexShrink: 0,
    alignItems: 'center',
    paddingTop: 2,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: -0.3,
    fontFamily: 'monospace',
  },
  timeLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 8,
    borderRadius: 1,
  },
  classCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 3,
  },
  classCardExpanded: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: {
    fontSize: 14,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 12,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#0f1623',
  },
  avatarExtra: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  statusDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  occBar: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 10,
    overflow: 'hidden',
  },
  occFill: {
    height: '100%',
    borderRadius: 2,
  },
  cardButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButtonIcon: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
  },
  bookButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  bookButtonBooked: {
    backgroundColor: '#EF4444',
  },
  bookButtonFull: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.2)',
  },
  emptyText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
    marginTop: 4,
  },
});