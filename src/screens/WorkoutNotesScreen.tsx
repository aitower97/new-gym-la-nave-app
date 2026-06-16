/**
 * WorkoutNotesScreen.tsx - Pantalla completa de notas de entrenamiento
 */

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Keyboard,
    KeyboardEvent,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    FadeIn,
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'WorkoutNotes'>;
};

interface Note {
    id: string;
    content: string;
    created_at: string;
}

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

function formatDateLabel(date: Date): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (formatDate(date) === formatDate(today)) return 'Hoy';
    if (formatDate(date) === formatDate(yesterday)) return 'Ayer';

    return date.toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long',
    });
}

function formatDateSub(date: Date): string {
    return date.toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
}

// ─── MODAL AÑADIR ────────────────────────────────────────────────────

function AddNoteModal({ visible, onClose, onSave }: {
    visible: boolean;
    onClose: () => void;
    onSave: (content: string) => void;
}) {
    const [text, setText] = useState('');
    const inputRef = useRef<TextInput>(null);
    const translateY = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            setText('');
            translateY.value = 0;
            setTimeout(() => inputRef.current?.focus(), 350);
        }
    }, [visible]);

    useEffect(() => {
        const show = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e: KeyboardEvent) => { translateY.value = withTiming(-e.endCoordinates.height, { duration: 250 }); }
        );
        const hide = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => { translateY.value = withTiming(0, { duration: 250 }); }
        );
        return () => { show.remove(); hide.remove(); };
    }, []);

    const close = () => { Keyboard.dismiss(); onClose(); };
    const save = () => {
        if (!text.trim()) return;
        Keyboard.dismiss();
        onSave(text.trim());
        setText('');
        onClose();
    };

    const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

    return (
        <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
                <Animated.View style={[sheetStyle, {
                    backgroundColor: '#0d1929',
                    borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
                    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                }]}>
                    <View style={{
                        width: 36, height: 4, borderRadius: 2,
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        alignSelf: 'center', marginBottom: 20,
                    }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Añadir nota</Text>
                        <TouchableOpacity onPress={close} style={{ padding: 8 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 20 }}>×</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        ref={inputRef}
                        value={text}
                        onChangeText={setText}
                        placeholder="Ej: Sentadilla 80kg × 5 · Press banca 60kg × 8"
                        placeholderTextColor="rgba(255,255,255,0.2)"
                        multiline
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            borderWidth: 1,
                            borderColor: text ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)',
                            borderRadius: 12, color: 'white', fontSize: 15,
                            padding: 14, height: 100, textAlignVertical: 'top', marginBottom: 16,
                        }}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                            onPress={close}
                            style={{
                                flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                                backgroundColor: 'rgba(255,255,255,0.06)',
                                borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                            }}
                        >
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: 14 }}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={save}
                            style={{
                                flex: 2,
                                backgroundColor: text.trim() ? '#2563EB' : 'rgba(37,99,235,0.25)',
                                borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                            }}
                        >
                            <Text style={{ color: text.trim() ? 'white' : 'rgba(255,255,255,0.3)', fontWeight: '700', fontSize: 14 }}>
                                Guardar
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

// ─── BOTÓN NAVEGACIÓN FECHA ───────────────────────────────────────────

function NavBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
    const sv = useSharedValue(1);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: sv.value }] }));
    return (
        <Animated.View style={style}>
            <TouchableOpacity
                onPress={disabled ? undefined : onPress}
                onPressIn={() => !disabled && (sv.value = withSpring(0.88, { damping: 14, stiffness: 300 }))}
                onPressOut={() => sv.value = withSpring(1, { damping: 12, stiffness: 200 })}
                style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                    backgroundColor: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.07)',
                    borderWidth: 1, borderColor: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.1)',
                }}
            >
                <Text style={{
                    color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
                    fontSize: 13, fontWeight: '600',
                }}>
                    {label}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────

export default function WorkoutNotesScreen({ navigation }: Props) {
    const insets = useSafeAreaInsets();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    const dateStr = formatDate(selectedDate);
    const isToday = dateStr === formatDate(new Date());

    useEffect(() => { loadNotes(); }, [dateStr]);

    async function loadNotes() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from('workout_notes')
                .select('id, content, created_at')
                .eq('user_id', user.id)
                .eq('date', dateStr)
                .order('created_at', { ascending: true });
            setNotes(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function saveNote(content: string) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data, error } = await supabase
                .from('workout_notes')
                .insert({ user_id: user.id, content, date: dateStr })
                .select().single();
            if (error) throw error;
            if (data) setNotes(prev => [...prev, data]);
        } catch (e) {
            Alert.alert('Error', 'No se pudo guardar la nota');
        }
    }

    async function deleteNote(id: string) {
        Alert.alert('Eliminar nota', '¿Seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar', style: 'destructive',
                onPress: async () => {
                    await supabase.from('workout_notes').delete().eq('id', id);
                    setNotes(prev => prev.filter(n => n.id !== id));
                },
            },
        ]);
    }

    const goTo = (days: number) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        if (formatDate(d) <= formatDate(new Date())) setSelectedDate(d);
    };

    return (
        <View style={{ flex: 1, backgroundColor: Colors.background }}>

            {/* Header */}
            <Animated.View
                entering={FadeInDown.duration(300).springify()}
                style={{
                    paddingTop: insets.top + scale(12),
                    paddingBottom: scale(16),
                    paddingHorizontal: scale(20),
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.06)',
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12), marginBottom: scale(16) }}>
                    <BackButton onPress={() => navigation.goBack()} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
                            Notas de entrenamiento
                        </Text>
                        <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                            {formatDateSub(selectedDate)}
                        </Text>
                    </View>

                    {/* Botón añadir */}
                    <TouchableOpacity
                        onPress={() => setModalVisible(true)}
                        style={{
                            width: 36, height: 36, borderRadius: 10,
                            backgroundColor: 'rgba(37,99,235,0.2)',
                            borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)',
                            alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <Text style={{ color: Colors.blue400, fontSize: 22, lineHeight: 24, fontWeight: '300' }}>+</Text>
                    </TouchableOpacity>
                </View>

                {/* Navegación de fecha */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <NavBtn label="← -7d" onPress={() => goTo(-7)} />
                        <NavBtn label="← Ayer" onPress={() => goTo(-1)} />
                    </View>

                    <View style={{
                        paddingHorizontal: 14, paddingVertical: 6,
                        backgroundColor: isToday ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                        borderRadius: 10, borderWidth: 1,
                        borderColor: isToday ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)',
                    }}>
                        <Text style={{
                            fontSize: 12, fontWeight: '700',
                            color: isToday ? '#A78BFA' : 'rgba(255,255,255,0.6)',
                            letterSpacing: 0.5,
                        }}>
                            {formatDateLabel(selectedDate).toUpperCase()}
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <NavBtn label="+1d →" onPress={() => goTo(1)} disabled={isToday} />
                        <NavBtn label="+7d →" onPress={() => goTo(7)} disabled={isToday} />
                    </View>
                </View>
            </Animated.View>

            {/* Contenido */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    padding: scale(20),
                    paddingBottom: insets.bottom + scale(32),
                    flexGrow: 1,
                }}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                        <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Cargando...</Text>
                    </View>
                ) : notes.length === 0 ? (
                    <Animated.View
                        entering={FadeIn.duration(400)}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}
                    >
                        <Text style={{ fontSize: 40, marginBottom: 16 }}>📝</Text>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 }}>
                            Sin notas {isToday ? 'hoy' : 'ese día'}
                        </Text>
                        <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 24 }}>
                            {isToday
                                ? 'Añade notas sobre pesos, series o sensaciones del entrenamiento'
                                : 'No hay notas registradas para este día'
                            }
                        </Text>
                        {isToday && (
                            <TouchableOpacity
                                onPress={() => setModalVisible(true)}
                                style={{
                                    backgroundColor: '#2563EB',
                                    paddingHorizontal: 24, paddingVertical: 12,
                                    borderRadius: 12,
                                }}
                            >
                                <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
                                    + Añadir primera nota
                                </Text>
                            </TouchableOpacity>
                        )}
                    </Animated.View>
                ) : (
                    <View style={{ gap: scale(10) }}>
                        {notes.map((note, index) => (
                            <Animated.View
                                key={note.id}
                                entering={FadeInDown.delay(index * 60).duration(300).springify()}
                                style={{
                                    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                                    backgroundColor: Colors.surface,
                                    borderRadius: 14, padding: 16,
                                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                                }}
                            >
                                <View style={{
                                    width: 28, height: 28, borderRadius: 8,
                                    backgroundColor: 'rgba(139,92,246,0.12)',
                                    alignItems: 'center', justifyContent: 'center',
                                    marginTop: 1,
                                }}>
                                    <Text style={{ fontSize: 13 }}>💪</Text>
                                </View>
                                <Text style={{
                                    flex: 1, fontSize: moderateScale(14),
                                    color: Colors.textPrimary, lineHeight: 22,
                                }}>
                                    {note.content}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => deleteNote(note.id)}
                                    style={{ padding: 4, opacity: 0.4 }}
                                >
                                    <Text style={{ color: Colors.danger, fontSize: 18 }}>×</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        ))}
                    </View>
                )}
            </ScrollView>

            <AddNoteModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                onSave={saveNote}
            />
        </View>
    );
}
