import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BarbellIcon, ChevronRightIcon, TrashIcon, XIcon } from '../Icons';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { ExerciseProgress } from '../../utils/workoutProgress';

// Mini gráfico de barras con las últimas sesiones. La última barra resalta.
function Sparkline({ series, accent }: { series: number[]; accent: string }) {
  const data = series.slice(-14);
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const H = scale(32);
  const base = scale(5);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(2), height: H }}>
      {data.map((v, i) => {
        const norm = (v - min) / range;
        const isLast = i === data.length - 1;
        const isPeak = v === max;
        return (
          <View
            key={i}
            style={{
              width: scale(4),
              height: base + norm * (H - base),
              borderRadius: scale(2),
              backgroundColor: isLast ? accent : isPeak ? accent + 'AA' : accent + '44',
            }}
          />
        );
      })}
    </View>
  );
}

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
  session_date?: string | null;
  description: string | null;
  user_id?: string | null;
  target_sets?: number | null;
  target_reps?: number | null;
  target_rpe?: number | null;
}

interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
  dayOfWeek: number;
  weight: string;
  sets: string;
  reps: string;
  rpe: string;
  notes: string;
  onWeightChange: (value: string) => void;
  onSetsChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onRpeChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onViewProgress?: () => void;
  isCustom?: boolean;
  onDelete?: () => void;
  /** 'exercise' = borra la plantilla (afecta a todos); 'log' = borra solo tu registro. */
  deleteKind?: 'exercise' | 'log';
  isOrphanLog?: boolean;
  progress?: ExerciseProgress;
  /**
   * Hay un registro guardado para este ejercicio hoy. Viene del padre
   * (basado en si existe un workout_log) en vez de inferirse solo del campo
   * de peso, porque un ejercicio sin peso (dominadas, carrera...) puede
   * estar registrado con solo series/reps.
   */
  registered?: boolean;
}

export function ExerciseCard({
  exercise,
  index,
  dayOfWeek,
  weight,
  sets,
  reps,
  rpe,
  notes,
  onWeightChange,
  onSetsChange,
  onRepsChange,
  onRpeChange,
  onNotesChange,
  onViewProgress,
  isCustom,
  onDelete,
  deleteKind = 'exercise',
  isOrphanLog,
  progress,
  registered,
}: ExerciseCardProps) {
  const accent = DAY_ACCENTS[dayOfWeek] || DAY_ACCENTS[0];
  // `||`, no `??`: el guardado en BD (registered) y el texto tecleado en
  // vivo (antes de pulsar Guardar) deben poder encender el estado los dos.
  const hasValue = !!registered || (!!weight && parseFloat(weight) > 0);

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
        colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.03)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: Radius.lg,
          padding: scale(16),
          borderWidth: 1,
          borderLeftWidth: 3,
          borderLeftColor: accent,
          borderColor: hasValue ? 'rgba(16,185,129,0.3)' : accent + '40',
        }}
      >
        {/* Header: badges */}
        {(isCustom || hasValue || onDelete) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scale(8), marginBottom: scale(8) }}>
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
          {isOrphanLog && (
            <View style={{
              paddingHorizontal: scale(8), paddingVertical: scale(3),
              borderRadius: Radius.sm,
              backgroundColor: 'rgba(245,158,11,0.15)',
            }}>
              <Text style={{
                fontSize: moderateScale(10), fontWeight: '700',
                color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                Fuera de la sesión
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
          {onDelete && deleteKind === 'log' && (
            <Pressable
              onPress={onDelete}
              hitSlop={scale(6)}
              style={{
                marginLeft: 'auto',
                flexDirection: 'row', alignItems: 'center', gap: scale(4),
                paddingHorizontal: scale(8), height: scale(28),
                borderRadius: scale(14),
                backgroundColor: 'rgba(245,158,11,0.12)',
                borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
              }}
            >
              <TrashIcon size={scale(12)} color="#F59E0B" strokeWidth={2.5} />
              <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: '#F59E0B' }}>
                Registro
              </Text>
            </Pressable>
          )}
          {onDelete && deleteKind === 'exercise' && (
            <Pressable
              onPress={onDelete}
              hitSlop={scale(6)}
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
        )}

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
            marginBottom: scale(8), marginLeft: scale(26),
          }}>
            {exercise.description}
          </Text>
        )}

        {(exercise.target_sets || exercise.target_reps || exercise.target_rpe) && (
          <View style={{
            flexDirection: 'row', flexWrap: 'wrap', gap: scale(8),
            marginLeft: scale(26), marginBottom: scale(12),
          }}>
            {!!exercise.target_sets && (
              <View style={{ paddingHorizontal: scale(9), paddingVertical: scale(4), borderRadius: Radius.sm, backgroundColor: accent + '15' }}>
                <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: accent }}>
                  {exercise.target_sets} series
                </Text>
              </View>
            )}
            {!!exercise.target_reps && (
              <View style={{ paddingHorizontal: scale(9), paddingVertical: scale(4), borderRadius: Radius.sm, backgroundColor: accent + '15' }}>
                <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: accent }}>
                  {exercise.target_reps} reps
                </Text>
              </View>
            )}
            {!!exercise.target_rpe && (
              <View style={{ paddingHorizontal: scale(9), paddingVertical: scale(4), borderRadius: Radius.sm, backgroundColor: accent + '15' }}>
                <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: accent }}>
                  RPE objetivo {exercise.target_rpe}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Panel de progreso: PR, última, tendencia */}
        {progress && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            gap: scale(10),
            marginLeft: scale(26), marginBottom: scale(12),
            paddingVertical: scale(9), paddingHorizontal: scale(11),
            borderRadius: Radius.md,
            backgroundColor: 'rgba(255,255,255,0.035)',
            borderWidth: 1, borderColor: Colors.cardBorder,
          }}>
            <View style={{ gap: scale(3) }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: scale(5) }}>
                <Text style={{ fontSize: moderateScale(9), fontWeight: '800', color: '#F5B301', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  PR
                </Text>
                <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary }}>
                  {progress.pr.toFixed(1)}
                  <Text style={{ fontSize: moderateScale(10), fontWeight: '600', color: Colors.textMuted }}> kg</Text>
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                {progress.count > 1 ? (
                  <>
                    <Text style={{ fontSize: moderateScale(11), color: Colors.textSecondary }}>
                      Última {progress.last.toFixed(1)} kg
                    </Text>
                    {progress.delta !== null && progress.delta !== 0 && (
                      <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: progress.delta > 0 ? '#10B981' : '#EF4444' }}>
                        {progress.delta > 0 ? '▲' : '▼'} {Math.abs(progress.delta).toFixed(1)}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }}>
                    Primer registro
                  </Text>
                )}
              </View>
            </View>
            <Sparkline series={progress.series} accent={accent} />
          </View>
        )}

        {/* Inputs row: Weight, Sets, Reps, RPE */}
        <View style={{ flexDirection: 'row', gap: scale(8), marginBottom: scale(12) }}>
          <View style={{ flex: 1.3 }}>
            <Text numberOfLines={1} style={{
              fontSize: moderateScale(11), fontWeight: '600',
              color: Colors.textSecondary, marginBottom: scale(4),
            }}>
              Peso (opcional)
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
                paddingHorizontal: scale(10),
                height: scale(44),
                fontSize: scale(15),
                fontWeight: '700',
                color: Colors.textPrimary,
                textAlign: 'center',
              }}
            />
          </View>
          <View style={{ width: scale(52) }}>
            <Text style={{
              fontSize: moderateScale(11), fontWeight: '600',
              color: Colors.textSecondary, marginBottom: scale(4),
            }}>
              Series
            </Text>
            <TextInput
              value={sets}
              onChangeText={onSetsChange}
              placeholder="1"
              placeholderTextColor={Colors.placeholder}
              keyboardType="number-pad"
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.sm,
                paddingHorizontal: scale(6),
                height: scale(44),
                fontSize: scale(15),
                fontWeight: '700',
                color: Colors.textPrimary,
                textAlign: 'center',
              }}
            />
          </View>
          <View style={{ width: scale(52) }}>
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
                paddingHorizontal: scale(6),
                height: scale(44),
                fontSize: scale(15),
                fontWeight: '700',
                color: Colors.textPrimary,
                textAlign: 'center',
              }}
            />
          </View>
          <View style={{ width: scale(52) }}>
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
                paddingHorizontal: scale(6),
                height: scale(44),
                fontSize: scale(15),
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
