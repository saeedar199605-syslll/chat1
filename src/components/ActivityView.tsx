import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Bookmark, Check, CheckCheck, MoonStar, Sparkles, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { formatAppDate } from '../utils/jalali';
import type { Message, NotificationItem } from '../types/index';

interface ActivityViewProps {
  mode: 'activity' | 'saved';
  notifications: NotificationItem[];
  onJumpToChannel: (channelId: string) => void;
}

export function ActivityView({ mode, notifications, onJumpToChannel }: ActivityViewProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const showToast = useAppStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';

  const bookmarksQuery = useQuery({
    queryKey: ['bookmarks'],
    queryFn: api.getBookmarks,
    enabled: mode === 'saved',
  });

  const groupInvitesQuery = useQuery({
    queryKey: ['group-invites'],
    queryFn: api.getGroupInvites,
    enabled: mode === 'activity',
  });

  const handleToggleDnd = async () => {
    if (!currentUser) return;
    const res = await api.updateMyDnd({ dndEnabled: !currentUser.dndEnabled });
    setCurrentUser(res.user);
    showToast(
      res.user.dndEnabled
        ? isFa
          ? 'زمان‌بندی «مزاحم نشوید» فعال شد'
          : 'Do Not Disturb schedule enabled'
        : isFa
          ? 'اعلان‌ها فعال شدند'
          : 'Notifications active'
    );
  };

  const handleSimulateIosPopup = async () => {
    try {
      await api.triggerTestNotification({
        title: isFa ? 'اعلان جدید در #engineering-core' : 'Marcus Vance in #engineering-core',
        body: isFa
          ? 'گزارش لحظه‌ای سامانه اصفهان چالاک: برای مشاهده روی بنر کلیک کنید.'
          : 'p95 WebSocket dispatch at 18ms. Tap this banner to jump to the channel.',
        type: 'MENTION',
      });
      if (currentUser?.dndEnabled) {
        showToast(
          isFa
            ? 'حالت مزاحم نشوید فعال است — اعلان بدون پاپ‌آپ ثبت شد'
            : 'DND is active — notification logged quietly without popup banner'
        );
      }
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  if (mode === 'saved') {
    const saved: Message[] = bookmarksQuery.data?.messages || [];
    return (
      <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
        <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2.5 shrink-0">
          <Bookmark className="w-4 h-4 text-red-600 dark:text-red-400" />
          <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100">
            {isFa ? 'پیام‌های ذخیره‌شده و نشانه‌گذاری‌ها' : 'Saved & Bookmarked Messages'}
          </h1>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-3 max-w-3xl">
          {saved.length === 0 ? (
            <div className="p-10 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-500">
              {isFa
                ? 'هنوز پیامی نشانه‌گذاری نشده است. روی هر پیام کلیک راست کنید و گزینه نشانه‌گذاری را بزنید.'
                : 'No bookmarked messages yet. Hover any message and click the Bookmark icon to save it here.'}
            </div>
          ) : (
            saved.map((msg) => (
              <div
                key={msg.id}
                className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {msg.author.displayName}
                  </span>
                  <button
                    type="button"
                    onClick={() => onJumpToChannel(msg.channelId)}
                    className="text-red-600 dark:text-red-400 hover:underline font-medium"
                  >
                    {isFa ? 'رفتن به کانال' : 'Jump to channel'}
                  </button>
                </div>
                <p className="text-sm text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Bell className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100 truncate">
            {isFa ? 'مرکز اعلان‌های هوشمند (سبک iOS)' : 'Smart Notification Center'}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSimulateIosPopup}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isFa ? 'تست پاپ‌آپ iOS' : 'Test iOS Popup'}</span>
          </button>
          <button
            type="button"
            onClick={handleToggleDnd}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              currentUser?.dndEnabled
                ? 'bg-red-50 dark:bg-red-950/60 border-red-400 text-red-700 dark:text-red-300'
                : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200'
            }`}
          >
            <MoonStar className="w-3.5 h-3.5" />
            <span>{isFa ? `سکوت: ${currentUser?.dndEnabled ? 'فعال' : 'خاموش'}` : `DND: ${currentUser?.dndEnabled ? 'ON (19:00–08:00)' : 'OFF'}`}</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              await api.readAllNotifications();
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-xs font-medium hover:border-red-400 whitespace-nowrap shrink-0"
          >
            <CheckCheck className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            <span>{isFa ? 'خواندن همه' : 'Mark All Read'}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-3xl">
        {(groupInvitesQuery.data?.invites || []).length > 0 && (
          <div
            data-testid="pending-group-invites-panel"
            className="p-4 rounded-2xl ios-glass-selected-soft space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-red-700 dark:text-red-300">
              <Users className="w-4 h-4" />
              <span>
                {isFa
                  ? `دعوت‌نامه‌های عضویت در گروه (${groupInvitesQuery.data!.invites.length})`
                  : `Pending Group Join Requests (${groupInvitesQuery.data!.invites.length})`}
              </span>
            </div>
            <div className="space-y-2">
              {groupInvitesQuery.data!.invites.map((inv) => (
                <div
                  key={inv.id}
                  data-testid={`group-invite-card-${inv.id}`}
                  className="p-3 rounded-xl bg-white/90 dark:bg-neutral-900/90 border border-red-200/70 dark:border-red-900/50 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {inv.channelName}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {isFa ? `دعوت از طرف ${inv.inviterName}` : `Invited by ${inv.inviterName}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid={`accept-group-invite-${inv.id}`}
                      onClick={async () => {
                        await api.respondGroupInvite(inv.id, 'ACCEPT');
                        queryClient.invalidateQueries({ queryKey: ['group-invites'] });
                        queryClient.invalidateQueries({ queryKey: ['channels'] });
                        queryClient.invalidateQueries({ queryKey: ['notifications'] });
                        showToast(isFa ? `به گروه ${inv.channelName} پیوستید` : `Joined ${inv.channelName}`);
                        onJumpToChannel(inv.channelId);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ios-glass-selected text-xs font-semibold cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isFa ? 'پذیرش و ورود' : 'Accept'}</span>
                    </button>
                    <button
                      type="button"
                      data-testid={`decline-group-invite-${inv.id}`}
                      onClick={async () => {
                        await api.respondGroupInvite(inv.id, 'DECLINE');
                        queryClient.invalidateQueries({ queryKey: ['group-invites'] });
                        queryClient.invalidateQueries({ queryKey: ['notifications'] });
                        showToast(isFa ? 'دعوت‌نامه رد شد' : 'Invitation declined');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-600 dark:text-neutral-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isFa ? 'رد کردن' : 'Decline'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="p-10 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-500">
            {isFa
              ? 'همه اعلان‌ها بررسی شده‌اند. منشن‌ها، پاسخ‌های رشته گفتگو و تکالیف جدید اینجا نمایش داده می‌شوند.'
              : 'You are completely caught up. Mentions, thread replies, and task assignments appear here.'}
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={async () => {
                if (!n.isRead) {
                  await api.readNotification(n.id);
                  queryClient.invalidateQueries({ queryKey: ['notifications'] });
                }
                if (n.channelId) onJumpToChannel(n.channelId);
              }}
              className={`w-full text-start p-4 rounded-xl ios-glass-card border transition-colors ${
                n.isRead
                  ? 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 opacity-75'
                  : 'bg-white dark:bg-neutral-900 border-red-300 dark:border-red-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">{n.title}</span>
                <span className="font-mono tabular-nums text-[11px] text-neutral-400">
                  {formatAppDate(n.createdAt, { calendarSystem, locale, includeTime: true })}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2">{n.body}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
