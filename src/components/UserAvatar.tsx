import { useState } from 'react';
import { getInitials, resolveAvatarUrl } from '../utils/avatars';
import type { PresenceStatus } from '../types/index';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  presence?: PresenceStatus;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showPresence?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
  xl: 'w-14 h-14 text-base',
};

const PRESENCE_DOT: Record<PresenceStatus, string> = {
  ONLINE: 'bg-emerald-500',
  IN_MEETING: 'bg-red-600',
  FOCUS_MODE: 'bg-red-400',
  AWAY: 'bg-amber-500',
  OFFLINE: 'bg-neutral-400',
};

export function UserAvatar({
  name,
  avatarUrl,
  presence,
  size = 'md',
  showPresence = false,
}: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolved = resolveAvatarUrl(avatarUrl);
  const sizeCls = SIZE_CLASSES[size];

  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-semibold select-none ${sizeCls}`}>
      {resolved && !imgFailed ? (
        <img
          src={resolved}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover rounded-lg"
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}

      {showPresence && presence && (
        <span
          title={presence.replace('_', ' ')}
          className={`absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-900 ${PRESENCE_DOT[presence]}`}
        />
      )}
    </div>
  );
}
