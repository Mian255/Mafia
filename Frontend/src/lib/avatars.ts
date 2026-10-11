import type { ImageSourcePropType } from 'react-native';
import { CHARACTER_IMAGES, RoleId } from '../components/RoleCard';

/**
 * User headshots available for the profile avatar picker. Keys must match the
 * file names in assets/Avatars/ exactly (without the .jpeg extension).
 */
export const AVAILABLE_PHOTOS = [
  'WhatsApp Image 2026-10-04 at 7.59.48 AM',
  'WhatsApp Image 2026-10-04 at 8.10.27 AM',
  'WhatsApp Image 2026-10-04 at 8.49.04 AM',
  'WhatsApp Image 2026-10-04 at 8.51.39 AM',
  'WhatsApp Image 2026-10-04 at 8.56.25 AM',
  'WhatsApp Image 2026-10-04 at 9.03.47 AM',
  'WhatsApp Image 2026-10-04 at 9.07.30 AM',
  'WhatsApp Image 2026-10-04 at 9.13.44 AM',
  'WhatsApp Image 2026-10-04 at 9.23.54 AM',
  'WhatsApp Image 2026-10-04 at 9.25.26 AM',
  'WhatsApp Image 2026-10-04 at 9.39.53 AM',
  'WhatsApp Image 2026-10-04 at 10.19.25 AM',
  'WhatsApp Image 2026-10-05 at 12.06.49 AM',
] as const;

export type PhotoKey = (typeof AVAILABLE_PHOTOS)[number];

/**
 * Static map of every avatar photo. Metro's bundler only resolves require()
 * calls with literal paths, so each asset is required explicitly here — never
 * build these with template literals.
 */
export const PHOTO_SOURCES: Record<PhotoKey, ImageSourcePropType> = {
  'WhatsApp Image 2026-10-04 at 7.59.48 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 7.59.48 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 8.10.27 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 8.10.27 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 8.49.04 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 8.49.04 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 8.51.39 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 8.51.39 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 8.56.25 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 8.56.25 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 9.03.47 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 9.03.47 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 9.07.30 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 9.07.30 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 9.13.44 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 9.13.44 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 9.23.54 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 9.23.54 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 9.25.26 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 9.25.26 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 9.39.53 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 9.39.53 AM.jpeg'),
  'WhatsApp Image 2026-10-04 at 10.19.25 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-04 at 10.19.25 AM.jpeg'),
  'WhatsApp Image 2026-10-05 at 12.06.49 AM': require('../../assets/Avatars/WhatsApp Image 2026-10-05 at 12.06.49 AM.jpeg'),
};

/** True when the stored avatar value names one of the user photo keys. */
export function isPhotoKey(value: string | null | undefined): value is PhotoKey {
  return !!value && Object.prototype.hasOwnProperty.call(PHOTO_SOURCES, value);
}

/**
 * Resolves a stored `profiles.avatar_url` value into an image source.
 * Handles both character role ids ("mafia", "civilian", ...) and user photo
 * keys (the WhatsApp Image filenames). Returns null when nothing matches,
 * so callers can fall back to the initial-letter placeholder.
 */
export function resolveAvatarImage(
  avatarId: string | null | undefined
): ImageSourcePropType | null {
  if (!avatarId) return null;
  if (isPhotoKey(avatarId)) return PHOTO_SOURCES[avatarId];
  const roleImage = CHARACTER_IMAGES[avatarId as RoleId];
  return roleImage ?? null;
}
