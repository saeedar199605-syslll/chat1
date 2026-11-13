import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  Bell,
  Bookmark,
  CheckSquare,
  ClipboardCheck,
  Crown,
  DatabaseBackup,
  Edit3,
  FolderOpen,
  Languages,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wrench,
} from 'lucide-react';
import { useAppStore, type RailTab } from '../store/useAppStore';
import { tipProps } from './GlassTooltip';
import { UserAvatar } from './UserAvatar';
import type { Workspace } from '../types/index';

interface SlimRailProps {
  workspaces: Workspace[];
  unreadNotifications: number;
  onCreateWorkspace: (name: string) => void;
  onEditWorkspace?: (ws: Workspace) => void;
}

export function SlimRail({
  workspaces,
  unreadNotifications,
  onCreateWorkspace,
  onEditWorkspace,
}: SlimRailProps) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const railTab = useAppStore((s) => s.railTab);
  const setRailTab = useAppStore((s) => s.setRailTab);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const currentUser = useAppStore((s) => s.currentUser);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setDailyToolsOpen = useAppStore((s) => s.setDailyToolsOpen);
  const dailyToolsOpen = useAppStore((s) => s.dailyToolsOpen);

  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [wsCoords, setWsCoords] = useState<{ top: number; left: number }>({ top: 12, left: 72 });
  const wsBtnRef = useRef<HTMLButtonElement>(null);
  const wsPopoverRef = useRef<HTMLDivElement>(null);

  const updateWsPosition = useCallback(() => {
    const el = wsBtnRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const popW = 304;
    const estH = 340;
    const isRtl = document.documentElement.dir === 'rtl';
    const desiredLeft = isRtl ? rect.left - popW - 10 : rect.right + 10;
    const left = Math.max(8, Math.min(window.innerWidth - popW - 8, desiredLeft));
    const top = Math.max(8, Math.min(window.innerHeight - estH - 8, rect.top));
    setWsCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!wsMenuOpen) return;
    updateWsPosition();
    const onResize = () => updateWsPosition();
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wsPopoverRef.current?.contains(target) || wsBtnRef.current?.contains(target)) return;
      setWsMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWsMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [wsMenuOpen, updateWsPosition]);

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
  const isFa = locale === 'fa';
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const canEditWs = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'DEPT_MANAGER';

  const navItems: Array<{ id: RailTab; label: string; icon: typeof MessageSquare; badge?: number }> = [
    { id: 'chat', label: isFa ? 'گفتگوها و کانال‌ها' : 'Channels', icon: MessageSquare },
    {
      id: 'activity',
      label: isFa ? 'اعلان‌ها و رویدادها' : 'Activity',
      icon: Bell,
      badge: unreadNotifications > 0 ? unreadNotifications : undefined,
    },
    { id: 'tasks', label: isFa ? 'مدیریت و ارجاع وظایف' : 'Tasks', icon: CheckSquare },
    { id: 'workflows', label: isFa ? 'درخواست‌ها و گزارش روزانه' : 'Workflows', icon: ClipboardCheck },
    { id: 'directory', label: isFa ? 'ساختار و چارت سازمانی' : 'Org Chart', icon: Users },
    { id: 'users', label: isFa ? 'کاربران و سطح دسترسی' : 'Users & RBAC', icon: ShieldCheck },
    { id: 'files', label: isFa ? 'مرکز اسناد و فایل‌ها' : 'Files Hub', icon: FolderOpen },
    { id: 'saved', label: isFa ? 'پیام‌های ذخیره‌شده' : 'Saved', icon: Bookmark },
    { id: 'archive', label: isFa ? 'بایگانی سازمانی' : 'Archive', icon: Archive },
    { id: 'backup', label: isFa ? 'پشتیبان‌گیری و بازیابی' : 'Backup', icon: DatabaseBackup },
    ...(isSuperAdmin
      ? [{ id: 'superadmin' as const, label: isFa ? 'پنل سوپر ادمین و لاگ‌ها' : 'Super Admin & Audit Logs', icon: Crown }]
      : []),
  ];

  return (
    <nav
      aria-label={isFa ? 'منوی اصلی فضای کاری' : 'Primary workspace navigation'}
      className="ember-dock relative w-[76px] shrink-0 h-full flex flex-col items-center justify-between py-3.5 z-30"
    >
      {/* Drifting ember glow behind the icons */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="ember-orb absolute -bottom-10 start-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-red-500/40 blur-3xl" />
      </span>

      {/* Top Workspace Switcher + Primary Views */}
      <div className="relative flex flex-col items-center gap-2.5 w-full px-3 min-h-0 flex-1">
        <div className="relative shrink-0">
          <motion.button
            ref={wsBtnRef}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.93 }}
            type="button"
            data-testid="workspace-switcher-btn"
            onClick={() => setWsMenuOpen((v) => !v)}
            aria-label={isFa ? 'تغییر یا ویرایش شرکت' : 'Switch workspace'}
            {...tipProps(
              activeWs?.name || 'تغییر شرکت یا ویرایش لوگو',
              'Switch or Edit Company Workspace',
              'مدیریت فضاهای کاری، نام و نشان شرکت',
              'Manage companies, workspace names & logos'
            )}
            className="brand-tile w-12 h-12 rounded-2xl p-1.5 flex items-center justify-center overflow-hidden transition-shadow hover:shadow-[0_0_0_2px_rgba(248,113,113,0.9),0_8px_22px_-6px_rgba(239,68,68,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
          >
            {activeWs?.logoUrl ? (
              <img src={activeWs.logoUrl} alt={activeWs.name} className="max-w-full max-h-full object-contain" />
            ) : activeWs?.id === 'ws_acme' || !activeWs ? (
              <img src="/assets/esfahan-chalak-logo.png" alt="اصفهان چالاک" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="w-full h-full rounded-lg bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                {activeWs.logoText}
              </span>
            )}
          </motion.button>

          {typeof document !== 'undefined' &&
            createPortal(
              <AnimatePresence>
                {wsMenuOpen && (
                  <motion.div
                    ref={wsPopoverRef}
                    initial={{ opacity: 0, scale: 0.94, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    data-testid="workspace-switcher-popover"
                    style={{ top: wsCoords.top, left: wsCoords.left }}
                    className="fixed w-[304px] bg-white/96 dark:bg-neutral-900/96 ios-glass-strong border border-neutral-200/90 dark:border-neutral-700 rounded-2xl shadow-2xl p-2.5 z-[9990]"
                  >
                <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">
                    {isFa ? 'شرکت‌ها و فضاهای کاری' : 'Companies & Workspaces'}
                  </span>
                  {activeWs && canEditWs && onEditWorkspace && (
                    <button
                      type="button"
                      data-testid="edit-active-workspace-btn"
                      onClick={() => {
                        setWsMenuOpen(false);
                        onEditWorkspace(activeWs);
                      }}
                      className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-red-600 flex items-center gap-1 whitespace-nowrap"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{isFa ? 'ویرایش فعلی' : 'Edit'}</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {workspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-colors ${
                        ws.id === activeWorkspaceId
                          ? 'bg-red-50/90 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-semibold border border-red-200 dark:border-red-900/60'
                          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80'
                      }`}
                    >
                      <button
                        type="button"
                        data-testid={`switch-ws-${ws.id}`}
                        onClick={() => {
                          setActiveWorkspaceId(ws.id);
                          setWsMenuOpen(false);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-start text-xs cursor-pointer"
                      >
                        <span className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center overflow-hidden shrink-0">
                          {ws.logoUrl ? (
                            <img src={ws.logoUrl} alt={ws.name} className="w-full h-full object-contain p-0.5" />
                          ) : (
                            <span className="w-full h-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                              {ws.logoText}
                            </span>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{ws.name}</div>
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                            {ws.memberCount} {isFa ? 'عضو' : 'members'} · {ws.domain || ws.slug}
                          </div>
                        </div>
                      </button>

                      {canEditWs && onEditWorkspace && (
                        <button
                          type="button"
                          onClick={() => {
                            setWsMenuOpen(false);
                            onEditWorkspace(ws);
                          }}
                          title={isFa ? 'ویرایش نام و لوگو' : 'Edit name & logo'}
                          aria-label={isFa ? `ویرایش ${ws.name}` : `Edit ${ws.name}`}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-white dark:hover:bg-neutral-700 shrink-0"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newWsName.trim()) return;
                    onCreateWorkspace(newWsName.trim());
                    setNewWsName('');
                    setWsMenuOpen(false);
                  }}
                  className="mt-2.5 pt-2.5 border-t border-neutral-200/80 dark:border-neutral-800 flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder={isFa ? 'نام شرکت یا دپارتمان جدید...' : 'New company / workspace...'}
                    aria-label={isFa ? 'نام فضای کاری جدید' : 'New workspace name'}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <button
                    type="submit"
                    aria-label={isFa ? 'ایجاد شرکت' : 'Create workspace'}
                    className="p-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </form>
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body
            )}
        </div>

        <div className="w-7 h-px bg-gradient-to-r from-transparent via-red-400/60 to-transparent shrink-0" />

        <div className="flex flex-col items-center gap-1 self-stretch -mx-3 px-3 overflow-y-auto py-1 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = railTab === item.id;
            return (
              <motion.button
                key={item.id}
                whileHover={{ scale: 1.07 }}
                whileTap={{ scale: 0.92 }}
                type="button"
                data-testid={`rail-tab-${item.id}`}
                onClick={() => setRailTab(item.id)}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                {...tipProps(item.label, item.label)}
                className={`group relative w-12 h-10 shrink-0 rounded-2xl flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer ${
                  active ? 'text-white' : 'text-white/55 hover:text-white hover:bg-white/10'
                }`}
              >
                {active && (
                  <>
                    <motion.span
                      layoutId="slimrail-active-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                      className="absolute inset-0 rounded-2xl ios-glass-selected"
                    />
                    {/* comet edge on the inner side of the rail */}
                    <span
                      aria-hidden
                      className="absolute -end-3 top-1/2 -translate-y-1/2 h-6 w-1 rounded-s-full bg-gradient-to-b from-red-300 to-red-500 shadow-[0_0_14px_3px_rgba(248,113,113,0.85)]"
                    />
                  </>
                )}
                <Icon className="relative z-10 w-5 h-5" strokeWidth={active ? 2.3 : 1.9} />
                {item.badge !== undefined && (
                  <span className="ember-pulse absolute -top-1 -end-1 z-20 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 ring-2 ring-[#160a0d] text-white text-[10px] font-bold tabular-nums flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Bottom Controls: Daily Tools, Glass Mode, RTL Locale, Theme, Settings, Profile & Sign Out */}
      <div className="relative flex flex-col items-center gap-0.5 w-full px-3 pt-2 shrink-0">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          type="button"
          data-testid="rail-tools-btn"
          onClick={() => setDailyToolsOpen(true, 'pdf')}
          aria-label={isFa ? 'جعبه ابزار روزانه و مبدل PDF' : 'Daily Tools & PDF Converter'}
          {...tipProps(
            'ابزارهای کاربردی روزانه و مبدل PDF',
            'Daily Utility Suite & PDF Converter',
            'تبدیل PDF به Word و عکس، تقویم شمسی و ماشین‌حساب',
            'PDF → Word/PNG, Jalali calendar, VAT calc & notes'
          )}
          className={`w-11 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            dailyToolsOpen
              ? 'ios-glass-selected'
              : 'text-red-300 bg-red-500/15 ring-1 ring-red-400/25 hover:bg-red-500/30 hover:text-white'
          }`}
        >
          <Wrench className="w-4 h-4" />
        </motion.button>

        <button
          type="button"
          onClick={() => setLocale(locale === 'en' ? 'fa' : 'en')}
          aria-label={isFa ? 'تغییر زبان' : 'Toggle language and RTL layout'}
          {...tipProps('تغییر زبان برنامه (فارسی / انگلیسی)', 'Switch Language (FA RTL / EN LTR)')}
          className="w-11 h-7 rounded-xl text-white/55 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors text-[10px] font-mono font-semibold cursor-pointer"
        >
          <Languages className="w-3.5 h-3.5 me-0.5" />
          <span>{locale.toUpperCase()}</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label={theme === 'light' ? (isFa ? 'حالت شب' : 'Switch to dark mode') : isFa ? 'حالت روز' : 'Switch to light mode'}
          {...tipProps('تغییر تم روشن (سفید و قرمز) / تاریک', 'Toggle Light (White & Red) / Dark Theme')}
          className="w-11 h-7 rounded-xl text-white/55 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          data-testid="rail-settings-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label={isFa ? 'تنظیمات حساب و واحد' : 'Workspace settings and RBAC'}
          {...tipProps(
            'تنظیمات پروفایل، واحد سازمانی و نحوه عضویت در گروه',
            'Profile, Department & Group Invite Policy'
          )}
          className="w-11 h-7 rounded-xl text-white/55 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          data-testid="rail-signout-btn"
          onClick={() => clearAuth()}
          aria-label={isFa ? 'خروج از حساب کاربری' : 'Sign out'}
          {...tipProps('خروج امن از حساب کاربری', 'Sign Out to Login Screen')}
          className="w-11 h-7 rounded-xl text-white/55 hover:bg-red-500/25 hover:text-red-200 flex items-center justify-center transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>

        {currentUser && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={`${currentUser.displayName}`}
            {...tipProps(`${currentUser.displayName} — ${currentUser.department}`, `${currentUser.displayName} (${currentUser.role})`)}
            className="mt-1.5 rounded-full ring-2 ring-red-400/60 hover:ring-red-300 transition focus-visible:outline-none cursor-pointer"
          >
            <UserAvatar
              name={currentUser.displayName}
              avatarUrl={currentUser.avatarUrl}
              presence={currentUser.presence}
              size="sm"
              showPresence
            />
          </button>
        )}
      </div>
    </nav>
  );
}
