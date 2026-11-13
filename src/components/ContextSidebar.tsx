import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Archive,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Hash,
  Headphones,
  Lock,
  Megaphone,
  Maximize2,
  MessageSquare,
  PhoneOff,
  Plus,
  Search,
  Star,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { canPerformWithMatrix } from '../utils/chatLogic';
import { tipProps } from './GlassTooltip';
import { UserAvatar } from './UserAvatar';
import type { Channel, User, Workspace } from '../types/index';

interface ContextSidebarProps {
  workspace: Workspace | undefined;
  channels: Channel[];
  directoryUsers: User[];
  onOpenDm: (userId: string) => void;
  onLeaveHuddle: () => void;
  onStartHuddle?: (ch: Channel) => void;
  onEditWorkspace?: (ws: Workspace) => void;
}

export function ContextSidebar({
  workspace,
  channels,
  directoryUsers,
  onOpenDm,
  onLeaveHuddle,
  onStartHuddle,
  onEditWorkspace,
}: ContextSidebarProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const setCreateChannelOpen = useAppStore((s) => s.setCreateChannelOpen);
  const activeHuddleChannelId = useAppStore((s) => s.activeHuddleChannelId);
  const huddleTopic = useAppStore((s) => s.huddleTopic);
  const huddleParticipants = useAppStore((s) => s.huddleParticipants);
  const setHuddleState = useAppStore((s) => s.setHuddleState);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);
  const setRailTab = useAppStore((s) => s.setRailTab);
  const setPrefilledTaskAssigneeId = useAppStore((s) => s.setPrefilledTaskAssigneeId);
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const showToast = useAppStore((s) => s.showToast);
  const huddlesSnapshot = useAppStore((s) => s.huddlesSnapshot);
  const locale = useAppStore((s) => s.locale);
  const qc = useQueryClient();

  const isFa = locale === 'fa';
  const [filterText, setFilterText] = useState('');
  const [starredOpen, setStarredOpen] = useState(true);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);

  const normalizedFilter = filterText.trim().toLowerCase();
  const visibleChannels = channels.filter(
    (c) => !normalizedFilter || c.name.toLowerCase().includes(normalizedFilter)
  );

  const starredChannels = visibleChannels.filter((c) => c.isStarred);
  const standardChannels = visibleChannels.filter((c) => c.type !== 'DM' && c.type !== 'GROUP_DM');
  const groupChannels = visibleChannels.filter((c) => c.type === 'GROUP_DM');
  const dmChannels = visibleChannels.filter((c) => c.type === 'DM');

  const canCreate = canPerformWithMatrix(currentUser, 'channel:create', 'PUBLIC', rbacMatrix);
  const canDeleteChannel = canPerformWithMatrix(currentUser, 'channel:delete', 'PUBLIC', rbacMatrix);
  const canAssignTeamTask = canPerformWithMatrix(currentUser, 'task:assign_team', 'PUBLIC', rbacMatrix);

  const openChannelContext = (e: React.MouseEvent, ch: Channel) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: `#${ch.name}`,
      items: [
        {
          id: 'star',
          icon: Star,
          label: ch.isStarred
            ? isFa
              ? 'حذف از برگزیده‌ها'
              : 'Unstar Channel'
            : isFa
              ? 'افزودن به برگزیده‌ها'
              : 'Star Channel',
          onSelect: async () => {
            await api.starChannel(ch.id, !ch.isStarred);
            qc.invalidateQueries({ queryKey: ['channels'] });
          },
        },
        {
          id: 'add-members',
          icon: UserPlus,
          label: isFa ? 'افزودن / مدیریت اعضا' : 'Add / Manage Members',
          onSelect: () => {
            setActiveChannelId(ch.id);
            setDrawerTab('members');
          },
        },
        {
          id: 'tasks',
          icon: CheckSquare,
          label: isFa ? 'مشاهده تسک‌های کانال' : 'Open Channel Tasks',
          onSelect: () => {
            setActiveChannelId(ch.id);
            setDrawerTab('tasks');
          },
        },
        ...(onStartHuddle
          ? [
              {
                id: 'huddle',
                icon: Headphones,
                label: isFa ? 'شروع جلسه فوری (Huddle)' : 'Start Channel Huddle',
                onSelect: () => {
                  setActiveChannelId(ch.id);
                  onStartHuddle(ch);
                },
              },
            ]
          : []),
        {
          id: 'copy-slug',
          icon: Copy,
          label: isFa ? 'کپی شناسه کانال' : 'Copy #channel-name',
          onSelect: () => {
            navigator.clipboard?.writeText(`#${ch.name}`).catch(() => {});
            showToast(isFa ? `شناسه #${ch.name} کپی شد` : `Copied #${ch.name}`);
          },
        },
        ...(canDeleteChannel
          ? [
              {
                id: 'archive-ch',
                icon: Archive,
                label: isFa ? 'بایگانی کانال' : 'Archive Channel',
                danger: true,
                dividerAbove: true,
                onSelect: async () => {
                  try {
                    await api.archiveChannel(ch.id);
                    qc.invalidateQueries({ queryKey: ['channels'] });
                    qc.invalidateQueries({ queryKey: ['archive'] });
                    showToast(isFa ? `کانال #${ch.name} بایگانی شد` : `Archived #${ch.name}`);
                  } catch (err) {
                    showToast((err as Error).message, 'error');
                  }
                },
              },
            ]
          : []),
      ],
    });
  };

  const openDmContext = (e: React.MouseEvent, ch: Channel) => {
    e.preventDefault();
    const peer = ch.dmPeerUser;
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: peer?.displayName || ch.name,
      items: [
        {
          id: 'open-dm',
          icon: MessageSquare,
          label: isFa ? 'باز کردن گفتگو' : 'Open Conversation',
          onSelect: () => setActiveChannelId(ch.id),
        },
        ...(peer && canAssignTeamTask
          ? [
              {
                id: 'assign-task',
                icon: CheckSquare,
                label: isFa ? `تعریف تسک برای ${peer.displayName}` : `Assign Task to ${peer.displayName}`,
                onSelect: () => {
                  setPrefilledTaskAssigneeId(peer.id);
                  setRailTab('tasks');
                },
              },
            ]
          : []),
        ...(onStartHuddle
          ? [
              {
                id: 'dm-huddle',
                icon: Headphones,
                label: isFa ? 'تماس صوتی / تصویری' : 'Start 1:1 Huddle',
                onSelect: () => {
                  setActiveChannelId(ch.id);
                  onStartHuddle(ch);
                },
              },
            ]
          : []),
      ],
    });
  };

  const renderChannelIcon = (ch: Channel, active = false) => {
    if (ch.type === 'GROUP_DM') {
      return <Users className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-red-500 dark:text-red-400'}`} />;
    }
    if (ch.type === 'ANNOUNCEMENT') {
      return (
        <Megaphone
          className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-red-500 dark:text-red-400'}`}
        />
      );
    }
    if (ch.type === 'PRIVATE') {
      return <Lock className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-neutral-400'}`} />;
    }
    return <Hash className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-neutral-400'}`} />;
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const isRtl = document.documentElement.dir === 'rtl';

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setSidebarWidth(isRtl ? startWidth - delta : startWidth + delta);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <aside
      style={{ width: sidebarWidth }}
      className="relative hidden md:flex flex-col shrink-0 h-full bg-white dark:bg-neutral-900/95 ios-glass border-e border-neutral-200/80 dark:border-neutral-800 select-none"
    >
      {/* Workspace Header */}
      <div className="h-14 px-3.5 flex items-center justify-between gap-2 border-b border-neutral-200/80 dark:border-neutral-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-800 border border-red-100 dark:border-red-900/40 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
            {workspace?.logoUrl ? (
              <img src={workspace.logoUrl} alt={workspace.name} className="w-full h-full object-contain" />
            ) : workspace?.id === 'ws_acme' || !workspace ? (
              <img src="/assets/esfahan-chalak-logo.png" alt="اصفهان چالاک" className="w-full h-full object-contain" />
            ) : (
              <span className="w-full h-full rounded bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                {workspace.logoText}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h2
              data-testid="sidebar-workspace-name"
              className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate"
            >
              {workspace?.name || (isFa ? 'شرکت اصفهان چالاک' : 'Esfahan Chalak Co.')}
            </h2>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              {workspace?.domain || 'esfahan-chalak.ir'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {workspace && onEditWorkspace && (currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'DEPT_MANAGER') && (
            <button
              type="button"
              onClick={() => onEditWorkspace(workspace)}
              aria-label={isFa ? 'ویرایش نام و لوگوی شرکت' : 'Edit workspace branding'}
              {...tipProps('ویرایش نام و لوگوی شرکت', 'Edit Company Name & Logo')}
              className="w-7 h-7 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-300 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              data-testid="sidebar-create-channel-btn"
              onClick={() => setCreateChannelOpen(true, 'channel')}
              aria-label={isFa ? 'ایجاد کانال یا گروه جدید' : 'Create new channel or group'}
              {...tipProps('ایجاد کانال یا گروه کاری جدید', 'Create New Channel or Work Group')}
              className="w-7 h-7 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Channel Filter */}
      <div className="p-3 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={isFa ? 'فیلتر کانال‌ها و گفتگوها...' : 'Filter channels & DMs'}
            aria-label="Filter channels and direct messages"
            className="w-full ps-8 pe-3 py-1.5 text-xs rounded-lg bg-neutral-100/80 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 border border-transparent focus:border-red-500 focus:bg-white dark:focus:bg-neutral-900 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Scrollable Navigation Tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
        {/* Starred Channels */}
        {starredChannels.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setStarredOpen((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              {starredOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Star className="w-3 h-3 text-red-500" />
              <span>{isFa ? 'برگزیده‌ها' : 'Starred'}</span>
            </button>
            {starredOpen && (
              <div className="mt-0.5 space-y-0.5">
                {starredChannels.map((ch) => {
                  const active = ch.id === activeChannelId;
                  return (
                    <button
                      key={`star-${ch.id}`}
                      type="button"
                      onClick={() => setActiveChannelId(ch.id)}
                      onContextMenu={(e) => openChannelContext(e, ch)}
                      className={`relative w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
                        active
                          ? 'ios-glass-selected font-semibold'
                          : 'text-neutral-700 dark:text-neutral-300 hover:bg-red-50/70 dark:hover:bg-neutral-800/70'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0 truncate">
                        {renderChannelIcon(ch, active)}
                        <span className="truncate">{ch.name}</span>
                      </span>
                      {ch.unreadCount > 0 && !active && (
                        <span className="text-[11px] font-mono font-semibold text-red-600 dark:text-red-400 tabular-nums">
                          {ch.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Channels */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <button
              type="button"
              onClick={() => setChannelsOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              {channelsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>{isFa ? 'کانال‌های سازمانی' : 'Channels'}</span>
            </button>
            {canCreate && (
              <button
                type="button"
                onClick={() => setCreateChannelOpen(true, 'channel')}
                aria-label="Add channel"
                {...tipProps('ایجاد کانال سازمانی جدید', 'Create Organizational Channel')}
                className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {channelsOpen && (
            <div className="mt-0.5 space-y-0.5">
              {standardChannels.map((ch) => {
                const active = ch.id === activeChannelId;
                const liveHuddle = huddlesSnapshot[ch.id];
                return (
                  <button
                    key={ch.id}
                    type="button"
                    data-testid={`sidebar-channel-${ch.id}`}
                    onClick={() => setActiveChannelId(ch.id)}
                    onContextMenu={(e) => openChannelContext(e, ch)}
                    className={`relative w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
                      active
                        ? 'text-white font-semibold'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-red-50/70 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-item"
                        transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                        className="absolute inset-0 rounded-xl ios-glass-selected"
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2 min-w-0 truncate">
                      {renderChannelIcon(ch, active)}
                      <span className="truncate">{ch.name}</span>
                    </span>
                    <span className="relative z-10 flex items-center gap-1.5 shrink-0">
                      {liveHuddle && (
                        <Headphones
                          className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`}
                          aria-label="Active huddle"
                        />
                      )}
                      {ch.unreadCount > 0 && !active && (
                        <span className="text-[11px] font-mono font-semibold text-red-600 dark:text-red-400 tabular-nums">
                          {ch.unreadCount}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Work Groups (GROUP_DM) */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <button
              type="button"
              onClick={() => setGroupsOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              {groupsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>{isFa ? 'گروه‌های کاری' : 'Work Groups'}</span>
            </button>
            <button
              type="button"
              data-testid="sidebar-create-group-btn"
              onClick={() => setCreateChannelOpen(true, 'group')}
              aria-label={isFa ? 'ایجاد گروه کاری جدید' : 'Create work group'}
              {...tipProps('ایجاد گروه جدید و افزودن اعضا (مستقیم یا درخواستی)', 'Create New Group & Invite Members')}
              className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {groupsOpen && (
            <div className="mt-0.5 space-y-0.5">
              {groupChannels.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setCreateChannelOpen(true, 'group')}
                  className="w-full px-2.5 py-1.5 rounded-xl text-[11px] text-neutral-400 hover:text-red-600 hover:bg-red-50/60 dark:hover:bg-neutral-800/60 text-start flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isFa ? 'ساخت اولین گروه تیمی...' : 'Create first work group...'}</span>
                </button>
              ) : (
                groupChannels.map((ch) => {
                  const active = ch.id === activeChannelId;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      data-testid={`sidebar-channel-${ch.id}`}
                      onClick={() => setActiveChannelId(ch.id)}
                      onContextMenu={(e) => openChannelContext(e, ch)}
                      className={`relative w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
                        active
                          ? 'text-white font-semibold'
                          : 'text-neutral-700 dark:text-neutral-300 hover:bg-red-50/70 dark:hover:bg-neutral-800/70'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active-item"
                          transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                          className="absolute inset-0 rounded-xl ios-glass-selected"
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2 min-w-0 truncate">
                        {renderChannelIcon(ch, active)}
                        <span className="truncate">{ch.name}</span>
                      </span>
                      <span className="relative z-10 text-[10px] font-mono opacity-80 tabular-nums shrink-0">
                        {ch.memberCount}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Direct Messages */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <button
              type="button"
              onClick={() => setDmsOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              {dmsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>{isFa ? 'پیام‌های مستقیم' : 'Direct Messages'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDmPickerOpen((v) => !v)}
              aria-label="Start direct message"
              {...tipProps('شروع گفتگوی مستقیم ۱ به ۱', 'Start 1:1 Direct Message')}
              className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {dmPickerOpen && (
            <div className="mx-1 mb-2 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 space-y-1">
              <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 px-1">
                {isFa ? 'شروع گفتگوی مستقیم' : 'Start 1:1 conversation'}
              </div>
              {directoryUsers
                .filter((u) => u.id !== currentUser?.id)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      onOpenDm(u.id);
                      setDmPickerOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-1.5 py-1 rounded text-xs text-neutral-700 dark:text-neutral-200 hover:bg-red-50 dark:hover:bg-neutral-700"
                  >
                    <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} presence={u.presence} size="xs" showPresence />
                    <span className="truncate">{u.displayName}</span>
                  </button>
                ))}
            </div>
          )}

          {dmsOpen && (
            <div className="mt-0.5 space-y-0.5">
              {dmChannels.map((ch) => {
                const active = ch.id === activeChannelId;
                const peer = ch.dmPeerUser;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setActiveChannelId(ch.id)}
                    onContextMenu={(e) => openDmContext(e, ch)}
                    className={`relative w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
                      active
                        ? 'text-white font-semibold'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-red-50/70 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-item"
                        transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                        className="absolute inset-0 rounded-xl ios-glass-selected"
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2 min-w-0 truncate">
                      <UserAvatar
                        name={peer?.displayName || ch.name}
                        avatarUrl={peer?.avatarUrl}
                        presence={peer?.presence}
                        size="xs"
                        showPresence
                      />
                      <span className="truncate">{peer?.displayName || ch.name}</span>
                    </span>
                    {ch.unreadCount > 0 && !active && (
                      <span className="relative z-10 text-[11px] font-mono font-semibold text-red-600 dark:text-red-400 tabular-nums">
                        {ch.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Active Huddle Dock at Bottom of Sidebar */}
      {activeHuddleChannelId && (
        <div className="m-2.5 p-3 rounded-xl bg-neutral-900 dark:bg-neutral-800 text-white border border-red-900/50 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{huddleTopic}</div>
                <div className="text-[11px] text-neutral-300 tabular-nums">
                  {huddleParticipants.length} {isFa ? 'نفر در جلسه' : 'in huddle'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setHuddleState({ huddleMinimized: false })}
                aria-label="Expand huddle stage"
                className="p-1.5 rounded-lg bg-neutral-800 dark:bg-neutral-700 hover:bg-neutral-700 text-neutral-200"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onLeaveHuddle}
                aria-label="Leave huddle"
                className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag Handle for Resizable Sidebar */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startResize}
        className="absolute top-0 end-0 w-1 h-full cursor-col-resize hover:bg-red-500/40 transition-colors"
      />
    </aside>
  );
}
