/**
 * Design tokens (single source of truth for the app's dark theme).
 *
 * Consolidates the near-duplicate dark backgrounds/borders/text shades that were
 * copy-pasted across components, and reconciles the two competing red accents
 * (#ef4444 vs #dc2626) into a single `accent` value.
 *
 * Adopt these tokens in place of hardcoded hex/magic numbers. Role-specific hues
 * live under the role keys (mafia/detective/doctor/civilian).
 */

export const colors = {
  // Base surfaces (darkest -> lightest). Near-black shades consolidated to `bg`.
  bg: '#0a0d14',
  surface: '#101522',
  surfaceAlt: '#0f141f',
  surfaceRaised: '#161c2b',
  surfaceMuted: '#1e2638',

  // Borders
  border: '#1d2738',
  borderStrong: '#243046',
  borderMuted: '#334155',

  // Text (brightest -> faintest)
  textPrimary: '#ffffff',
  textBright: '#f8fafc',
  textSecondary: '#e2e8f0',
  textMuted: '#cbd5e1',
  textDim: '#94a3b8',
  textFaint: '#64748b',

  // Primary red accent (reconciled from #ef4444 / #dc2626)
  accent: '#ef4444',

  // Overlay & shadow
  overlay: 'rgba(4, 7, 14, 0.92)',
  shadow: '#000000',

  // Role colors
  mafia: '#dc2626',
  detective: '#38bdf8',
  doctor: '#10b981',
  civilian: '#a855f7',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 4,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type FontSize = typeof fontSize;
