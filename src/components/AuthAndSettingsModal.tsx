import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ExternalLink,
  KeyRound,
  LogOut,
  Palette,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smile,
  UserCheck,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import {
  CHAT_BG_PRESETS,
  buildChatBackgroundStyle,
  evaluatePasswordStrength,
  type ChatBgPatternId,
  type ChatBgPresetId,
} from '../utils/chatLogic';
import { formatAppDate } from '../utils/jalali';
import { AvatarCropModal } from './AvatarCropModal';
import { EmojiPicker } from './EmojiPicker';
import { tipProps } from './GlassTooltip';
import { UserAvatar } from './UserAvatar';
import { useServerInfo } from '../lib/serverInfo';
import type { GroupAddPolicy, PresenceStatus, Role, User } from '../types/index';

interface AuthAndSettingsModalProps {
  directoryUsers: User[];
  workspaceId: string;
}

export function AuthAndSettingsModal({ directoryUsers, workspaceId }: AuthAndSettingsModalProps) {
  const demo = Boolean(useServerInfo()?.demo);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const currentUser = useAppStore((s) => s.currentUser);
  const setAuth = useAppStore((s) => s.setAuth);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const showToast = useAppStore((s) => s.showToast);
  const locale = useAppStore((s) => s.locale);
  const theme = useAppStore((s) => s.theme);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const setCalendarSystem = useAppStore((s) => s.setCalendarSystem);
  const chatBgPreset = useAppStore((s) => s.chatBgPreset);
  const setChatBgPreset = useAppStore((s) => s.setChatBgPreset);
  const chatBgCustomColor = useAppStore((s) => s.chatBgCustomColor);
  const setChatBgCustomColor = useAppStore((s) => s.setChatBgCustomColor);
  const chatBgPattern = useAppStore((s) => s.chatBgPattern);
  const setChatBgPattern = useAppStore((s) => s.setChatBgPattern);
  const chatBgOpacity = useAppStore((s) => s.chatBgOpacity);
  const setChatBgOpacity = useAppStore((s) => s.setChatBgOpacity);
  const notifSoundEnabled = useAppStore((s) => s.notifSoundEnabled);
  const setNotifSoundEnabled = useAppStore((s) => s.setNotifSoundEnabled);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';
  const [tab, setTab] = useState<'status' | 'appearance' | 'security' | 'rbac' | 'auth'>('status');
  const [presence, setPresence] = useState<PresenceStatus>(currentUser?.presence || 'ONLINE');
  const [customStatus, setCustomStatus] = useState(currentUser?.customStatus || '');
  const [customEmoji, setCustomEmoji] = useState(currentUser?.customEmoji || '💼');
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Editable personal profile + unit/department
  const [fullNameEdit, setFullNameEdit] = useState(currentUser?.fullName || '');
  const [departmentEdit, setDepartmentEdit] = useState(currentUser?.department || '');
  const [jobTitleEdit, setJobTitleEdit] = useState(currentUser?.jobTitle || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Avatar crop state
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);

  // Security tab state
  const [currPw, setCurrPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authError, setAuthError] = useState('');

  const sessionsQuery = useQuery({
    queryKey: ['security-sessions', currentUser?.id],
    queryFn: api.getSecuritySessions,
    enabled: settingsOpen && tab === 'security' && Boolean(currentUser),
  });

  useEffect(() => {
    if (currentUser && settingsOpen) {
      setPresence(currentUser.presence);
      setCustomStatus(currentUser.customStatus || '');
      setCustomEmoji(currentUser.customEmoji || '💼');
      setFullNameEdit(currentUser.fullName);
      setDepartmentEdit(currentUser.department);
      setJobTitleEdit(currentUser.jobTitle);
    }
  }, [currentUser, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cropModalOpen) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, setSettingsOpen, cropModalOpen]);

  const handleSaveStatusAndProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.updateMyStatus({ presence, customStatus, customEmoji });
      const res = await api.updateMyProfile({
        fullName: fullNameEdit.trim() || undefined,
        department: departmentEdit.trim() || undefined,
        jobTitle: jobTitleEdit.trim() || undefined,
      });
      setCurrentUser(res.user);
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      showToast(isFa ? 'مشخصات، واحد سازمانی و وضعیت حضور ذخیره شد' : 'Profile, department & status updated');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUploadCroppedAvatar = async (croppedFile: File) => {
    try {
      const res = await api.uploadMyAvatar(croppedFile);
      setCurrentUser(res.user);
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      showToast(isFa ? 'تصویر پروفایل با موفقیت برش و ذخیره شد' : 'Profile photo cropped and updated');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currPw || newPw.length < 8) {
      showToast(isFa ? 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد' : 'New password must be at least 8 characters', 'error');
      return;
    }
    setChangingPw(true);
    try {
      const res = await api.changeMyPassword({ currentPassword: currPw, newPassword: newPw });
      if (res.accessToken && res.refreshToken && res.user) {
        setAuth(res.accessToken, res.refreshToken, res.user);
      }
      setCurrPw('');
      setNewPw('');
      queryClient.invalidateQueries({ queryKey: ['security-sessions'] });
      showToast(isFa ? 'رمز عبور تغییر یافت و نشست‌های دیگر باطل شدند' : 'Password updated and other sessions revoked');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setChangingPw(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setRevokingSessions(true);
    try {
      const res = await api.revokeAllSessions();
      setAuth(res.accessToken, res.refreshToken, res.user);
      queryClient.invalidateQueries({ queryKey: ['security-sessions'] });
      showToast(isFa ? 'تمام نشست‌های قبلی باطل و نشست امن جدید صادر شد' : 'All prior sessions revoked cleanly');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setRevokingSessions(false);
    }
  };

  const handleSwitchPersona = async (userId: string) => {
    const res = await api.demoSwitch(userId);
    setAuth(res.accessToken, res.refreshToken, res.user);
    queryClient.invalidateQueries();
    showToast(
      isFa
        ? `نشست فعال به ${res.user.displayName} تغییر یافت`
        : `Switched active session to ${res.user.displayName} (${res.user.role.replace('_', ' ')})`
    );
    setSettingsOpen(false);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res =
        authMode === 'login'
          ? await api.login(email, password)
          : await api.register({ email, password, fullName });
      setAuth(res.accessToken, res.refreshToken, res.user);
      queryClient.invalidateQueries();
      showToast(isFa ? `ورود با حساب ${res.user.displayName}` : `Signed in as ${res.user.displayName}`);
      setSettingsOpen(false);
    } catch (err) {
      setAuthError((err as Error).message);
    }
  };

  const handleChangeRole = async (targetUserId: string, nextRole: Role) => {
    try {
      await api.updateMemberRole(workspaceId, targetUserId, nextRole);
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      showToast(isFa ? 'نقش کاربر به‌روزرسانی شد' : 'Member role updated');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const pwStrength = evaluatePasswordStrength(newPw);
  const previewBgStyle = buildChatBackgroundStyle({
    preset: chatBgPreset,
    customColor: chatBgCustomColor,
    pattern: chatBgPattern,
    opacity: chatBgOpacity,
    isDark: theme === 'dark',
  });

  return (
    <>
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            role="dialog"
            data-testid="settings-modal"
            aria-label={isFa ? 'تنظیمات حساب و دسترسی اصفهان چالاک' : 'Account, Appearance & Security Settings'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="w-full max-w-3xl rounded-2xl bg-white dark:bg-neutral-900 ios-glass-strong border border-neutral-200/80 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="h-14 px-5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src="/assets/esfahan-chalak-logo.png"
                    alt={isFa ? 'لوگوی شرکت اصفهان چالاک' : 'Esfahan Chalak Logo'}
                    className="h-7 w-auto object-contain shrink-0"
                  />
                  <h3 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                    {isFa ? 'تنظیمات حساب، ظاهر چت، تقویم و امنیت' : 'Profile, Chat Theme, Calendar & Security'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label={isFa ? 'بستن تنظیمات' : 'Close settings'}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 bg-neutral-50/70 dark:bg-neutral-900/60 shrink-0">
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-neutral-200/70 dark:bg-neutral-800">
                  {[
                    { id: 'status' as const, label: isFa ? 'پروفایل و عکس' : 'Profile & Photo' },
                    { id: 'appearance' as const, label: isFa ? 'پس‌زمینه و تقویم' : 'Chat Bg & Calendar' },
                    { id: 'security' as const, label: isFa ? 'امنیت و نشست‌ها' : 'Security Center' },
                    { id: 'rbac' as const, label: isFa ? 'سطوح دسترسی' : 'RBAC & Personas' },
                    { id: 'auth' as const, label: isFa ? 'ورود JWT' : 'JWT Sign In' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`settings-tab-${t.id}`}
                      onClick={() => setTab(t.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                        tab === t.id
                          ? 'ios-glass-selected'
                          : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="/api/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-red-600 dark:text-red-400 hover:border-red-300 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{isFa ? 'مستندات API' : 'API Docs'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      clearAuth();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isFa ? 'خروج' : 'Sign Out'}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* 1. PROFILE, PHOTO CROPPER & DEPARTMENT */}
                {tab === 'status' && currentUser && (
                  <form onSubmit={handleSaveStatusAndProfile} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-neutral-50/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar
                          name={currentUser.displayName}
                          avatarUrl={currentUser.avatarUrl}
                          presence={currentUser.presence}
                          size="lg"
                          showPresence
                        />
                        <div className="min-w-0">
                          <div className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                            {currentUser.fullName}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            {currentUser.jobTitle} · {currentUser.department} · {currentUser.role.replace('_', ' ')}
                          </div>
                        </div>
                      </div>

                      <label
                        {...tipProps(
                          'انتخاب تصویر و برش/تنظیم هوشمند ابعاد پروفایل',
                          'Upload & Crop/Fit Profile Photo'
                        )}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ios-glass-selected text-xs font-semibold cursor-pointer shrink-0"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{isFa ? 'ویرایش و بارگذاری عکس پروفایل' : 'Edit & Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          data-testid="avatar-file-input"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setCropFile(f);
                              setCropModalOpen(true);
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="profile-fullname" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {isFa ? 'نام و نام خانوادگی' : 'Full Name'}
                        </label>
                        <input
                          id="profile-fullname"
                          type="text"
                          required
                          value={fullNameEdit}
                          onChange={(e) => setFullNameEdit(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="profile-department" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {isFa ? 'واحد سازمانی (دپارتمان)' : 'Department / Unit'}
                        </label>
                        <input
                          id="profile-department"
                          data-testid="modal-profile-department-input"
                          type="text"
                          required
                          value={departmentEdit}
                          onChange={(e) => setDepartmentEdit(e.target.value)}
                          placeholder={isFa ? 'مثلاً واحد فناوری و نوآوری' : 'Department'}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="profile-jobtitle" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {isFa ? 'عنوان شغلی' : 'Job Title'}
                        </label>
                        <input
                          id="profile-jobtitle"
                          type="text"
                          required
                          value={jobTitleEdit}
                          onChange={(e) => setJobTitleEdit(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label htmlFor="presence-select" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {isFa ? 'وضعیت دسترسی' : 'Availability Status'}
                        </label>
                        <select
                          id="presence-select"
                          value={presence}
                          onChange={(e) => setPresence(e.target.value as PresenceStatus)}
                          className="w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                        >
                          <option value="ONLINE">{isFa ? 'آنلاین' : 'Online'}</option>
                          <option value="IN_MEETING">{isFa ? 'در جلسه' : 'In a Meeting'}</option>
                          <option value="FOCUS_MODE">{isFa ? 'حالت تمرکز' : 'Focus Mode'}</option>
                          <option value="AWAY">{isFa ? 'دور از دسترس' : 'Away'}</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 relative">
                        <label htmlFor="status-emoji" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {isFa ? 'پیام وضعیت و ایموجی' : 'Custom Status & Emoji'}
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEmojiOpen((v) => !v)}
                            aria-label={isFa ? 'انتخاب ایموجی وضعیت' : 'Pick status emoji'}
                            className="w-11 h-9 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-500 flex items-center justify-center text-base shrink-0"
                          >
                            {customEmoji || <Smile className="w-4 h-4 text-neutral-400" />}
                          </button>
                          <input
                            id="status-emoji"
                            type="text"
                            value={customStatus}
                            onChange={(e) => setCustomStatus(e.target.value)}
                            placeholder={isFa ? 'در حال انجام چه کاری هستید؟' : 'What are you working on?'}
                            aria-label={isFa ? 'متن وضعیت سفارشی' : 'Custom status text'}
                            className="flex-1 px-3 py-2 text-sm rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                          />
                        </div>
                        {emojiOpen && (
                          <div className="absolute bottom-11 end-0 z-50">
                            <EmojiPicker
                              align="end"
                              onClose={() => setEmojiOpen(false)}
                              onSelect={(em) => {
                                setCustomEmoji(em);
                                setEmojiOpen(false);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-700 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span className="w-8 h-8 rounded-xl ios-glass-selected-soft text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                            {isFa ? 'نحوه افزودن من به گروه‌های جدید' : 'Group Membership Invitation Policy'}
                          </div>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {currentUser.groupAddPolicy === 'REQUEST'
                              ? isFa
                                ? 'حالت درخواستی فعال است: قبل از عضویت در گروه، دعوت‌نامه برایتان ارسال می‌شود.'
                                : 'Request mode ON: You must accept an invite before joining new groups.'
                              : isFa
                                ? 'حالت مستقیم فعال است: همکاران می‌توانند شما را مستقیماً به گروه‌ها اضافه کنند.'
                                : 'Direct mode ON: Colleagues can add you directly to groups.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 shrink-0">
                        {(
                          [
                            { id: 'DIRECT' as GroupAddPolicy, label: isFa ? 'افزودن مستقیم' : 'Direct Add' },
                            { id: 'REQUEST' as GroupAddPolicy, label: isFa ? 'ارسال درخواست' : 'Ask Request' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            data-testid={`group-policy-btn-${opt.id}`}
                            onClick={async () => {
                              try {
                                const res = await api.updateMyGroupPolicy(opt.id);
                                setCurrentUser(res.user);
                                queryClient.invalidateQueries({ queryKey: ['directory'] });
                                showToast(
                                  opt.id === 'REQUEST'
                                    ? isFa
                                      ? 'تنظیم عضویت به «ارسال درخواست تأیید» تغییر یافت'
                                      : 'Group policy set to Ask Request'
                                    : isFa
                                      ? 'تنظیم عضویت به «افزودن مستقیم» تغییر یافت'
                                      : 'Group policy set to Direct Add'
                                );
                              } catch (err) {
                                showToast((err as Error).message, 'error');
                              }
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                              (currentUser.groupAddPolicy || 'DIRECT') === opt.id
                                ? 'ios-glass-selected'
                                : 'text-neutral-600 dark:text-neutral-300'
                            }`}
                          >
                            {opt.id === 'REQUEST' && <ShieldCheck className="w-3 h-3" />}
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingProfile}
                      data-testid="modal-save-profile-btn"
                      className="px-4 py-2 rounded-xl ios-glass-selected text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      {savingProfile ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره مشخصات و واحد' : 'Save Profile & Unit'}
                    </button>
                  </form>
                )}

                {/* 2. CHAT BACKGROUND CUSTOMIZATION, JALALI CALENDAR & NOTIFICATION SOUND */}
                {tab === 'appearance' && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          <Palette className="w-4 h-4 text-red-600" />
                          <span>{isFa ? 'سفارشی‌سازی پس‌زمینه صفحه گفتگو' : 'Customizable Chat Canvas Background'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setChatBgPreset('default');
                            setChatBgPattern('none');
                            setChatBgOpacity(85);
                          }}
                          className="text-[11px] text-red-600 hover:underline cursor-pointer"
                        >
                          {isFa ? 'بازگشت به پیش‌فرض' : 'Reset Default'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {CHAT_BG_PRESETS.map((preset) => {
                          const active = chatBgPreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              data-testid={`chat-bg-preset-${preset.id}`}
                              onClick={() => setChatBgPreset(preset.id as ChatBgPresetId)}
                              className={`p-2 rounded-xl border text-start transition-all cursor-pointer flex items-center gap-2 ${
                                active
                                  ? 'border-red-600 ring-2 ring-red-500/20 bg-red-50/40 dark:bg-red-950/30'
                                  : 'border-neutral-200 dark:border-neutral-700 hover:border-red-300'
                              }`}
                            >
                              <span
                                style={{ background: preset.swatch }}
                                className="w-7 h-7 rounded-lg border border-neutral-200 dark:border-neutral-700 shrink-0 flex items-center justify-center"
                              >
                                {active && <Check className="w-3.5 h-3.5 text-red-600" />}
                              </span>
                              <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                                {isFa ? preset.nameFa : preset.nameEn}
                              </span>
                            </button>
                          );
                        })}

                        <label className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-red-400 flex items-center gap-2 cursor-pointer">
                          <input
                            type="color"
                            data-testid="chat-bg-custom-color"
                            value={chatBgCustomColor}
                            onChange={(e) => {
                              setChatBgCustomColor(e.target.value);
                              setChatBgPreset('custom');
                            }}
                            aria-label={isFa ? 'انتخاب رنگ دلخواه پس‌زمینه چت' : 'Pick custom chat background color'}
                            className="w-7 h-7 rounded-lg border-0 bg-transparent cursor-pointer shrink-0"
                          />
                          <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                            {isFa ? 'رنگ دلخواه' : 'Custom Color'}
                          </span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1.5">
                          <span className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                            {isFa ? 'الگوی ظریف پس‌زمینه' : 'Subtle Pattern Overlay'}
                          </span>
                          <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
                            {(
                              [
                                { id: 'none', label: isFa ? 'ساده' : 'Clean' },
                                { id: 'dots', label: isFa ? 'نقطه‌ای' : 'Dots' },
                                { id: 'grid', label: isFa ? 'شبکه‌ای' : 'Grid' },
                                { id: 'waves', label: isFa ? 'خطوط مورب' : 'Diagonal' },
                              ] as Array<{ id: ChatBgPatternId; label: string }>
                            ).map((pat) => (
                              <button
                                key={pat.id}
                                type="button"
                                onClick={() => setChatBgPattern(pat.id)}
                                className={`flex-1 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                                  chatBgPattern === pat.id ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                                }`}
                              >
                                {pat.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                            <span>{isFa ? 'شفافیت پس‌زمینه' : 'Tint Intensity'}</span>
                            <span className="font-mono tabular-nums">{chatBgOpacity}%</span>
                          </div>
                          <input
                            type="range"
                            min={20}
                            max={100}
                            value={chatBgOpacity}
                            onChange={(e) => setChatBgOpacity(Number(e.target.value))}
                            aria-label="Chat background opacity"
                            className="w-full accent-red-600"
                          />
                        </div>
                      </div>

                      {/* Mini Preview */}
                      <div
                        style={previewBgStyle}
                        className="rounded-2xl border border-neutral-200/90 dark:border-neutral-700 p-3 flex items-center justify-between gap-3"
                      >
                        <div className="px-3 py-1.5 rounded-xl ios-glass-card text-xs text-neutral-800 dark:text-neutral-100">
                          {isFa ? 'پیش‌نمایش زنده پس‌زمینه گفتگو در اصفهان چالاک' : 'Live preview of your chat background'}
                        </div>
                        <span className="text-[10px] font-mono text-neutral-500 uppercase">
                          {chatBgPreset} · {chatBgPattern}
                        </span>
                      </div>
                    </div>

                    {/* Calendar System Selector */}
                    <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span className="w-9 h-9 rounded-xl ios-glass-selected-soft text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                          <CalendarDays className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                            {isFa ? 'تقویم رسمی برنامه (شمسی / میلادی)' : 'System Calendar Format (Jalali / Gregorian)'}
                          </div>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {isFa ? 'نمونه نمایش تاریخ امروز:' : 'Sample timestamp:'}{' '}
                            <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                              {formatAppDate(new Date(), { calendarSystem, locale, includeTime: true, withMonthName: true })}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
                        <button
                          type="button"
                          data-testid="calendar-system-jalali"
                          onClick={() => {
                            setCalendarSystem('jalali');
                            showToast(isFa ? 'تقویم برنامه به هجری شمسی تغییر یافت' : 'Calendar switched to Jalali (Shamsi)');
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            calendarSystem === 'jalali' ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {isFa ? 'هجری شمسی' : 'Jalali (Shamsi)'}
                        </button>
                        <button
                          type="button"
                          data-testid="calendar-system-gregorian"
                          onClick={() => {
                            setCalendarSystem('gregorian');
                            showToast(isFa ? 'تقویم برنامه به میلادی تغییر یافت' : 'Calendar switched to Gregorian');
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            calendarSystem === 'gregorian' ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {isFa ? 'میلادی' : 'Gregorian'}
                        </button>
                      </div>
                    </div>

                    {/* Notification Audio Chime */}
                    <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl ios-glass-selected-soft text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                          <Volume2 className="w-4 h-4" />
                        </span>
                        <div>
                          <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                            {isFa ? 'صدای اعلان ملایم iOS هنگام دریافت پیام جدید' : 'Subtle iOS Chime on Incoming Notifications'}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {isFa ? 'پخش زنگ ملایم با Web Audio هنگام دریافت نوتیفیکیشن' : 'Plays a gentle synthesized chime for live popups'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifSoundEnabled(!notifSoundEnabled)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                          notifSoundEnabled ? 'ios-glass-selected' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                        }`}
                      >
                        {notifSoundEnabled ? (isFa ? 'روشن' : 'Enabled') : isFa ? 'خاموش' : 'Muted'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. SECURITY CENTER (PASSWORD HARDENING + SESSION REVOCATION + AUDIT LOG) */}
                {tab === 'security' && currentUser && (
                  <div className="space-y-4">
                    <form
                      onSubmit={handleChangePassword}
                      className="p-4 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 space-y-3"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        <KeyRound className="w-4 h-4 text-red-600" />
                        <span>{isFa ? 'تغییر رمز عبور و سنجش امنیت گذرواژه' : 'Change Password & Strength Auditor'}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                            {isFa ? 'رمز عبور فعلی' : 'Current Password'}
                          </label>
                          <input
                            type="password"
                            required
                            value={currPw}
                            onChange={(e) => setCurrPw(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                            {isFa ? 'رمز عبور جدید (حداقل ۸ کاراکتر)' : 'New Password (min 8 chars)'}
                          </label>
                          <input
                            type="password"
                            required
                            data-testid="security-new-password-input"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                          />
                        </div>
                      </div>

                      {/* Password Strength Meter */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-neutral-500">{isFa ? 'سطح امنیت رمز عبور:' : 'Strength:'}</span>
                          <span
                            className={`font-bold ${
                              pwStrength.score >= 3
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : pwStrength.score === 2
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                            }`}
                          >
                            {isFa ? pwStrength.labelFa : pwStrength.labelEn}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[1, 2, 3, 4].map((bar) => (
                            <span
                              key={bar}
                              className={`h-1.5 rounded-full transition-colors ${
                                pwStrength.score >= bar
                                  ? pwStrength.score >= 3
                                    ? 'bg-emerald-500'
                                    : pwStrength.score === 2
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                  : 'bg-neutral-200 dark:bg-neutral-700'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2 text-[10px] text-neutral-500 pt-0.5">
                          <span className={pwStrength.checks.minLen ? 'text-emerald-600 font-semibold' : ''}>
                            • {isFa ? '۸+ کاراکتر' : '8+ chars'}
                          </span>
                          <span className={pwStrength.checks.upper && pwStrength.checks.lower ? 'text-emerald-600 font-semibold' : ''}>
                            • {isFa ? 'حروف بزرگ و کوچک' : 'Upper & Lower'}
                          </span>
                          <span className={pwStrength.checks.number ? 'text-emerald-600 font-semibold' : ''}>
                            • {isFa ? 'شامل عدد' : 'Number'}
                          </span>
                          <span className={pwStrength.checks.symbol ? 'text-emerald-600 font-semibold' : ''}>
                            • {isFa ? 'نماد (!@#)' : 'Symbol (!@#)'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={changingPw}
                        className="px-4 py-2 rounded-xl ios-glass-selected text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {changingPw ? (isFa ? 'در حال اعمال...' : 'Updating...') : isFa ? 'تغییر رمز عبور و ایمن‌سازی' : 'Update Password'}
                      </button>
                    </form>

                    {/* Active Sessions & Revocation */}
                    <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          <ShieldAlert className="w-4 h-4 text-red-600" />
                          <span>
                            {isFa
                              ? `نشست‌های فعال (${sessionsQuery.data?.activeRefreshTokens.length ?? 0})`
                              : `Active Refresh Sessions (${sessionsQuery.data?.activeRefreshTokens.length ?? 0})`}
                          </span>
                        </div>
                        <button
                          type="button"
                          data-testid="revoke-all-sessions-btn"
                          disabled={revokingSessions}
                          onClick={handleRevokeAllSessions}
                          className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {revokingSessions
                            ? isFa
                              ? 'در حال ابطال...'
                              : 'Revoking...'
                            : isFa
                              ? 'ابطال تمام نشست‌های دیگر'
                              : 'Revoke All Other Sessions'}
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {sessionsQuery.data?.recentSecurityEvents.map((ev) => (
                          <div
                            key={ev.id}
                            className="px-3 py-2 rounded-xl bg-neutral-50/80 dark:bg-neutral-800/60 border border-neutral-200/70 dark:border-neutral-700 flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">{ev.action}</span>
                            <span className="text-neutral-500 font-mono tabular-nums">
                              {formatAppDate(ev.createdAt, { calendarSystem, locale, includeTime: true })}
                            </span>
                          </div>
                        ))}
                        {(!sessionsQuery.data?.recentSecurityEvents || sessionsQuery.data.recentSecurityEvents.length === 0) && (
                          <div className="text-xs text-neutral-500 py-2">
                            {isFa ? 'رویداد امنیتی اخیری ثبت نشده است.' : 'No recent security events.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. RBAC & PERSONAS */}
                {tab === 'rbac' && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs text-neutral-700 dark:text-neutral-200 flex items-start gap-2.5">
                      <Shield className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      <div>
                        {isFa
                          ? 'برای بررسی اعمال دسترسی‌های واقعی در کانال‌های اعلامیه، مدیریت تسک و بایگانی، می‌توانید نشست فعال خود را بین همکاران تغییر دهید.'
                          : 'Switch active authenticated persona to verify real RBAC enforcement across announcements, task assignment, channel creation, and file governance.'}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {directoryUsers.map((u) => {
                        const isCurrent = u.id === currentUser?.id;
                        return (
                          <div
                            key={u.id}
                            className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} size="sm" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                  {u.fullName} {isCurrent && (isFa ? '(حساب فعلی)' : '(Current)')}
                                </div>
                                <div className="text-[11px] text-neutral-500 truncate">
                                  {u.jobTitle} · {u.department} · {u.email}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {currentUser?.role === 'SUPER_ADMIN' ? (
                                <select
                                  value={u.role}
                                  onChange={(e) => handleChangeRole(u.id, e.target.value as Role)}
                                  aria-label={`Role for ${u.fullName}`}
                                  className="px-2 py-1 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-red-500"
                                >
                                  <option value="SUPER_ADMIN">{isFa ? 'مدیر ارشد سیستم' : 'Super Admin'}</option>
                                  <option value="DEPT_MANAGER">{isFa ? 'مدیر دپارتمان' : 'Dept Manager'}</option>
                                  <option value="MEMBER">{isFa ? 'عضو سازمان' : 'Member'}</option>
                                  <option value="GUEST">{isFa ? 'مهمان' : 'Guest'}</option>
                                </select>
                              ) : (
                                <span className="text-xs font-mono text-neutral-500">{u.role}</span>
                              )}

                              {!isCurrent && demo && (
                                <button
                                  type="button"
                                  onClick={() => handleSwitchPersona(u.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>{isFa ? 'تغییر نشست' : 'Switch'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5. JWT SIGN IN */}
                {tab === 'auth' && (
                  <form onSubmit={handleAuthSubmit} className="space-y-4 max-w-md">
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap shrink-0 transition-colors ${
                          authMode === 'login'
                            ? 'bg-red-600 text-white'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {isFa ? 'ورود با ایمیل' : 'Sign In'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthMode('register')}
                        className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap shrink-0 transition-colors ${
                          authMode === 'register'
                            ? 'bg-red-600 text-white'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {isFa ? 'ایجاد حساب جدید' : 'Create Account'}
                      </button>
                    </div>

                    {authError && (
                      <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs">
                        {authError}
                      </div>
                    )}

                    {authMode === 'register' && (
                      <div className="space-y-1">
                        <label htmlFor="reg-name" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {isFa ? 'نام و نام خانوادگی' : 'Full Name'}
                        </label>
                        <input
                          id="reg-name"
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder={isFa ? 'نام کامل همکار' : 'Jordan Taylor'}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label htmlFor="auth-email" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {isFa ? 'ایمیل سازمانی' : 'Work Email'}
                      </label>
                      <input
                        id="auth-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="auth-pw" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {isFa ? 'رمز عبور' : 'Password'}
                      </label>
                      <input
                        id="auth-pw"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
                    >
                      {authMode === 'login'
                        ? isFa
                          ? 'احراز هویت و ورود'
                          : 'Authenticate Session'
                        : isFa
                          ? 'ثبت‌نام و ورود به فضای کاری'
                          : 'Register & Join Workspace'}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AvatarCropModal
        open={cropModalOpen}
        file={cropFile}
        isFa={isFa}
        onClose={() => {
          setCropModalOpen(false);
          setCropFile(null);
        }}
        onConfirm={handleUploadCroppedAvatar}
      />
    </>
  );
}

