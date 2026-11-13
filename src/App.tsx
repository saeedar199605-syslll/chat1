import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CheckSquare,
  ClipboardCheck,
  Keyboard,
  Languages,
  Megaphone,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { api, type ApiError } from './lib/api';
import { getSharedSocket, useSocket } from './hooks/useSocket';
import { useWebRTC } from './hooks/useWebRTC';
import { useAppStore } from './store/useAppStore';
import { LoginPage } from './components/LoginPage';
import { SlimRail } from './components/SlimRail';
import { ContextSidebar } from './components/ContextSidebar';
import { ChannelHeader } from './components/ChannelHeader';
import { MessageFeed } from './components/MessageFeed';
import { MessageComposer } from './components/MessageComposer';
import { ContextMenu } from './components/ContextMenu';
import { IosNotificationCenter } from './components/IosNotificationCenter';
import { GlobalGlassTooltipLayer } from './components/GlassTooltip';
import type { Message, TaskStatus, Workspace } from './types/index';
import { lazyNamed } from './lib/lazyNamed';

const RightDrawer = lazyNamed(() => import('./components/RightDrawer'), 'RightDrawer', { defer: true });
const HuddleOverlay = lazyNamed(() => import('./components/HuddleOverlay'), 'HuddleOverlay', { defer: true });
const OrgDirectoryView = lazyNamed(() => import('./components/OrgDirectoryView'), 'OrgDirectoryView');
const FilesHubView = lazyNamed(() => import('./components/FilesHubView'), 'FilesHubView');
const ActivityView = lazyNamed(() => import('./components/ActivityView'), 'ActivityView');
const ArchiveView = lazyNamed(() => import('./components/ArchiveView'), 'ArchiveView');
const BackupView = lazyNamed(() => import('./components/BackupView'), 'BackupView');
const TasksHubView = lazyNamed(() => import('./components/TasksHubView'), 'TasksHubView');
const UsersAccessView = lazyNamed(() => import('./components/UsersAccessView'), 'UsersAccessView');
const WorkflowsView = lazyNamed(() => import('./components/WorkflowsView'), 'WorkflowsView');
const SuperAdminView = lazyNamed(() => import('./components/SuperAdminView'), 'SuperAdminView');
const FilePreviewModal = lazyNamed(() => import('./components/FilePreviewModal'), 'FilePreviewModal', { defer: true });
const GlobalSearchModal = lazyNamed(() => import('./components/GlobalSearchModal'), 'GlobalSearchModal', { defer: true });
const CreateChannelModal = lazyNamed(() => import('./components/CreateChannelModal'), 'CreateChannelModal', { defer: true });
const AuthAndSettingsModal = lazyNamed(() => import('./components/AuthAndSettingsModal'), 'AuthAndSettingsModal', { defer: true });
const ShortcutsModal = lazyNamed(() => import('./components/ShortcutsModal'), 'ShortcutsModal', { defer: true });
const DailyToolsModal = lazyNamed(() => import('./components/DailyToolsModal'), 'DailyToolsModal', { defer: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // the socket pushes changes; avoid refetch storms (Workers request quotas)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function WorkstreamShell() {
  const accessToken = useAppStore((s) => s.accessToken);
  const currentUser = useAppStore((s) => s.currentUser);
  const setAuth = useAppStore((s) => s.setAuth);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const railTab = useAppStore((s) => s.railTab);
  const setRailTab = useAppStore((s) => s.setRailTab);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const glassMode = useAppStore((s) => s.glassMode);
  const setGlassMode = useAppStore((s) => s.setGlassMode);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const dismissedBroadcastIds = useAppStore((s) => s.dismissedBroadcastIds);
  const dismissBroadcast = useAppStore((s) => s.dismissBroadcast);
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const setRbacMatrix = useAppStore((s) => s.setRbacMatrix);
  const toastMessage = useAppStore((s) => s.toastMessage);
  const showToast = useAppStore((s) => s.showToast);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [wsNameDraft, setWsNameDraft] = useState('');
  const [wsDomainDraft, setWsDomainDraft] = useState('');
  const [wsLogoTextDraft, setWsLogoTextDraft] = useState('');
  const [wsLogoUrlDraft, setWsLogoUrlDraft] = useState('');
  const [wsUploading, setWsUploading] = useState(false);
  const [wsSaving, setWsSaving] = useState(false);
  const qc = useQueryClient();

  const isFa = locale === 'fa';

  // Sync theme, glass-enabled, and RTL direction on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    if (glassMode) root.classList.add('glass-enabled');
    else root.classList.remove('glass-enabled');
    root.dir = locale === 'fa' ? 'rtl' : 'ltr';
    root.lang = locale;
  }, [theme, locale, glassMode]);

  const [meTry, setMeTry] = useState(0);
  // Verify persisted session token, or auto-login only when ?autostart=1 is explicitly provided
  useEffect(() => {
    const autoStart = typeof window !== 'undefined' && window.location.search.includes('autostart=1');
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    if (accessToken && !currentUser) {
      api
        .me()
        .then((res) => setCurrentUser(res.user))
        .catch((err) => {
          // Only a rejected session logs out; a network/server hiccup keeps the token for the next try.
          if ((err as ApiError).status !== 401) {
            retryTimer = setTimeout(() => setMeTry((n) => n + 1), 3000);
            return;
          }
          if (autoStart) {
            api.demoSwitch('usr_elena').then((res) => setAuth(res.accessToken, res.refreshToken, res.user));
          } else {
            clearAuth();
          }
        });
    } else if (!accessToken && autoStart) {
      api.demoSwitch('usr_elena').then((res) => setAuth(res.accessToken, res.refreshToken, res.user));
    }
    return () => clearTimeout(retryTimer);
  }, [accessToken, currentUser, setAuth, clearAuth, setCurrentUser, meTry]);

  // Global keyboard shortcuts: Ctrl/Cmd+K for search, ? for cheat sheet
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isTyping && (e.key === '?' || e.key === '؟')) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen, setShortcutsOpen]);

  // Initialize real-time Socket.io + WebRTC hooks
  useSocket();
  const webrtc = useWebRTC();

  const rbacQuery = useQuery({
    queryKey: ['rbac-matrix'],
    queryFn: api.getRbacMatrix,
    enabled: Boolean(accessToken),
  });

  useEffect(() => {
    if (rbacQuery.data?.matrix) {
      setRbacMatrix(rbacQuery.data.matrix);
    }
  }, [rbacQuery.data, setRbacMatrix]);

  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.getWorkspaces,
    enabled: Boolean(accessToken),
  });

  const channelsQuery = useQuery({
    queryKey: ['channels', activeWorkspaceId],
    queryFn: () => api.getChannels(activeWorkspaceId),
    enabled: Boolean(accessToken && activeWorkspaceId),
  });

  const directoryQuery = useQuery({
    queryKey: ['directory'],
    queryFn: api.getDirectory,
    enabled: Boolean(accessToken),
  });

  const emojisQuery = useQuery({
    queryKey: ['custom-emojis', activeWorkspaceId],
    queryFn: () => api.getCustomEmojis(activeWorkspaceId),
    enabled: Boolean(accessToken && activeWorkspaceId),
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: api.getNotifications,
    enabled: Boolean(accessToken),
  });

  const broadcastsQuery = useQuery({
    queryKey: ['broadcasts'],
    queryFn: api.getActiveBroadcasts,
    enabled: Boolean(accessToken),
  });

  const workspaces = workspacesQuery.data?.workspaces || [];
  const channels = channelsQuery.data?.channels || [];
  const directoryUsers = directoryQuery.data?.users || [];
  const customEmojis = emojisQuery.data?.emojis || [];
  const notifications = notificationsQuery.data?.notifications || [];
  const activeBroadcasts = (broadcastsQuery.data?.broadcasts || []).filter(
    (b) => !dismissedBroadcastIds.includes(b.id)
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0];

  // The persisted/default workspace may not exist (or be accessible) on this server: fall back to the first one.
  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.some((w) => w.id === activeWorkspaceId)) {
      useAppStore.getState().setActiveWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, activeWorkspaceId]);

  useEffect(() => {
    if (channels.length > 0 && !channels.some((c) => c.id === activeChannelId)) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId, setActiveChannelId]);

  const messagesQuery = useQuery({
    queryKey: ['messages', activeChannel?.id],
    queryFn: () => api.getMessages(activeChannel!.id),
    enabled: Boolean(accessToken && activeChannel?.id),
  });

  useEffect(() => {
    if (activeChannel?.id && accessToken) {
      api.markChannelRead(activeChannel.id).catch(() => {});
    }
  }, [activeChannel?.id, accessToken]);

  const messages = messagesQuery.data?.messages || [];
  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  const handleOpenDm = async (targetUserId: string) => {
    const res = await api.openDm(activeWorkspaceId, targetUserId);
    await qc.invalidateQueries({ queryKey: ['channels', activeWorkspaceId] });
    if (res.channel) {
      setActiveChannelId(res.channel.id);
      setRailTab('chat');
    }
  };

  const handleCreateChannel = async (payload: {
    name: string;
    description: string;
    type: 'PUBLIC' | 'PRIVATE' | 'ANNOUNCEMENT';
  }) => {
    const res = await api.createChannel(activeWorkspaceId, payload);
    await qc.invalidateQueries({ queryKey: ['channels', activeWorkspaceId] });
    if (res.channel) setActiveChannelId(res.channel.id);
    showToast(isFa ? `کانال #${payload.name} ایجاد شد` : `Created #${payload.name}`);
  };

  const handleCreateGroup = async (payload: {
    name: string;
    description: string;
    memberIds: string[];
  }) => {
    const res = await api.createGroup(activeWorkspaceId, payload);
    await qc.invalidateQueries({ queryKey: ['channels', activeWorkspaceId] });
    if (res.channel) setActiveChannelId(res.channel.id);
    const directCount = res.addedUserIds.length;
    const reqCount = res.requestedUserIds.length;
    showToast(
      isFa
        ? `گروه کاری «${res.channel.name}» ساخته شد (${directCount} عضو مستقیم، ${reqCount} درخواست عضویت)`
        : `Created group "${res.channel.name}" (${directCount} added, ${reqCount} invited)`
    );
  };

  const handleCreateWorkspace = async (name: string) => {
    const res = await api.createWorkspace(name);
    await qc.invalidateQueries({ queryKey: ['workspaces'] });
    useAppStore.getState().setActiveWorkspaceId(res.workspace.id);
    showToast(isFa ? `فضای کاری «${res.workspace.name}» ایجاد شد` : `Workspace "${res.workspace.name}" created`);
  };

  const openEditWorkspace = (ws: Workspace) => {
    setEditingWorkspace(ws);
    setWsNameDraft(ws.name);
    setWsDomainDraft(ws.domain || '');
    setWsLogoTextDraft(ws.logoText || '');
    setWsLogoUrlDraft(ws.logoUrl || '');
  };

  const handleSaveWorkspaceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkspace || !wsNameDraft.trim()) return;
    setWsSaving(true);
    try {
      await api.updateWorkspace(editingWorkspace.id, {
        name: wsNameDraft.trim(),
        domain: wsDomainDraft.trim(),
        logoText: wsLogoTextDraft.trim().slice(0, 2) || undefined,
        logoUrl: wsLogoUrlDraft.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      setEditingWorkspace(null);
      showToast(isFa ? 'مشخصات شرکت و لوگو ذخیره شد' : 'Workspace details & logo updated');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setWsSaving(false);
    }
  };

  const handleUploadWorkspaceLogo = async (file: File) => {
    if (!editingWorkspace) return;
    setWsUploading(true);
    try {
      const res = await api.uploadWorkspaceLogo(editingWorkspace.id, file);
      setWsLogoUrlDraft(res.workspace.logoUrl || '');
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      showToast(isFa ? 'تصویر لوگوی شرکت بارگذاری شد' : 'Company logo uploaded');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setWsUploading(false);
    }
  };

  if (!accessToken) {
    return <LoginPage />;
  }

  const handleRootContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: isFa ? 'شرکت اصفهان چالاک' : 'Esfahan Chalak',
      items: [
        {
          id: 'ctx-new-task',
          label: isFa ? 'مدیریت و تعریف وظیفه' : 'Tasks & Assignments',
          shortcut: 'T',
          icon: CheckSquare,
          onSelect: () => setRailTab('tasks'),
        },
        {
          id: 'ctx-tools',
          label: isFa ? 'ابزارهای روزانه و تبدیل PDF' : 'Daily Tools & PDF Studio',
          shortcut: 'P',
          icon: Wrench,
          onSelect: () => useAppStore.getState().setDailyToolsOpen(true, 'pdf'),
        },
        {
          id: 'ctx-workflows',
          label: isFa ? 'تأییدیه‌ها و استندآپ روزانه' : 'Approvals & Standups',
          shortcut: 'W',
          icon: ClipboardCheck,
          onSelect: () => setRailTab('workflows'),
        },
        {
          id: 'ctx-users',
          label: isFa ? 'کاربران و سطح دسترسی (RBAC)' : 'Users & Access Control',
          shortcut: 'U',
          icon: ShieldCheck,
          onSelect: () => setRailTab('users'),
        },
        {
          id: 'ctx-search',
          label: isFa ? 'جستجوی سراسری' : 'Global Search',
          shortcut: 'Ctrl+K',
          icon: Search,
          dividerAbove: true,
          onSelect: () => setSearchOpen(true),
        },
        {
          id: 'ctx-theme',
          label:
            theme === 'dark'
              ? isFa
                ? 'تم سفید و قرمز (روشن)'
                : 'Switch to White & Red Light'
              : isFa
                ? 'تغییر به حالت تیره'
                : 'Switch to Dark Mode',
          icon: theme === 'dark' ? Sun : Moon,
          onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        },
        {
          id: 'ctx-glass',
          label: glassMode
            ? isFa
              ? 'حالت شیشه‌ای iOS (فعال)'
              : 'iOS Liquid Glass (On)'
            : isFa
              ? 'فعال‌سازی حالت شیشه‌ای iOS'
              : 'Enable iOS Liquid Glass',
          icon: Sparkles,
          onSelect: () => setGlassMode(!glassMode),
        },
        {
          id: 'ctx-shortcuts',
          label: isFa ? 'میانبرهای صفحه‌کلید' : 'Keyboard Shortcuts',
          shortcut: '?',
          icon: Keyboard,
          onSelect: () => setShortcutsOpen(true),
        },
        {
          id: 'ctx-locale',
          label: isFa ? 'تغییر زبان به English (LTR)' : 'تغییر زبان به فارسی (RTL)',
          icon: Languages,
          onSelect: () => setLocale(isFa ? 'en' : 'fa'),
        },
      ],
    });
  };

  return (
    <div
      onContextMenu={handleRootContextMenu}
      className="h-screen w-screen overflow-hidden flex ios-mesh-bg bg-neutral-50/70 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
    >
      {/* 1. Far-Left Slim Rail (64px) */}
      <SlimRail
        workspaces={workspaces}
        unreadNotifications={unreadNotifs}
        onCreateWorkspace={handleCreateWorkspace}
        onEditWorkspace={openEditWorkspace}
      />

      {/* 2. Context Sidebar (260px resizable on desktop) */}
      {railTab === 'chat' && (
        <ContextSidebar
          workspace={activeWorkspace}
          channels={channels}
          directoryUsers={directoryUsers}
          onOpenDm={handleOpenDm}
          onLeaveHuddle={webrtc.leaveHuddle}
          onStartHuddle={(ch) => webrtc.startHuddle(ch.id, `#${ch.name} Huddle`)}
          onEditWorkspace={openEditWorkspace}
        />
      )}

      {/* Mobile Sidebar Slide-over */}
      {mobileMenuOpen && railTab === 'chat' && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div className="w-72 h-full bg-white dark:bg-neutral-900 border-e border-neutral-200 dark:border-neutral-800 p-3 overflow-y-auto">
            <div className="font-display font-semibold text-sm px-2 py-2 border-b border-neutral-200 dark:border-neutral-800 mb-2">
              {activeWorkspace?.name}
            </div>
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  setActiveChannelId(ch.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-start px-3 py-2 rounded-lg text-xs transition-colors ${
                  ch.id === activeChannel?.id
                    ? 'ios-glass-selected font-semibold'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {ch.type === 'DM' ? ch.name : `#${ch.name}`}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Close mobile channel list"
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-neutral-950/50"
          />
        </div>
      )}

      {/* 3. Main Fluid Workspace Canvas */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Global Real-time Broadcast Banner */}
        <AnimatePresence>
          {activeBroadcasts.length > 0 && (
            <motion.div
              key={activeBroadcasts[0].id}
              data-testid="global-broadcast-banner"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className={`px-4 py-2 border-b flex items-center justify-between gap-3 text-xs shrink-0 ${
                activeBroadcasts[0].level === 'URGENT'
                  ? 'bg-red-600 text-white border-red-700'
                  : activeBroadcasts[0].level === 'WARN'
                    ? 'bg-amber-500/95 text-white border-amber-600'
                    : 'bg-red-50/95 dark:bg-red-950/60 text-red-900 dark:text-red-100 border-red-200 dark:border-red-900/50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {activeBroadcasts[0].level === 'URGENT' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                ) : (
                  <Megaphone className="w-4 h-4 shrink-0" />
                )}
                <span className="font-semibold shrink-0">{activeBroadcasts[0].title}:</span>
                <span className="truncate">{activeBroadcasts[0].message}</span>
              </div>
              <button
                type="button"
                onClick={() => dismissBroadcast(activeBroadcasts[0].id)}
                aria-label={isFa ? 'بستن اعلان سراسری' : 'Dismiss broadcast'}
                className="p-1 rounded-lg hover:bg-black/10 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {railTab === 'chat' ? (
          <>
            <div className="relative z-30 flex items-center md:block">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open channels menu"
                className="md:hidden ms-3 p-2 rounded-lg text-neutral-600 dark:text-neutral-300"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <ChannelHeader
                  channel={activeChannel}
                  onToggleStar={async () => {
                    if (!activeChannel) return;
                    await api.starChannel(activeChannel.id, !activeChannel.isStarred);
                    qc.invalidateQueries({ queryKey: ['channels', activeWorkspaceId] });
                  }}
                  onUpdateTopic={async (topic) => {
                    if (!activeChannel) return;
                    try {
                      await api.updateChannelTopic(activeChannel.id, topic);
                      qc.invalidateQueries({ queryKey: ['channels', activeWorkspaceId] });
                      showToast(isFa ? 'موضوع کانال به‌روزرسانی شد' : 'Channel topic updated');
                    } catch (err) {
                      showToast((err as Error).message, 'error');
                    }
                  }}
                  onArchiveChannel={async () => {
                    if (!activeChannel) return;
                    try {
                      await api.archiveChannel(activeChannel.id);
                      qc.invalidateQueries({ queryKey: ['channels', activeWorkspaceId] });
                      qc.invalidateQueries({ queryKey: ['archive'] });
                      showToast(isFa ? `کانال #${activeChannel.name} بایگانی شد` : `Archived #${activeChannel.name}`);
                    } catch (err) {
                      showToast((err as Error).message, 'error');
                    }
                  }}
                  onStartHuddle={() => {
                    if (!activeChannel) return;
                    if (useAppStore.getState().activeHuddleChannelId === activeChannel.id) {
                      useAppStore.getState().setHuddleState({ huddleMinimized: false });
                    } else {
                      webrtc.startHuddle(activeChannel.id, `#${activeChannel.name} Huddle`);
                    }
                  }}
                />
              </div>
            </div>

            <MessageFeed
              channel={activeChannel}
              channels={channels}
              messages={messages}
              isLoading={messagesQuery.isLoading}
              onReact={async (messageId, emoji) => {
                await api.toggleReaction(messageId, emoji);
                qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
              }}
              onVotePoll={async (pollId, optionId) => {
                await api.votePoll(pollId, optionId);
                qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
              }}
              onToggleTask={async (taskId, status: TaskStatus) => {
                await api.updateTask(taskId, { status });
                qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
                qc.invalidateQueries({ queryKey: ['tasks', activeChannel?.id] });
                qc.invalidateQueries({ queryKey: ['all-tasks'] });
              }}
              onConvertTask={async (msg: Message) => {
                if (!activeChannel) return;
                await api.createTask(activeChannel.id, {
                  title: msg.content.slice(0, 120),
                  sourceMessageId: msg.id,
                });
                qc.invalidateQueries({ queryKey: ['tasks', activeChannel.id] });
                qc.invalidateQueries({ queryKey: ['all-tasks'] });
                useAppStore.getState().setDrawerTab('tasks');
                showToast(isFa ? 'پیام به وظیفه تبدیل شد' : 'Converted message to action item');
              }}
              onPin={async (messageId) => {
                await api.pinMessage(messageId);
                qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
              }}
              onArchive={async (messageId) => {
                try {
                  await api.archiveMessage(messageId);
                  qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
                  qc.invalidateQueries({ queryKey: ['archive'] });
                  showToast(isFa ? 'پیام به بایگانی منتقل شد' : 'Message moved to Archive');
                } catch (err) {
                  showToast((err as Error).message, 'error');
                }
              }}
              onBookmark={async (messageId) => {
                const res = await api.bookmarkMessage(messageId);
                qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
                qc.invalidateQueries({ queryKey: ['bookmarks'] });
                showToast(
                  res.isBookmarked
                    ? isFa
                      ? 'پیام نشانه‌گذاری شد'
                      : 'Message saved to bookmarks'
                    : isFa
                      ? 'نشانه‌گذاری حذف شد'
                      : 'Bookmark removed'
                );
              }}
              onEdit={async (messageId, content) => {
                await api.editMessage(messageId, content);
                qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
              }}
              onDelete={async (messageId) => {
                await api.deleteMessage(messageId);
                qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
              }}
              onForward={async (messageId, targetChannelId) => {
                await api.forwardMessage(messageId, targetChannelId);
                showToast(isFa ? 'پیام هدایت شد' : 'Message forwarded');
              }}
            />

            <MessageComposer
              channel={activeChannel}
              directoryUsers={directoryUsers}
              customEmojis={customEmojis}
              onSendMessage={async (payload) => {
                if (!activeChannel) return;
                try {
                  await api.postMessage(activeChannel.id, payload);
                  // The socket pushes our own message back; refetch the list only if it is down.
                  if (!getSharedSocket()?.connected) qc.invalidateQueries({ queryKey: ['messages', activeChannel.id] });
                  qc.invalidateQueries({ queryKey: ['tasks', activeChannel.id] });
                } catch (err) {
                  showToast((err as Error).message, 'error');
                }
              }}
              onSlashMeet={(topic) => {
                if (activeChannel) webrtc.startHuddle(activeChannel.id, topic);
              }}
              onSlashStatus={async (emoji, statusText) => {
                const res = await api.updateMyStatus({ customEmoji: emoji, customStatus: statusText });
                setCurrentUser(res.user);
                qc.invalidateQueries({ queryKey: ['directory'] });
                showToast(isFa ? `وضعیت به‌روزرسانی شد: ${emoji} ${statusText}` : `Status updated: ${emoji} ${statusText}`);
              }}
            />
          </>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={railTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
            >
              {railTab === 'directory' && (
                <OrgDirectoryView
                  users={directoryUsers}
                  currentUserId={currentUser?.id}
                  onOpenDm={handleOpenDm}
                />
              )}

              {railTab === 'users' && <UsersAccessView users={directoryUsers} />}

              {railTab === 'workflows' && <WorkflowsView users={directoryUsers} />}

              {railTab === 'files' && (
                <FilesHubView workspaceId={activeWorkspaceId} channels={channels} />
              )}

              {railTab === 'tasks' && (
                <TasksHubView
                  workspaceId={activeWorkspaceId}
                  channels={channels}
                  users={directoryUsers}
                  onJumpToChannel={(chId) => {
                    setActiveChannelId(chId);
                    setRailTab('chat');
                  }}
                />
              )}

              {railTab === 'archive' && (
                <ArchiveView
                  workspaceId={activeWorkspaceId}
                  onJumpToChannel={(chId) => {
                    setActiveChannelId(chId);
                    setRailTab('chat');
                  }}
                />
              )}

              {railTab === 'backup' && <BackupView />}

              {railTab === 'superadmin' && currentUser?.role === 'SUPER_ADMIN' && <SuperAdminView />}

              {(railTab === 'activity' || railTab === 'saved') && (
                <ActivityView
                  mode={railTab}
                  notifications={notifications}
                  onJumpToChannel={(chId) => {
                    setActiveChannelId(chId);
                    setRailTab('chat');
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* 4. Contextual Right Drawer (360px) */}
      {railTab === 'chat' && (
        <RightDrawer
          channel={activeChannel}
          channels={channels}
          messages={messages}
          directoryUsers={directoryUsers}
          onReact={async (messageId, emoji) => {
            await api.toggleReaction(messageId, emoji);
            qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
          }}
          onVotePoll={async (pollId, optionId) => {
            await api.votePoll(pollId, optionId);
            qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
          }}
          onToggleTask={async (taskId, status) => {
            await api.updateTask(taskId, { status });
            qc.invalidateQueries({ queryKey: ['tasks', activeChannel?.id] });
          }}
          onPin={async (messageId) => {
            await api.pinMessage(messageId);
            qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
          }}
          onBookmark={async (messageId) => {
            await api.bookmarkMessage(messageId);
            qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
          }}
          onEdit={async (messageId, content) => {
            await api.editMessage(messageId, content);
            qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
          }}
          onDelete={async (messageId) => {
            await api.deleteMessage(messageId);
            qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });
          }}
          onForward={async (messageId, targetChannelId) => {
            await api.forwardMessage(messageId, targetChannelId);
            showToast(isFa ? 'پیام هدایت شد' : 'Message forwarded');
          }}
          onOpenDm={handleOpenDm}
        />
      )}

      {/* Overlays & Modals */}
      <HuddleOverlay
        localStream={webrtc.localStream}
        screenStream={webrtc.screenStream}
        remoteStreams={webrtc.remoteStreams}
        isMuted={webrtc.isMuted}
        isCameraOn={webrtc.isCameraOn}
        isScreenOn={webrtc.isScreenOn}
        handRaised={webrtc.handRaised}
        noiseSuppression={webrtc.noiseSuppression}
        setNoiseSuppression={webrtc.setNoiseSuppression}
        audioDevices={webrtc.audioDevices}
        videoDevices={webrtc.videoDevices}
        selectedAudioId={webrtc.selectedAudioId}
        setSelectedAudioId={webrtc.setSelectedAudioId}
        selectedVideoId={webrtc.selectedVideoId}
        setSelectedVideoId={webrtc.setSelectedVideoId}
        isRecording={webrtc.isRecording}
        activeSpeakerId={webrtc.activeSpeakerId}
        messages={messages}
        onToggleMute={webrtc.toggleMute}
        onToggleCamera={webrtc.toggleCamera}
        onToggleScreenShare={webrtc.toggleScreenShare}
        onToggleRaiseHand={webrtc.toggleRaiseHand}
        onToggleRecording={webrtc.toggleRecording}
        onLeaveHuddle={webrtc.leaveHuddle}
        onSendInCallChat={async (txt) => {
          const chId = useAppStore.getState().activeHuddleChannelId;
          if (!chId) return;
          await api.postMessage(chId, { content: txt });
          qc.invalidateQueries({ queryKey: ['messages', chId] });
        }}
      />

      <FilePreviewModal />
      <GlobalSearchModal
        workspaceId={activeWorkspaceId}
        onJumpToChannel={(chId) => {
          setActiveChannelId(chId);
          setRailTab('chat');
        }}
        onOpenDm={handleOpenDm}
      />
      <CreateChannelModal
        directoryUsers={directoryUsers}
        onCreate={handleCreateChannel}
        onCreateGroup={handleCreateGroup}
      />
      <AuthAndSettingsModal directoryUsers={directoryUsers} workspaceId={activeWorkspaceId} />
      <DailyToolsModal
        workspaceId={activeWorkspaceId}
        activeChannel={activeChannel}
        onSendToChat={async (payload) => {
          if (!activeChannel) return;
          await api.postMessage(activeChannel.id, payload);
          qc.invalidateQueries({ queryKey: ['messages', activeChannel.id] });
        }}
      />
      <ShortcutsModal />
      <ContextMenu />
      <GlobalGlassTooltipLayer />

      {/* Edit Workspace Name & Logo Modal */}
      <AnimatePresence>
        {editingWorkspace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 backdrop-blur-sm p-4">
            <motion.form
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onSubmit={handleSaveWorkspaceEdit}
              className="w-full max-w-md rounded-2xl ios-glass-strong bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  {isFa ? 'ویرایش نام و لوگوی شرکت' : 'Edit Workspace Name & Logo'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingWorkspace(null)}
                  className="p-1 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700">
                {wsLogoUrlDraft ? (
                  <img
                    src={wsLogoUrlDraft}
                    alt={wsNameDraft}
                    className="w-12 h-12 rounded-xl object-contain bg-white border border-neutral-200 p-1 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-red-600 text-white font-display font-bold flex items-center justify-center shrink-0">
                    {wsLogoTextDraft || wsNameDraft.slice(0, 2) || 'EC'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{wsUploading ? (isFa ? 'در حال آپلود...' : 'Uploading...') : isFa ? 'بارگذاری لوگو (PNG/JPG)' : 'Upload Logo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadWorkspaceLogo(f);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  {isFa ? 'نام شرکت / فضای کاری' : 'Company / Workspace Name'}
                </label>
                <input
                  type="text"
                  required
                  data-testid="edit-ws-name-input"
                  value={wsNameDraft}
                  onChange={(e) => setWsNameDraft(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    {isFa ? 'دامنه' : 'Domain'}
                  </label>
                  <input
                    type="text"
                    value={wsDomainDraft}
                    onChange={(e) => setWsDomainDraft(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    {isFa ? 'متن کوتاه لوگو (۲ حرف)' : 'Logo Monogram (2 chars)'}
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={wsLogoTextDraft}
                    onChange={(e) => setWsLogoTextDraft(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-neutral-900 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  {isFa ? 'آدرس تصویر لوگو (URL اختیاری)' : 'Logo URL (optional)'}
                </label>
                <input
                  type="text"
                  data-testid="edit-ws-logo-url-input"
                  value={wsLogoUrlDraft}
                  onChange={(e) => setWsLogoUrlDraft(e.target.value)}
                  placeholder="/assets/esfahan-chalak-logo.png"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingWorkspace(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  data-testid="save-ws-edit-btn"
                  disabled={wsSaving}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {wsSaving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره تغییرات' : 'Save Changes'}
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* iOS-Style Floating Popup Notification Banners */}
      <IosNotificationCenter
        onNavigateToChannel={(chId) => {
          setActiveChannelId(chId);
          setRailTab('chat');
        }}
      />

      {/* Transient Toast Banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key={toastMessage.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            role="status"
            className={`fixed bottom-5 start-20 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium border ${
              toastMessage.tone === 'error'
                ? 'bg-red-700 text-white border-red-500'
                : 'bg-red-600 dark:bg-red-700 text-white border-red-500'
            }`}
          >
            {toastMessage.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkstreamShell />
    </QueryClientProvider>
  );
}
