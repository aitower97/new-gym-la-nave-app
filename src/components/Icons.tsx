import React from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  Path,
  Polyline,
  Rect,
} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const DEFAULT_COLOR = '#3B82F6';
const DEFAULT_SIZE = 24;
const DEFAULT_STROKE = 2;

// ─── Calendar ───────────────────────────────────────────────────────────────
export function CalendarIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="18" rx="3" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="16" y1="2" x2="16" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="8" y1="2" x2="8" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="7" y="14" width="3" height="3" rx="1" fill={color} />
      <Rect x="14" y="14" width="3" height="3" rx="1" fill={color} />
    </Svg>
  );
}

// ─── My Classes / Calendar Check ────────────────────────────────────────────
export function CalendarCheckIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="18" rx="3" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="16" y1="2" x2="16" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="8" y1="2" x2="8" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8 16l2.5 2.5L16 13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── User / Profile ──────────────────────────────────────────────────────────
export function UserIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Users / Group ───────────────────────────────────────────────────────────
export function UsersIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="8" r="3.5" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M2 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="17" cy="8" r="3" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M20.5 19.5c0-2.5-1.5-4-4-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Bell / Notifications ────────────────────────────────────────────────────
export function BellIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 10a7 7 0 0 1 14 0v4l2 3H3l2-3v-4z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Logout / Power ──────────────────────────────────────────────────────────
export function LogoutIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="16 17 21 12 16 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="21" y1="12" x2="9" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Clipboard / Templates ───────────────────────────────────────────────────
export function ClipboardIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="8" y="2" width="8" height="4" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M6 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Line x1="9" y1="12" x2="15" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="9" y1="16" x2="13" y2="16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Credit Card / Plans ─────────────────────────────────────────────────────
export function CreditCardIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="5" width="20" height="14" rx="3" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="2" y1="10" x2="22" y2="10" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="6" y1="15" x2="10" y2="15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Chevron Right ───────────────────────────────────────────────────────────
export function ChevronRightIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Chevron Left ────────────────────────────────────────────────────────────
export function ChevronLeftIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Refresh ─────────────────────────────────────────────────────────────────
export function RefreshIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M23 4v6h-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M1 20v-6h6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────
export function SearchIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Camera ──────────────────────────────────────────────────────────────────
export function CameraIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

// ─── Check ───────────────────────────────────────────────────────────────────
export function CheckIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Question / Help ─────────────────────────────────────────────────────────
export function QuestionIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M9.5 9a2.5 2.5 0 0 1 4.8-1c0 2-2.3 2-2.3 4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="16.5" r="0.9" fill={color} />
    </Svg>
  );
}

// ─── Plus ────────────────────────────────────────────────────────────────────
export function PlusIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Block / Full ────────────────────────────────────────────────────────────
export function BlockIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Swap / Change booking ───────────────────────────────────────────────────
export function SwapIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="17 1 21 5 17 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 11V9a4 4 0 0 1 4-4h14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Polyline points="7 23 3 19 7 15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 13v2a4 4 0 0 1-4 4H3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Barbell / Powerlifting ──────────────────────────────────────────────────
export function BarbellIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="6" y1="12" x2="18" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Rect x="2" y="9" width="4" height="6" rx="1.5" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="18" y="9" width="4" height="6" rx="1.5" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

// ─── Lightning / CrossFit ────────────────────────────────────────────────────
export function LightningIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Waves / Open Box (rest/ocean) ──────────────────────────────────────────
export function WavesIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 12c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M2 17c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M2 7c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Edit / Pencil ───────────────────────────────────────────────────────────
export function EditIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Trash / Delete ──────────────────────────────────────────────────────────
export function TrashIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="3 6 5 6 21 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

// ─── Shield / Admin ──────────────────────────────────────────────────────────
export function ShieldIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Phone / Call ────────────────────────────────────────────────────────────
export function PhoneIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Clock ───────────────────────────────────────────────────────────────────
export function ClockIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} />
      <Polyline points="12 6 12 12 16 14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Hourglass (lista de espera) ────────────────────────────────────────────
export function HourglassIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 3h12M6 21h12M7.5 3l4.5 9 4.5-9M7.5 21l4.5-9 4.5 9"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Filter (sliders) ───────────────────────────────────────────────────────
export function FilterIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="6" x2="20" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="4" y1="18" x2="20" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="9" cy="6" r="2" fill={color} />
      <Circle cx="16" cy="12" r="2" fill={color} />
      <Circle cx="11" cy="18" r="2" fill={color} />
    </Svg>
  );
}

// ─── Lock ────────────────────────────────────────────────────────────────
export function LockIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="11" width="16" height="10" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="12" cy="16" r="1.5" fill={color} />
    </Svg>
  );
}

// ─── Scale / Bodyweight ────────────────────────────────────────────────────
export function ScaleIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="18" height="18" rx="4" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M7 15a5 5 0 0 1 10 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="12" cy="15" r="0.5" fill={color} stroke={color} strokeWidth={strokeWidth} />
      <Line x1="12" y1="15" x2="14" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── X / Close ───────────────────────────────────────────────────────────────
export function XIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Note / File Text ─────────────────────────────────────────────────────────
export function NoteIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="14 2 14 8 20 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="9" y1="13" x2="15" y2="13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="9" y1="17" x2="13" y2="17" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Flex / Muscle ──────────────────────────────────────────────────────────
export function FlexIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 14c0-3 2-5 5-5h2c1.5 0 2.5 1 3 2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 14c0-3-2-5-5-5h-2c-1.5 0-2.5 1-3 2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="16" r="2.5" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

// ─── Dumbbell ────────────────────────────────────────────────────────────────
export function DumbbellIcon({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="8" y1="12" x2="16" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Rect x="1" y="9.5" width="6" height="5" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="17" y="9.5" width="6" height="5" rx="2" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

// ─── IconBox: wraps icon in a styled container ───────────────────────────────
interface IconBoxProps extends IconProps {
  bg?: string;
  padding?: number;
  borderRadius?: number;
}

export function IconBox({
  bg = 'rgba(37,99,235,0.15)',
  padding = 10,
  borderRadius = 12,
  ...iconProps
}: IconBoxProps & { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: bg,
        padding,
        borderRadius,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {(iconProps as any).children}
    </View>
  );
}
