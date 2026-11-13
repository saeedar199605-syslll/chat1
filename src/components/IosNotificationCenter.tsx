import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  Check,
  CheckCheck,
  CheckSquare,
  MessageSquare,
  PhoneMissed,
  Reply,
  Send,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { UserAvatar } from './UserAvatar';
import type { NotificationType } from '../types/index';

interface IosNotificationCenterProps {
  onNavigateToChannel: (channelId: string) => void;
}

function getTypeStyle(type: NotificationType) {
  switch (type) {
    case 'TASK_ASSIGNED':
      return {
        icon: CheckSquare,
        badge: 'bg-emerald-500 text-white shadow-emerald-500/25',
        ring: 'text-emerald-600 dark:text-emerald-400',
      };
    case 'MISSED_CALL':
      return {
        icon: PhoneMissed,
        badge: 'bg-red-600 text-white shadow-red-600/25',
        ring: 'text-red-600 dark:text-red-400',
      };
    case 'GROUP_INVITE':
      return {
        icon: Users,
        badge: 'bg-red-500 text-white shadow-red-500/25',
        ring: 'text-red-600 dark:text-red-400',
      };
    case 'THREAD_REPLY':
    case 'MENTION':
      return {
        icon: MessageSquare,
        badge: 'bg-rose-600 text-white shadow-rose-600/25',
        ring: 'text-red-600 dark:text-red-400',
      };
    default:
      return {
        icon: Bell,
        badge: 'bg-red-600 text-white shadow-red-600/25',
        ring: 'text-red-600 dark:text-red-400',
      };
  }
}

function playGentleNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 350);
  } catch {
    // Headless or autoplay-restricted contexts safely ignore chime
  }
}

export function IosNotificationCenter({ onNavigateToChannel }: IosNotificationCenterProps) {
  const iosPopups = useAppStore((s) => s.iosPopups);
  const dismissIosPopup = useAppStore((s) => s.dismissIosPopup);
  const notifSoundEnabled = useAppStore((s) => s.notifSoundEnabled);
  const showToast = useAppStore((s) => s.showToast);
  const locale = useAppStore((s) => s.locale);
  const qc = useQueryClient();
  const isFa = locale === 'fa';

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let hasNew = false;
    for (const p of iosPopups) {
      if (!seenIdsRef.current.has(p.id)) {
        seenIdsRef.current.add(p.id);
        hasNew = true;
      }
    }
    if (hasNew && notifSoundEnabled) {
      playGentleNotificationChime();
    }
  }, [iosPopups, notifSoundEnabled]);

  const handleInviteAction = async (
    e: React.MouseEvent,
    popupId: string,
    inviteId: string,
    action: 'ACCEPT' | 'DECLINE'
  ) => {
    e.stopPropagation();
    try {
      const res = await api.respondGroupInvite(inviteId, action);
      dismissIosPopup(popupId);
      qc.invalidateQueries({ queryKey: ['group-invites'] });
      qc.invalidateQueries({ queryKey: ['channels'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (action === 'ACCEPT') {
        showToast(isFa ? 'عضویت در گروه با موفقیت تأیید شد' : 'Joined group successfully');
        if (res.channelId) onNavigateToChannel(res.channelId);
      } else {
        showToast(isFa ? 'دعوت عضویت در گروه رد شد' : 'Group invitation declined');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleQuickReplySubmit = async (
    e: React.FormEvent,
    popupId: string,
    channelId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const text = (replyDrafts[popupId] || '').trim();
    if (!text) return;
    setSendingId(popupId);
    try {
      await api.postMessage(channelId, { content: text });
      setReplyDrafts((prev) => ({ ...prev, [popupId]: '' }));
      setReplyOpenId(null);
      dismissIosPopup(popupId);
      qc.invalidateQueries({ queryKey: ['messages', channelId] });
      showToast(isFa ? 'پاسخ سریع ارسال شد' : 'Quick reply sent');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSendingId(null);
    }
  };

  const handleMarkRead = (e: React.MouseEvent, popupId: string) => {
    e.stopPropagation();
    dismissIosPopup(popupId);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div
      aria-live="polite"
      aria-label={isFa ? 'اعلان‌های پاپ‌آپ' : 'Notification banners'}
      className="fixed top-16 end-5 z-50 flex flex-col items-end gap-2.5 pointer-events-none w-[calc(100%-2rem)] max-w-sm"
    >
      <AnimatePresence mode="popLayout">
        {iosPopups.map((popup, idx) => {
          const style = getTypeStyle(popup.type);
          const TypeIcon = style.icon;
          const isPaused = hoveredId === popup.id || replyOpenId === popup.id;
          const canReply = Boolean(popup.channelId) && popup.type !== 'GROUP_INVITE';

          return (
            <motion.div
              layout
              key={popup.id}
              data-testid="ios-popup-banner"
              initial={{ opacity: 0, y: -38, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 440, damping: 30, delay: idx * 0.03 }}
              whileHover={{ scale: 1.015 }}
              onMouseEnter={() => setHoveredId(popup.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === popup.id ? null : prev))}
              onClick={() => {
                if (popup.type !== 'GROUP_INVITE' && popup.channelId) {
                  onNavigateToChannel(popup.channelId);
                }
                dismissIosPopup(popup.id);
              }}
              className="relative overflow-hidden pointer-events-auto w-full max-w-md cursor-pointer rounded-3xl ios-glass-strong bg-white/94 dark:bg-neutral-900/94 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-2xl px-4 py-3"
            >
              {/* Subtle iOS 27 specular shimmer sweep */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <div className="ios-shimmer-line w-1/3 h-full bg-gradient-to-r from-transparent via-white/35 dark:via-white/10 to-transparent skew-x-[-20deg]" />
              </div>

              <div className="relative z-10 flex items-start gap-3">
                <motion.div
                  initial={{ scale: 0.7, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  className="relative shrink-0"
                >
                  {popup.senderName ? (
                    <>
                      <UserAvatar name={popup.senderName} avatarUrl={popup.avatarUrl} size="md" />
                      <span
                        className={`absolute -bottom-1 -end-1 w-4 h-4 rounded-md flex items-center justify-center shadow-xs ring-2 ring-white dark:ring-neutral-900 ${style.badge}`}
                      >
                        <TypeIcon className="w-2.5 h-2.5" />
                      </span>
                    </>
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-md ${style.badge}`}
                    >
                      <TypeIcon className="w-4 h-4" />
                    </div>
                  )}
                </motion.div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <span className="text-[11px] font-bold tracking-wide text-red-600 dark:text-red-400">
                        {isFa ? 'اصفهان چالاک' : 'Esfahan Chalak'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-neutral-400 shrink-0">
                      {isPaused ? (isFa ? 'مکث' : 'paused') : isFa ? 'اکنون' : 'now'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                    {popup.title}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2 leading-snug">
                    {popup.body}
                  </p>

                  {/* Action Buttons Row */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {popup.type === 'GROUP_INVITE' && popup.inviteId && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => handleInviteAction(e, popup.id, popup.inviteId!, 'ACCEPT')}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-xl ios-glass-selected text-[11px] font-semibold"
                        >
                          <Check className="w-3 h-3" />
                          <span>{isFa ? 'تأیید و عضویت' : 'Accept'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleInviteAction(e, popup.id, popup.inviteId!, 'DECLINE')}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-200 text-[11px] font-medium hover:bg-neutral-100"
                        >
                          <X className="w-3 h-3" />
                          <span>{isFa ? 'رد دعوت' : 'Decline'}</span>
                        </button>
                      </>
                    )}

                    {canReply && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyOpenId((prev) => (prev === popup.id ? null : popup.id));
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-50/90 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200/70 dark:border-red-900/50 text-[11px] font-semibold hover:bg-red-100 transition-colors"
                      >
                        <Reply className="w-3 h-3" />
                        <span>{isFa ? 'پاسخ سریع' : 'Quick Reply'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleMarkRead(e, popup.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-300 text-[11px] font-medium hover:bg-neutral-200/70 transition-colors"
                    >
                      <CheckCheck className="w-3 h-3" />
                      <span>{isFa ? 'خوانده شد' : 'Mark Read'}</span>
                    </button>
                  </div>

                  {/* Inline Quick Reply Box */}
                  {canReply && replyOpenId === popup.id && (
                    <form
                      onSubmit={(e) => handleQuickReplySubmit(e, popup.id, popup.channelId!)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={replyDrafts[popup.id] || ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [popup.id]: e.target.value }))
                        }
                        placeholder={isFa ? 'پاسخ فوری بنویسید...' : 'Write quick reply...'}
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl text-[11px] bg-white dark:bg-neutral-800 border border-red-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                      />
                      <button
                        type="submit"
                        disabled={sendingId === popup.id || !(replyDrafts[popup.id] || '').trim()}
                        aria-label={isFa ? 'ارسال پاسخ' : 'Send reply'}
                        className="p-1.5 rounded-xl ios-glass-selected disabled:opacity-45"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </form>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissIosPopup(popup.id);
                  }}
                  aria-label={isFa ? 'بستن اعلان' : 'Dismiss notification banner'}
                  className="p-1 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Auto-dismiss lifetime micro progress bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: isPaused ? undefined : 0 }}
                transition={{ duration: 7.5, ease: 'linear' }}
                style={{ transformOrigin: isFa ? 'right' : 'left' }}
                className="mt-2.5 h-0.5 rounded-full bg-gradient-to-r from-red-500/75 via-red-400/50 to-transparent"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
