import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base design dimensions (iPhone 14 Pro)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

// Clamp width/height so elements never scale UP beyond the base design.
// This prevents oversized UI on large Android phones or tablets.
const EFFECTIVE_WIDTH = Math.min(SCREEN_WIDTH, BASE_WIDTH);
const EFFECTIVE_HEIGHT = Math.min(SCREEN_HEIGHT, BASE_HEIGHT);

// Scale functions for responsive sizing
export const scale = (size: number): number =>
  Math.round(PixelRatio.roundToNearestPixel((size * EFFECTIVE_WIDTH) / BASE_WIDTH));

export const verticalScale = (size: number): number =>
  Math.round(PixelRatio.roundToNearestPixel((size * EFFECTIVE_HEIGHT) / BASE_HEIGHT));

// moderateScale: smooths the scaling (factor=0.35 = 35% of full scale, less aggressive)
export const moderateScale = (size: number, factor = 0.35): number =>
  Math.round(size + (scale(size) - size) * factor);

export const { width: sw, height: sh } = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

// Color palette
export const Colors = {
  // Backgrounds
  background: '#08111f',
  surface: '#0f1c2e',
  surfaceElevated: '#152235',
  card: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.08)',

  // Primary blue palette
  blue900: '#1e3a5f',
  blue700: '#1D4ED8',
  blue600: '#2563EB',
  blue500: '#3B82F6',
  blue400: '#60A5FA',
  blue300: '#93C5FD',

  // Accent / electric blue for icons
  iconBlue: '#2563EB',
  iconBlueBright: '#3B82F6',

  // Semantic colors
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  dangerLight: 'rgba(239,68,68,0.15)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.35)',
  textDisabled: 'rgba(255,255,255,0.2)',

  // Borders
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',
  borderBlue: 'rgba(59,130,246,0.3)',

  // Input
  inputBg: 'rgba(255,255,255,0.06)',
  inputBorder: 'rgba(255,255,255,0.12)',
  inputBorderFocus: '#3B82F6',
  placeholder: 'rgba(255,255,255,0.3)',
} as const;

// Font families
export const Fonts = {
  regular: 'Oswald_400Regular',
  semiBold: 'Oswald_600SemiBold',
  bold: 'Oswald_700Bold',
  // System fallback for body text (Oswald is condensed — better for headings/labels)
  body: undefined as undefined, // uses system default
} as const;

// Typography scale
export const Typography = {
  // Display — Oswald Bold (condensed, strong)
  display: { fontSize: moderateScale(28), fontFamily: 'Oswald_700Bold', letterSpacing: 0.5 },
  heading1: { fontSize: moderateScale(22), fontFamily: 'Oswald_700Bold', letterSpacing: 0.3 },
  heading2: { fontSize: moderateScale(19), fontFamily: 'Oswald_600SemiBold', letterSpacing: 0.2 },
  heading3: { fontSize: moderateScale(17), fontFamily: 'Oswald_600SemiBold', letterSpacing: 0.1 },
  heading4: { fontSize: moderateScale(15), fontFamily: 'Oswald_600SemiBold' },

  // Body — system font (more readable at small sizes)
  bodyLg: { fontSize: moderateScale(15), fontWeight: '400' as const, lineHeight: moderateScale(22) },
  body: { fontSize: moderateScale(14), fontWeight: '400' as const, lineHeight: moderateScale(21) },
  bodySm: { fontSize: moderateScale(13), fontWeight: '400' as const, lineHeight: moderateScale(19) },

  // Caption
  caption: { fontSize: moderateScale(12), fontFamily: 'Oswald_400Regular' },
  captionSm: { fontSize: moderateScale(11), fontFamily: 'Oswald_400Regular' },
  label: { fontSize: moderateScale(13), fontWeight: '600' as const, letterSpacing: 0.3 },
} as const;

// Spacing scale
export const Spacing = {
  xs: scale(4),
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(20),
  xxl: scale(24),
  xxxl: scale(32),
  section: scale(40),
} as const;

// Border radius
export const Radius = {
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(20),
  xxl: scale(24),
  full: 9999,
} as const;

// Shadows
export const Shadows = {
  blue: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
} as const;
