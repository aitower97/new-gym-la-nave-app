/**
 * WhatsNewModal.tsx — "Novedades" tras una actualización. Una vez por móvil.
 * Lo abren MainMenu (socio) y AdminDashboard (admin); contenido y reglas en
 * src/content/releaseNotes.ts y src/utils/whatsNew.ts.
 */

import { useRef } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Colors, moderateScale, Radius, scale as s } from '../theme';
import { WhatsNewSection } from '../utils/whatsNew';

interface Props {
  visible: boolean;
  sections: WhatsNewSection[];
  onClose: () => void;
}

export function WhatsNewModal({ visible, sections, onClose }: Props) {
  // Las últimas secciones se mantienen durante el fade de cierre: si no, la
  // tarjeta se queda vacía y encoge mientras desaparece.
  const lastSections = useRef(sections);
  if (sections.length > 0) lastSections.current = sections;
  const shown = lastSections.current;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: s(24) }}>
        <View style={{
          width: '100%', maxWidth: 340, maxHeight: '85%',
          backgroundColor: '#0d1929',
          borderRadius: Radius.xl,
          borderWidth: 1, borderColor: Colors.cardBorder,
          padding: s(22),
        }}>
          <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary, marginBottom: s(14) }}>
            Novedades
          </Text>

          {/* Por si el admin tiene muchas líneas en un móvil pequeño */}
          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator persistentScrollbar>
            {shown.map((section, si) => (
              <View key={si} style={{ marginBottom: si < shown.length - 1 ? s(16) : 0 }}>
                {section.title && (
                  <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: s(8) }}>
                    {section.title}
                  </Text>
                )}
                {section.items.map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: s(10), marginBottom: s(8) }}>
                    <View style={{ width: s(6), height: s(6), borderRadius: s(3), backgroundColor: Colors.blue400, marginTop: (moderateScale(20) - s(6)) / 2 }} />
                    <Text style={{ flex: 1, fontSize: moderateScale(14), color: Colors.textSecondary, lineHeight: moderateScale(20) }}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <Pressable onPress={onClose} style={({ pressed }) => ({ marginTop: s(18), opacity: pressed ? 0.8 : 1 })}>
            <View style={{ backgroundColor: Colors.blue500, borderRadius: Radius.md, paddingVertical: s(13), alignItems: 'center' }}>
              <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: '#fff' }}>Vale</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
