import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BarbellIcon, ChevronRightIcon, XIcon } from '../Icons';
import { Colors, Radius, moderateScale, scale } from '../../theme';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const DAY_ACCENTS: Record<number, string> = {
  0: '#6B7280',
  1: '#3B82F6',
  2: '#F59E0B',
  3: '#10B981',
  4: '#EF4444',
  5: '#A78BFA',
  6: '#EC4899',
};

const RPE_COLORS: Record<number, string> = {
  1: '#10B981', 2: '#10B981', 3: '#34D399',
  4: '#FBBF24', 5: '#F59E0B', 6: '#F97316',
  7: '#EF4444', 8: '#DC2626', 9: '#B91C1C', 10: '#991B1B',
};

interface Exercise {
  id: string;
  name: string;
  day_of_week: number;
  description: string | null;
  user_id?: string | null;
}

interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
  dayOfWeek: number;
  weight: string;
  reps: string;
  rpe: string;
  notes: string;
  onWeightChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onRpeChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onViewProgress?: () => void;
  isCustom?: boolean;
  onDelete?: () => void;
}

export function ExerciseCard({
  exercise,
  index,
  dayOfWeek,
  weight,
  reps,
  rpe,
  notes,
  onWeightChange,
  onRepsChange,
  onRpeChange,
  onNotesChange,
  onViewProgress,
  isCustom,
  onDelete,
}: ExerciseCardProps) {
  const isTodayExercise = exercise.day_of_week === dayOfWeek;
  const accent = DAY_ACCENTS[exercise.day_of_week] || DAY_ACCENTS[0];
  const hasValue = !!weight && parseFloat(weight) > 0;

  const rpeNum = parseInt(rpe) || 0;
  const rpeColor = RPE_COLORS[rpeNum] || Colors.textMuted;

  const progressScale = useSharedValue(1);
  const progressShadow = useSharedValue(0);

  const progressAnim = useAnimatedStyle(() => ({
    transform: [{ scale: progressScale.value }],
    shadowOpacity: progressShadow.value,
  }));

  const handleProgressPressIn = () => {
    progressScale.value = withSpring(0.96, { damping: 14, stiffness: 300 });
    progressShadow.value = withTiming(0.3, { duration: 120 });
  };

  const handleProgressPressOut = () => {
    progressScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    progressShadow.value = withTiming(0, { duration: 280 });
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(100 + index * 80).springify()}
      style={{ marginBottom: scale(12) }}
    >
      <LinearGradient
        colors={
          isTodayExercise
            ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.03)']
            : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: Radius.lg,
          padding: scale(16),
          borderWidth: 1,
          borderLeftWidth: 3,
          borderLeftColor: accent,
          borderColor: hasValue
            ? 'rgba(16,185,129,0.3)'
            : isTodayExercise
              ? accent + '40'
              : Colors.cardBorder,
        }}
      >
        {/* Header: badges */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(8) }}>
          <View style={{
            paddingHorizontal: scale(8), paddingVertical: scale(3),
            borderRadius: Radius.sm,
            backgroundColor: isTodayExercise ? accent + '25' : 'rgba(100,100,120,0.1)',
          }}>
            <Text style={{
              fontSize: moderateScale(10), fontWeight: '700',
              color: isTodayExercise ? accent : Colors.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {DAY_NAMES[exercise.day_of_week]}
            </Text>
          </View>
          {isTodayExercise && (
            <View style={{
              paddingHorizontal: scale(8), paddingVertical: scale(3),
              borderRadius: Radius.sm,
              backgroundColor: 'rgba(16,185,129,0.15)',
            }}>
              <Text style={{
                fontSize: moderateScale(10), fontWeight: '700',
                color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                Hoy
              </Text>
            </View>
          )}
          {isCustom && (
            <View style={{
              paddingHorizontal: scale(8), paddingVertical: scale(3),
              borderRadius: Radius.sm,
              backgroundColor: 'rgba(167,139,250,0.15)',
            }}>
              <Text style={{
                fontSize: moderateScale(10), fontWeight: '700',
                color: '#A78BFA', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                Personalizado
              </Text>
            </View>
          )}
          {hasValue && (
            <View style={{
              paddingHorizontal: scale(8), paddingVertical: scale(3),
              borderRadius: Radius.sm,
              backgroundColor: 'rgba(16,185,129,0.15)',
            }}>
              <Text style={{
                fontSize: moderateScale(10), fontWeight: '700',
                color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                Registrado
              </Text>
            </View>
          )}
          {isCustom && onDelete && (
            <Pressable
              onPress={onDelete}
              style={{
                marginLeft: 'auto',
                width: scale(28), height: scale(28),
                borderRadius: scale(14),
                backgroundColor: 'rgba(239,68,68,0.15)',
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <XIcon size={scale(12)} color="#EF4444" strokeWidth={2.5} />
            </Pressable>
          )}
        </View>

        {/* Exercise name with icon */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(4) }}>
          <BarbellIcon size={scale(18)} color={accent} />
          <Text style={{
            fontSize: moderateScale(18), fontWeight: '800',
            color: accent, flex: 1,
          }}>
            {exercise.name}
          </Text>
        </View>

        {exercise.description && (
          <Text style={{
            fontSize: moderateScale(12), color: Colors.textSecondary,
            marginBottom: scale(12), marginLeft: scale(26),
          }}>
            {exercise.description}
          </Text>
        )}

        {/* Inputs row: Weight, Reps, RPE */}
        <View style={{ flexDirection: 'row', gap: scale(10), marginBottom: scale(12) }}>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontSize: moderateScale(11), fontWeight: '600',
              color: Colors.textSecondary, marginBottom: scale(4),
            }}>
              Peso (kg)
            </Text>
            <TextInput
              value={weight}
              onChangeText={onWeightChange}
              placeholder="0.0"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.sm,
                paddingHorizontal: scale(12),
                height: scale(44),
                fontSize: scale(16),
                fontWeight: '700',
                color: Colors.textPrimary,
                textAlign: 'center',
              }}
            />
          </View>
          <View style={{ width: scale(65) }}>
            <Text style={{
              fontSize: moderateScale(11), fontWeight: '600',
              color: Colors.textSecondary, marginBottom: scale(4),
            }}>
              Reps
            </Text>
            <TextInput
              value={reps}
              onChangeText={onRepsChange}
              placeholder="1"
              placeholderTextColor={Colors.placeholder}
              keyboardType="number-pad"
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.sm,
                paddingHorizontal: scale(8),
                height: scale(44),
                fontSize: scale(16),
                fontWeight: '700',
                color: Colors.textPrimary,
                textAlign: 'center',
              }}
            />
          </View>
          <View style={{ width: scale(65) }}>
            <Text style={{
              fontSize: moderateScale(11), fontWeight: '600',
              color: rpeNum > 0 ? rpeColor : Colors.textSecondary, marginBottom: scale(4),
            }}>
              RPE
            </Text>
            <TextInput
              value={rpe}
              onChangeText={(v) => {
                const num = parseInt(v);
                if (v === '' || (num >= 1 && num <= 10)) onRpeChange(v);
              }}
              placeholder="1-10"
              placeholderTextColor={Colors.placeholder}
              keyboardType="number-pad"
              maxLength={2}
              style={{
                backgroundColor: rpeNum > 0 ? rpeColor + '15' : Colors.inputBg,
                borderWidth: 1,
                borderColor: rpeNum > 0 ? rpeColor + '40' : Colors.inputBorder,
                borderRadius: Radius.sm,
                paddingHorizontal: scale(8),
                height: scale(44),
                fontSize: scale(16),
                fontWeight: '700',
                color: rpeNum > 0 ? rpeColor : Colors.textPrimary,
                textAlign: 'center',
              }}
            />
          </View>
        </View>

        {/* Notes input */}
        <TextInput
          value={notes}
          onChangeText={onNotesChange}
          placeholder="Notas (opcional)"
          placeholderTextColor={Colors.placeholder}
          style={{
            backgroundColor: Colors.inputBg,
            borderWidth: 1, borderColor: Colors.inputBorder,
            borderRadius: Radius.sm,
            paddingHorizontal: scale(12),
            height: scale(40),
            fontSize: scale(13),
            color: Colors.textPrimary,
          }}
        />

        {/* View progress button */}
        {onViewProgress && (
          <Animated.View style={[progressAnim, {
            marginTop: scale(12),
            borderRadius: Radius.sm,
            shadowColor: accent,
            shadowOffset: { width: 0, height: 2 },
            shadowRadius: 8,
          }]}>
            <Pressable
              onPress={onViewProgress}
              onPressIn={handleProgressPressIn}
              onPressOut={handleProgressPressOut}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: scale(10),
                paddingHorizontal: scale(16),
                borderRadius: Radius.sm,
                backgroundColor: accent + '15',
                borderWidth: 1,
                borderColor: accent + '30',
                gap: scale(6),
              }}
            >
              <Text style={{
                fontSize: moderateScale(13), fontWeight: '700',
                color: accent,
              }}>
                Ver progreso
              </Text>
              <ChevronRightIcon size={scale(14)} color={accent} strokeWidth={2.5} />
            </Pressable>
          </Animated.View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}
