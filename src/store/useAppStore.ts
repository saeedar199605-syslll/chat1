import { create } from 'zustand';
import type { LucideIcon } from 'lucide-react';
import {
  shouldShowIosPopup,
  type ChatBgPatternId,
  type ChatBgPresetId,
  type RolePermissionMatrix,
} from '../utils/chatLogic';
import type {
  AnnotationStroke,
  Attachment,
  HuddleParticipant,
  IosPopupNotification,
  PresenceStatus,
  User,
} from '../types/index';

export type RailTab =
  | 'chat'
  | 'activity'
  | 'tasks'
  | 'workflows'
  | 'directory'
  | 'users'
  | 'files'
  | 'saved'
  | 'archive'
  | 'backup'
  | 'superadmin';
export type DrawerTab = 'none' | 'thread' | 'files' | 'wiki' | 'tasks' | 'members' | 'pinned';
export type ThemeMode = 'light' | 'dark';
export type LocaleMode = 'en' | 'fa';

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: LucideIcon;
  danger?: boolean;
  dividerAbove?: boolean;
  onSelect: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
}

interface TypingUser {
  userId: string;
  displayName: string;
}

interface WikiCursor {
  userId: string;
  displayName: string;
  offset: number;
  updatedAt: number;
}

interface AppState {
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: User | null;
  activeWorkspaceId: string;
  activeChannelId: string;
  railTab: RailTab;
  drawerTab: DrawerTab;
  activeThreadMessageId: string | null;
  theme: ThemeMode;
  locale: LocaleMode;
  glassMode: boolean;
  sidebarWidth: number;
  searchOpen: boolean;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  createChannelOpen: boolean;
  previewFile: Attachment | null;
  typingByChannel: Record<string, TypingUser[]>;
  wikiCursorsByChannel: Record<string, Record<string, WikiCursor>>;
  activeHuddleChannelId: string | null;
  huddleTopic: string;
  huddleMinimized: boolean;
  huddleParticipants: HuddleParticipant[];
  huddleIsRecording: boolean;
  huddleAnnotations: AnnotationStroke[];
  huddlesSnapshot: Record<string, { participantCount: number; topic: string; participants: HuddleParticipant[] }>;
  socketConnected: boolean;
  toastMessage: { id: number; text: string; tone: 'info' | 'error' } | null;
  iosPopups: IosPopupNotification[];
  contextMenu: ContextMenuState | null;
  rbacMatrix: Partial<RolePermissionMatrix> | null;
  composerQuoteDraft: string | null;
  prefilledTaskAssigneeId: string | null;
  dismissedBroadcastIds: string[];
  dailyToolsOpen: boolean;
  dailyToolsTab: 'pdf' | 'jalali' | 'calc' | 'qr' | 'notes';
  dailyToolsPdfAttachment: Attachment | null;
  createChannelInitialMode: 'channel' | 'group';
  calendarSystem: 'jalali' | 'gregorian';
  chatBgPreset: ChatBgPresetId;
  chatBgCustomColor: string;
  chatBgPattern: ChatBgPatternId;
  chatBgOpacity: number;
  notifSoundEnabled: boolean;

  setAuth: (accessToken: string, refreshToken: string, user: User) => void;
  setCurrentUser: (user: User) => void;
  clearAuth: () => void;
  setActiveWorkspaceId: (id: string) => void;
  setActiveChannelId: (id: string) => void;
  setRailTab: (tab: RailTab) => void;
  openThread: (messageId: string) => void;
  setDrawerTab: (tab: DrawerTab) => void;
  setTheme: (theme: ThemeMode) => void;
  setLocale: (locale: LocaleMode) => void;
  setGlassMode: (enabled: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSearchOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setCreateChannelOpen: (open: boolean, mode?: 'channel' | 'group') => void;
  setPreviewFile: (file: Attachment | null) => void;
  setTypingUsers: (channelId: string, users: TypingUser[]) => void;
  setWikiCursor: (channelId: string, cursor: WikiCursor) => void;
  setHuddleState: (patch: Partial<{
    activeHuddleChannelId: string | null;
    huddleTopic: string;
    huddleMinimized: boolean;
    huddleParticipants: HuddleParticipant[];
    huddleIsRecording: boolean;
    huddleAnnotations: AnnotationStroke[];
  }>) => void;
  addHuddleAnnotation: (stroke: AnnotationStroke) => void;
  setHuddlesSnapshot: (snapshot: Record<string, { participantCount: number; topic: string; participants: HuddleParticipant[] }>) => void;
  setSocketConnected: (connected: boolean) => void;
  showToast: (text: string, tone?: 'info' | 'error') => void;
  pushIosPopup: (popup: IosPopupNotification, force?: boolean) => void;
  dismissIosPopup: (id: string) => void;
  updatePresenceLocal: (presence: PresenceStatus) => void;
  openContextMenu: (menu: ContextMenuState) => void;
  closeContextMenu: () => void;
  setRbacMatrix: (matrix: Partial<RolePermissionMatrix>) => void;
  setComposerQuoteDraft: (text: string | null) => void;
  setPrefilledTaskAssigneeId: (userId: string | null) => void;
  dismissBroadcast: (id: string) => void;
  setDailyToolsOpen: (open: boolean, tab?: 'pdf' | 'jalali' | 'calc' | 'qr' | 'notes') => void;
  openPdfStudio: (att: Attachment | null) => void;
  setCalendarSystem: (cal: 'jalali' | 'gregorian') => void;
  setChatBgPreset: (preset: ChatBgPresetId) => void;
  setChatBgCustomColor: (color: string) => void;
  setChatBgPattern: (pattern: ChatBgPatternId) => void;
  setChatBgOpacity: (opacity: number) => void;
  setNotifSoundEnabled: (enabled: boolean) => void;
}

const storedTheme = (typeof window !== 'undefined' && (localStorage.getItem('ws_theme') as ThemeMode)) || 'light';
const storedLocale = (typeof window !== 'undefined' && (localStorage.getItem('ws_locale') as LocaleMode)) || 'fa';
const storedGlass =
  typeof window !== 'undefined' ? localStorage.getItem('ws_glass') !== 'false' : true;
const storedCalendar =
  (typeof window !== 'undefined' && (localStorage.getItem('ws_calendar') as 'jalali' | 'gregorian')) || 'jalali';
const storedBgPreset =
  (typeof window !== 'undefined' && (localStorage.getItem('ws_chat_bg_preset') as ChatBgPresetId)) || 'default';
const storedBgColor =
  (typeof window !== 'undefined' && localStorage.getItem('ws_chat_bg_color')) || '#ffe4e6';
const storedBgPattern =
  (typeof window !== 'undefined' && (localStorage.getItem('ws_chat_bg_pattern') as ChatBgPatternId)) || 'none';
const storedBgOpacity =
  typeof window !== 'undefined' ? Number(localStorage.getItem('ws_chat_bg_opacity') || '0.88') : 0.88;
const storedNotifSound =
  typeof window !== 'undefined' ? localStorage.getItem('ws_notif_sound') !== 'false' : true;

const stored = (k: string): string => {
  try {
    return (typeof window !== 'undefined' && localStorage.getItem(k)) || '';
  } catch {
    return '';
  }
};
const remember = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: just don't persist */
  }
};

export const useAppStore = create<AppState>((set, get) => ({
  accessToken: typeof window !== 'undefined' ? localStorage.getItem('ws_access_token') : null,
  refreshToken: typeof window !== 'undefined' ? localStorage.getItem('ws_refresh_token') : null,
  currentUser: null,
  // Remembered so a reload can fetch channels/messages in parallel with the workspace list.
  activeWorkspaceId: stored('ws_active_workspace'),
  activeChannelId: stored('ws_active_channel'),
  railTab: 'chat',
  drawerTab: 'none',
  activeThreadMessageId: null,
  theme: storedTheme,
  locale: storedLocale,
  glassMode: storedGlass,
  sidebarWidth: 264,
  searchOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  createChannelOpen: false,
  previewFile: null,
  typingByChannel: {},
  wikiCursorsByChannel: {},
  activeHuddleChannelId: null,
  huddleTopic: 'Instant Huddle',
  huddleMinimized: false,
  huddleParticipants: [],
  huddleIsRecording: false,
  huddleAnnotations: [],
  huddlesSnapshot: {},
  socketConnected: false,
  toastMessage: null,
  iosPopups: [],
  contextMenu: null,
  rbacMatrix: null,
  composerQuoteDraft: null,
  prefilledTaskAssigneeId: null,
  dismissedBroadcastIds: [],
  dailyToolsOpen: false,
  dailyToolsTab: 'pdf',
  dailyToolsPdfAttachment: null,
  createChannelInitialMode: 'channel',
  calendarSystem: storedCalendar,
  chatBgPreset: storedBgPreset,
  chatBgCustomColor: storedBgColor,
  chatBgPattern: storedBgPattern,
  chatBgOpacity: Number.isFinite(storedBgOpacity) ? storedBgOpacity : 0.88,
  notifSoundEnabled: storedNotifSound,

  setAuth: (accessToken, refreshToken, user) => {
    localStorage.setItem('ws_access_token', accessToken);
    localStorage.setItem('ws_refresh_token', refreshToken);
    set({ accessToken, refreshToken, currentUser: user });
  },
  setCurrentUser: (user) => set({ currentUser: user }),
  clearAuth: () => {
    localStorage.removeItem('ws_access_token');
    localStorage.removeItem('ws_refresh_token');
    localStorage.removeItem('ws_active_workspace');
    localStorage.removeItem('ws_active_channel');
    set({ accessToken: null, refreshToken: null, currentUser: null, railTab: 'chat', activeWorkspaceId: '', activeChannelId: '' });
  },
  setActiveWorkspaceId: (activeWorkspaceId) => {
    remember('ws_active_workspace', activeWorkspaceId);
    set({ activeWorkspaceId });
  },
  setActiveChannelId: (activeChannelId) => {
    remember('ws_active_channel', activeChannelId);
    set({ activeChannelId, railTab: 'chat' });
  },
  setRailTab: (railTab) => set({ railTab }),
  openThread: (messageId) => set({ activeThreadMessageId: messageId, drawerTab: 'thread' }),
  setDrawerTab: (drawerTab) => set({ drawerTab }),
  setTheme: (theme) => {
    localStorage.setItem('ws_theme', theme);
    set({ theme });
  },
  setLocale: (locale) => {
    localStorage.setItem('ws_locale', locale);
    set({ locale });
  },
  setGlassMode: (glassMode) => {
    localStorage.setItem('ws_glass', glassMode ? 'true' : 'false');
    set({ glassMode });
  },
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: Math.max(220, Math.min(360, sidebarWidth)) }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setCreateChannelOpen: (createChannelOpen, mode) =>
    set((s) => ({
      createChannelOpen,
      createChannelInitialMode: mode ?? s.createChannelInitialMode,
    })),
  setPreviewFile: (previewFile) => set({ previewFile }),
  setTypingUsers: (channelId, users) =>
    set((s) => ({ typingByChannel: { ...s.typingByChannel, [channelId]: users } })),
  setWikiCursor: (channelId, cursor) =>
    set((s) => ({
      wikiCursorsByChannel: {
        ...s.wikiCursorsByChannel,
        [channelId]: { ...(s.wikiCursorsByChannel[channelId] || {}), [cursor.userId]: cursor },
      },
    })),
  setHuddleState: (patch) => set((s) => ({ ...s, ...patch })),
  addHuddleAnnotation: (stroke) =>
    set((s) => ({
      huddleAnnotations: stroke.isLaser
        ? s.huddleAnnotations
        : [...s.huddleAnnotations.slice(-90), stroke],
    })),
  setHuddlesSnapshot: (huddlesSnapshot) => set({ huddlesSnapshot }),
  setSocketConnected: (socketConnected) => set({ socketConnected }),
  showToast: (text, tone = 'info') => {
    const id = Date.now();
    set({ toastMessage: { id, text, tone } });
    setTimeout(() => {
      set((s) => (s.toastMessage?.id === id ? { toastMessage: null } : s));
    }, 3600);
  },
  pushIosPopup: (popup, force = false) => {
    const user = get().currentUser;
    if (!force && !shouldShowIosPopup(user)) return;
    set((s) => {
      if (s.iosPopups.some((p) => p.id === popup.id)) return s;
      return { iosPopups: [popup, ...s.iosPopups].slice(0, 3) };
    });
    setTimeout(() => {
      set((s) => ({ iosPopups: s.iosPopups.filter((p) => p.id !== popup.id) }));
    }, 8000);
  },
  dismissIosPopup: (id) =>
    set((s) => ({ iosPopups: s.iosPopups.filter((p) => p.id !== id) })),
  updatePresenceLocal: (presence) =>
    set((s) => (s.currentUser ? { currentUser: { ...s.currentUser, presence } } : s)),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  setRbacMatrix: (rbacMatrix) => set({ rbacMatrix }),
  setComposerQuoteDraft: (composerQuoteDraft) => set({ composerQuoteDraft }),
  setPrefilledTaskAssigneeId: (prefilledTaskAssigneeId) => set({ prefilledTaskAssigneeId }),
  dismissBroadcast: (id) =>
    set((s) => ({
      dismissedBroadcastIds: s.dismissedBroadcastIds.includes(id)
        ? s.dismissedBroadcastIds
        : [...s.dismissedBroadcastIds, id],
    })),
  setDailyToolsOpen: (dailyToolsOpen, tab) =>
    set((s) => ({
      dailyToolsOpen,
      dailyToolsTab: tab ?? s.dailyToolsTab,
    })),
  openPdfStudio: (att) =>
    set({
      dailyToolsOpen: true,
      dailyToolsTab: 'pdf',
      dailyToolsPdfAttachment: att,
    }),
  setCalendarSystem: (calendarSystem) => {
    localStorage.setItem('ws_calendar', calendarSystem);
    set({ calendarSystem });
  },
  setChatBgPreset: (chatBgPreset) => {
    localStorage.setItem('ws_chat_bg_preset', chatBgPreset);
    set({ chatBgPreset });
  },
  setChatBgCustomColor: (chatBgCustomColor) => {
    localStorage.setItem('ws_chat_bg_color', chatBgCustomColor);
    set({ chatBgCustomColor });
  },
  setChatBgPattern: (chatBgPattern) => {
    localStorage.setItem('ws_chat_bg_pattern', chatBgPattern);
    set({ chatBgPattern });
  },
  setChatBgOpacity: (chatBgOpacity) => {
    localStorage.setItem('ws_chat_bg_opacity', String(chatBgOpacity));
    set({ chatBgOpacity });
  },
  setNotifSoundEnabled: (notifSoundEnabled) => {
    localStorage.setItem('ws_notif_sound', notifSoundEnabled ? 'true' : 'false');
    set({ notifSoundEnabled });
  },
}));
