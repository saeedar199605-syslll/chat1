import elenaImg from '../assets/images/avatar_elena_rostova_1794561706491_256.jpg';
import marcusImg from '../assets/images/avatar_marcus_vance_1794561707428_256.jpg';
import priyaImg from '../assets/images/avatar_priya_nair_1794561707140_256.jpg';
import dariushImg from '../assets/images/avatar_dariush_farahani_1794561708183_256.jpg';

const AVATAR_MAP: Record<string, string> = {
  'elena.jpg': elenaImg,
  'marcus.jpg': marcusImg,
  'priya.jpg': priyaImg,
  'dariush.jpg': dariushImg,
};

export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (AVATAR_MAP[avatarUrl]) return AVATAR_MAP[avatarUrl];
  return avatarUrl;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
