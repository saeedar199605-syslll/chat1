import { useState } from 'react';
import {
  Archive,
  Check,
  CheckSquare,
  Edit3,
  FileText,
  FolderOpen,
  Hash,
  Headphones,
  Lock,
  Megaphone,
  Pin,
  Search,
  Star,
  Users,
  Video,
  Wrench,
  X,
} from 'lucide-react';
import { useAppStore, type DrawerTab } from '../store/useAppStore';
import { canPerformWithMatrix } from '../utils/chatLogic';
import { FocusTimerWidget } from './FocusTimerWidget';
import { tipProps } from './GlassTooltip';
import type { Channel } from '../types/index';

interface ChannelHeaderProps {
  channel: Channel | undefined;
  onToggleStar: () => void;
  onStartHuddle: () => void;
  onUpdateTopic: (topic: string) => Promise<void>;
  onArchiveChannel: () => Promise<void>;
}

export function ChannelHeader({
  channel,
  onToggleStar,
  onStartHuddle,
  onUpdateTopic,
  onArchiveChannel,
}: ChannelHeaderProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const locale = useAppStore((s) => s.locale);
  const drawerTab = useAppStore((s) => s.drawerTab);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setDailyToolsOpen = useAppStore((s) => s.setDailyToolsOpen);
  const activeHuddleChannelId = useAppStore((s) => s.activeHuddleChannelId);
  const huddlesSnapshot = useAppStore((s) => s.huddlesSnapshot);

  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');

  if (!channel) return null;
  const isFa = locale === 'fa';

  const drawerButtons: Array<{ id: DrawerTab; label: string; tipFa: string; tipEn: string; icon: typeof FileText }> = [
    { id: 'files', label: isFa ? 'فایل‌ها' : 'Files', tipFa: 'مخزن فایل‌ها و اسناد کانال', tipEn: 'Channel Files Repository', icon: FolderOpen },
    { id: 'wiki', label: isFa ? 'دانش‌نامه' : 'Wiki', tipFa: 'سند و دانش‌نامه مشترک زنده', tipEn: 'Live Collaborative Wiki', icon: FileText },
    { id: 'tasks', label: isFa ? 'وظایف' : 'Tasks', tipFa: 'تسک‌ها و مصوبات کانال', tipEn: 'Channel Action Items', icon: CheckSquare },
    { id: 'pinned', label: isFa ? 'سنجاق' : 'Pinned', tipFa: 'پیام‌های مهم سنجاق‌شده', tipEn: 'Pinned Messages', icon: Pin },
    { id: 'members', label: isFa ? 'اعضا' : 'Members', tipFa: 'لیست اعضا و دعوت همکاران جدید', tipEn: 'Members & Add Colleagues', icon: Users },
  ];

  const liveHuddle = huddlesSnapshot[channel.id];
  const inThisHuddle = activeHuddleChannelId === channel.id;
  const canManageChannel = canPerformWithMatrix(currentUser, 'channel:delete', channel.type, rbacMatrix);

  return (
    <header className="h-14 px-2.5 sm:px-4 lg:px-5 ios-glass bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-1.5 sm:gap-3 shrink-0 z-20">
      {/* Left: Channel Identity & Inline Topic Editor */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
        <span className="text-red-600 dark:text-red-400 shrink-0">
          {channel.type === 'ANNOUNCEMENT' ? (
            <Megaphone className="w-4 h-4 text-red-600 dark:text-red-400" />
          ) : channel.type === 'PRIVATE' ? (
            <Lock className="w-4 h-4" />
          ) : (
            <Hash className="w-4 h-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
              {channel.name}
            </h1>
            <button
              type="button"
              onClick={onToggleStar}
              aria-label={channel.isStarred ? 'Unstar channel' : 'Star channel'}
              className="text-neutral-400 hover:text-amber-500 transition-colors shrink-0"
            >
              <Star className={`w-3.5 h-3.5 ${channel.isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
          </div>

          {editingTopic ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onUpdateTopic(topicDraft.trim());
                setEditingTopic(false);
              }}
              className="hidden lg:flex items-center gap-1 mt-0.5"
            >
              <input
                type="text"
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                aria-label="Channel topic input"
                className="px-2 py-0.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-800 border border-red-500 text-neutral-800 dark:text-neutral-100 w-56 focus:outline-none"
                autoFocus
              />
              <button type="submit" aria-label="Save topic" className="p-0.5 text-emerald-600">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setEditingTopic(false)}
                aria-label="Cancel topic edit"
                className="p-0.5 text-neutral-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <div className="hidden lg:flex items-center gap-1.5 min-w-0">
              {channel.topic && (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                  {channel.topic}
                </p>
              )}
              {canManageChannel && channel.type !== 'DM' && (
                <button
                  type="button"
                  onClick={() => {
                    setTopicDraft(channel.topic || '');
                    setEditingTopic(true);
                  }}
                  aria-label="Edit channel topic"
                  title={isFa ? 'ویرایش موضوع کانال' : 'Edit channel topic'}
                  className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center/Right: Focus Timer + Omnibox Search + Contextual Drawer Tabs + Archive + Primary Huddle Action */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div className="hidden sm:block">
          <FocusTimerWidget />
        </div>

        <button
          type="button"
          data-testid="header-tools-btn"
          onClick={() => setDailyToolsOpen(true, 'pdf')}
          aria-label={isFa ? 'ابزارهای روزانه و مبدل PDF' : 'Daily Tools'}
          {...tipProps('جعبه ابزار روزانه: بررسی/تبدیل PDF، تقویم شمسی و ماشین‌حساب', 'Daily Tools: PDF Converter, Jalali & Calculator')}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-50/80 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200/70 dark:border-red-900/50 hover:bg-red-100/80 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <Wrench className="w-3.5 h-3.5" />
          <span className={drawerTab !== 'none' ? 'hidden' : 'hidden 2xl:inline'}>
            {isFa ? 'ابزارها' : 'Tools'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label={isFa ? 'جستجوی سراسری' : 'Global search'}
          {...tipProps('جستجوی سراسری در پیام‌ها و فایل‌ها (Ctrl+K)', 'Global Search Across Messages & Files (Ctrl+K)')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-100/90 dark:bg-neutral-800/90 text-neutral-600 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <span className={drawerTab !== 'none' ? 'hidden' : 'hidden xl:inline'}>
            {isFa ? 'جستجو' : 'Search'}
          </span>
          <kbd className={`${drawerTab !== 'none' ? 'hidden' : 'hidden 2xl:inline'} ms-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600`}>
            Ctrl+K
          </kbd>
        </button>

        <div className="hidden sm:flex items-center gap-0.5 p-1 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/80">
          {drawerButtons.map((btn) => {
            const Icon = btn.icon;
            const active = drawerTab === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setDrawerTab(active ? 'none' : btn.id)}
                {...tipProps(btn.tipFa, btn.tipEn)}
                aria-label={btn.label}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'ios-glass-selected'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className={drawerTab !== 'none' ? 'hidden 2xl:inline' : 'hidden xl:inline'}>{btn.label}</span>
                {btn.id === 'members' && (
                  <span className={`text-[11px] font-mono tabular-nums ${active ? 'text-red-100' : 'text-neutral-400'}`}>
                    {channel.memberCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {canManageChannel && channel.type !== 'DM' && (
          <button
            type="button"
            onClick={onArchiveChannel}
            aria-label="Archive channel"
            {...tipProps('بایگانی کانال جاری', 'Archive Current Channel')}
            className="hidden sm:inline-flex p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-neutral-800 shrink-0 cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onStartHuddle}
          {...tipProps('شروع تماس صوتی، تصویری و اشتراک صفحه زنده', 'Start Live Audio/Video Huddle & Screen Share')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            inThisHuddle || liveHuddle
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              : 'ios-glass-selected'
          }`}
        >
          {inThisHuddle || liveHuddle ? (
            <>
              <Headphones className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {inThisHuddle
                  ? isFa
                    ? 'ورود به جلسه'
                    : 'Open Huddle'
                  : isFa
                    ? `پیوستن به جلسه (${liveHuddle.participantCount})`
                    : `Join Huddle (${liveHuddle.participantCount})`}
              </span>
            </>
          ) : (
            <>
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isFa ? 'شروع جلسه' : 'Start Huddle'}</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
