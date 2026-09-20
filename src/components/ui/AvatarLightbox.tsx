/**
 * AvatarLightbox.tsx - Visor a pantalla completa de una foto de perfil
 *
 * Uso:
 * <AvatarLightbox uri={url} name="Ana" visible={open} onClose={() => setOpen(false)} />
 *
 * Se monta solo mientras está abierto: quien lo use debe renderizarlo de forma
 * condicional o pasarle `visible`. Así una lista con veinte avatares no arrastra
 * veinte modales en el árbol.
 */

import { Dimensions, Image, Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

interface AvatarLightboxProps {
    uri: string | null;
    visible: boolean;
    onClose: () => void;
    /** Se muestra bajo la foto si viene. */
    name?: string | null;
}

export function AvatarLightbox({ uri, visible, onClose, name }: AvatarLightboxProps) {
    if (!uri) return null;

    // El lado menor de la pantalla, para que una foto vertical tampoco se salga.
    const { width, height } = Dimensions.get('window');
    const lado = Math.min(width * 0.86, height * 0.6);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            // Botón atrás de Android: sin esto el modal se queda abierto.
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
                {/* Toda la superficie cierra: es lo que espera cualquiera en un visor de fotos. */}
                <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar la foto"
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(5,10,18,0.94)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                    }}
                >
                    <Animated.View entering={ZoomIn.duration(200).springify()} style={{ alignItems: 'center' }}>
                        <Image
                            source={{ uri }}
                            // `contain` y no `cover`: aquí la foto se mira, no se
                            // recorta como en el avatar circular.
                            resizeMode="contain"
                            style={{
                                width: lado,
                                height: lado,
                                borderRadius: 20,
                                backgroundColor: '#0f1623',
                            }}
                        />
                        {!!name && (
                            <Text
                                numberOfLines={1}
                                style={{
                                    marginTop: 18,
                                    fontSize: 16,
                                    fontWeight: '600',
                                    color: 'rgba(255,255,255,0.92)',
                                    letterSpacing: 0.3,
                                    maxWidth: lado,
                                }}
                            >
                                {name}
                            </Text>
                        )}
                        <Text style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                            Toca para cerrar
                        </Text>
                    </Animated.View>
                </Pressable>
            </Animated.View>
        </Modal>
    );
}
