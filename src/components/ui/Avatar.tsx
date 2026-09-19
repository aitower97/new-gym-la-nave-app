/**
 * Avatar.tsx - Avatar de usuario con entrada animada
 *
 * Uso:
 * <Avatar uri={user.avatar} size={28} index={0} />
 * <Avatar uri={user.avatar} size={28} name={user.name} />   ← ampliable al tocar
 * <Avatar uri={user.avatar} size={28} zoomable={false} />
 */

import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { AvatarLightbox } from './AvatarLightbox';

const NAVE_PATH = "M494.411835,379.396088 C498.245880,374.650574 501.846252,370.174988 505.863617,365.180969 C511.306396,371.815338 516.358826,377.893463 521.325195,384.041046 C546.672546,415.417389 571.994141,446.814392 597.331604,478.198700 C615.148315,500.267395 633.000427,522.307556 650.741272,544.437073 C651.883911,545.862366 652.812134,547.944458 652.818237,549.724487 C652.933289,583.557068 652.895752,617.390137 652.874207,651.223145 C652.873901,651.655457 652.669312,652.087585 652.315979,653.486023 C646.567871,646.244568 641.252686,639.593445 635.988281,632.902405 C631.571045,627.288330 627.445679,621.424072 622.750549,616.055908 C619.375427,612.196838 617.686707,608.279602 617.909241,603.037048 C618.297668,593.887024 618.222595,584.700317 617.863098,575.547729 C617.774658,573.295593 616.393127,570.436768 614.656494,569.024597 C608.272583,563.833557 601.489319,559.133606 593.911255,553.552856 C593.911255,572.471069 593.911255,590.295959 593.911255,609.254944 C590.194824,606.935913 587.405273,605.275574 584.697144,603.491638 C572.621460,595.536743 560.508362,587.635437 548.571838,579.476074 C546.720825,578.210754 544.956665,575.890015 544.438232,573.746399 C539.058228,551.499268 534.043762,529.164124 528.726807,506.901367 C522.019165,478.815460 515.131958,450.772339 508.291473,422.718292 C507.893341,421.085541 507.219910,419.519928 506.674622,417.923065 C506.218018,417.909668 505.761414,417.896301 505.304810,417.882904 C504.699005,419.429199 503.897400,420.928772 503.515839,422.528503 C491.464996,473.052979 479.469910,523.590698 467.371582,574.103760 C466.980255,575.737671 465.953156,577.668152 464.620026,578.558838 C449.705536,588.523560 434.673553,598.312500 419.660919,608.130005 C419.423065,608.285583 419.030304,608.204407 418.126099,608.287048 C418.126099,590.390259 418.126099,572.543762 418.126099,553.427917 C409.867767,559.472595 402.500214,564.687683 395.401001,570.245605 C394.286591,571.118103 394.012604,573.541565 393.992279,575.255493 C393.871796,585.420593 394.027283,595.589294 393.872803,605.753418 C393.841827,607.790039 393.429352,610.240906 392.248901,611.774109 C381.815369,625.325500 371.170868,638.714539 360.573456,652.139465 C360.309143,652.474243 359.869598,652.670654 358.943634,653.345947 C358.943634,649.714050 358.943481,646.611450 358.943665,643.508789 C358.945465,612.842285 358.876465,582.175415 359.072906,551.510132 C359.090118,548.827515 360.216553,545.648132 361.894958,543.555237 C390.038086,508.461029 418.351654,473.503571 446.626373,438.514923 C462.477905,418.899353 478.327606,399.282349 494.411835,379.396088 Z";

interface AvatarProps {
    uri: string | null;
    size: number;
    index?: number; // para escalonar la entrada en listas
    /** Nombre a mostrar en el visor ampliado. */
    name?: string | null;
    /** Por defecto se amplía al tocar, si hay foto. */
    zoomable?: boolean;
}

export function Avatar({ uri, size, index = 0, name, zoomable = true }: AvatarProps) {
    const [ampliada, setAmpliada] = useState(false);

    // Sin foto no hay nada que ampliar: el marcador de posición no se toca.
    const sePuedeAmpliar = zoomable && !!uri;

    const contenido = uri ? (
        <Image
            source={{ uri }}
            style={{
                width: size, height: size, borderRadius: size / 2,
                borderWidth: 2, borderColor: '#0f1623',
            }}
        />
    ) : (
        <View style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: '#1a2535',
            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
        }}>
            <Svg width={size} height={size} viewBox="280 280 450 370">
                <Path d={NAVE_PATH} fill="rgba(255,255,255,0.6)" />
            </Svg>
        </View>
    );

    return (
        <Animated.View entering={FadeIn.delay(index * 40).duration(250)}>
            {sePuedeAmpliar ? (
                // Al ser Pressable hijo, se queda el toque y no lo hereda la card
                // que lo contiene: tocar un avatar amplía, no despliega la clase.
                <Pressable
                    onPress={() => setAmpliada(true)}
                    accessibilityRole="button"
                    accessibilityLabel={name ? `Ver la foto de ${name}` : 'Ver la foto más grande'}
                    // Los avatares del roster son de 28px: sin esto el área táctil
                    // se queda por debajo de lo que cualquiera acierta con el dedo.
                    hitSlop={Math.max(0, Math.round((44 - size) / 2))}
                >
                    {contenido}
                </Pressable>
            ) : (
                contenido
            )}

            {ampliada && (
                <AvatarLightbox
                    uri={uri}
                    name={name}
                    visible={ampliada}
                    onClose={() => setAmpliada(false)}
                />
            )}
        </Animated.View>
    );
}
