import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Check,
  KeyRound,
  Lock,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import {
  ALL_PERMISSION_ACTIONS,
  buildDefaultRoleMatrix,
  canPerformWithMatrix,
  type PermissionAction,
} from '../utils/chatLogic';
import { UserAvatar } from './UserAvatar';
import { useServerInfo } from '../lib/serverInfo';
import type { Role, User } from '../types/index';

interface UsersAccessViewProps {
  users: User[];
}

const ROLE_LABELS: Record<Role, { fa: string; en: string }> = {
  SUPER_ADMIN: { fa: 'مدیر کل سیستم', en: 'Super Admin' },
  DEPT_MANAGER: { fa: 'مدیر دپارتمان', en: 'Dept Manager' },
  MEMBER: { fa: 'کارشناس / عضو', en: 'Member' },
  GUEST: { fa: 'کاربر مهمان', en: 'Guest' },
};

const PERMISSION_LABELS: Record<PermissionAction, { fa: string; en: string }> = {
  'channel:create': { fa: 'ایجاد کانال جدید', en: 'Create Channels' },
  'channel:delete': { fa: 'مدیریت، ویرایش موضوع و بایگانی کانال', en: 'Manage & Archive Channels' },
  'message:post': { fa: 'ارسال پیام در کانال‌های عمومی', en: 'Post Messages' },
  'message:delete_any': { fa: 'حذف پیام سایر اعضا', en: 'Delete Any Message' },
  'message:pin': { fa: 'سنجاق کردن و بایگانی پیام', en: 'Pin & Archive Messages' },
  'file:delete_any': { fa: 'حذف فایل‌های سازمانی', en: 'Delete Any File' },
  'call:host': { fa: 'شروع جلسه ویدیویی و اشتراک صفحه', en: 'Host Video Huddles' },
  'task:assign_team': { fa: 'تعریف و ارجاع تسک به کارمندان', en: 'Assign Team Tasks' },
  'approval:review': { fa: 'بررسی و تأیید درخواست‌های اداری', en: 'Review Approvals' },
  'backup:manage': { fa: 'تهیه و راستی‌آزمایی پشتیبان', en: 'Manage Backups' },
  'user:manage': { fa: 'ایجاد، تعلیق و ویرایش کاربران', en: 'Manage User Accounts' },
  'workspace:manage_roles': { fa: 'تغییر ماتریس دسترسی و بازیابی دیتابیس', en: 'Configure RBAC & Restore DB' },
};

export function UsersAccessView({ users }: UsersAccessViewProps) {
  const demo = Boolean(useServerInfo()?.demo);
  const currentUser = useAppStore((s) => s.currentUser);
  const setAuth = useAppStore((s) => s.setAuth);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const locale = useAppStore((s) => s.locale);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const setRbacMatrix = useAppStore((s) => s.setRbacMatrix);
  const showToast = useAppStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';
  const [tab, setTab] = useState<'accounts' | 'matrix' | 'profile'>('accounts');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');

  const matrixQuery = useQuery({
    queryKey: ['rbac-matrix'],
    queryFn: api.getRbacMatrix,
  });

  const [draftMatrix, setDraftMatrix] = useState<Record<string, Record<string, boolean>>>(() =>
    buildDefaultRoleMatrix()
  );

  useEffect(() => {
    if (matrixQuery.data?.matrix) {
      setDraftMatrix(matrixQuery.data.matrix);
      setRbacMatrix(matrixQuery.data.matrix);
    }
  }, [matrixQuery.data, setRbacMatrix]);

  const canManageUsers = canPerformWithMatrix(currentUser, 'user:manage', 'PUBLIC', rbacMatrix);
  const canManageRoles = canPerformWithMatrix(currentUser, 'workspace:manage_roles', 'PUBLIC', rbacMatrix);

  // Create / Edit User Modal state
  const [modalMode, setModalMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formDepartment, setFormDepartment] = useState('فناوری اطلاعات');
  const [formTimezone, setFormTimezone] = useState('Asia/Tehran');
  const [formRole, setFormRole] = useState<Role>('MEMBER');
  const [formManagerId, setFormManagerId] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formCustomPerms, setFormCustomPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // My Profile state
  const [myFullName, setMyFullName] = useState(currentUser?.fullName || '');
  const [myJobTitle, setMyJobTitle] = useState(currentUser?.jobTitle || '');
  const [myDept, setMyDept] = useState(currentUser?.department || '');
  const [myPassword, setMyPassword] = useState('');

  useEffect(() => {
    if (currentUser) {
      setMyFullName(currentUser.fullName);
      setMyJobTitle(currentUser.jobTitle);
      setMyDept(currentUser.department);
    }
  }, [currentUser]);

  const filteredUsers = users.filter((u) => {
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const q = search.trim().toLowerCase();
    const matchesQ =
      !q ||
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q) ||
      u.jobTitle.toLowerCase().includes(q);
    return matchesRole && matchesQ;
  });

  const openCreateUser = () => {
    setModalMode('create');
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('Chalak!2026');
    setFormJobTitle('');
    setFormDepartment('عملیات و مهندسی');
    setFormTimezone('Asia/Tehran');
    setFormRole('MEMBER');
    setFormManagerId(users[0]?.id || '');
    setFormActive(true);
    setFormCustomPerms({});
  };

  const openEditUser = (u: User) => {
    setModalMode('edit');
    setEditingUser(u);
    setFormName(u.fullName);
    setFormEmail(u.email);
    setFormPassword('');
    setFormJobTitle(u.jobTitle);
    setFormDepartment(u.department);
    setFormTimezone(u.timezone);
    setFormRole(u.role);
    setFormManagerId(u.managerId || '');
    setFormActive(u.isActive !== false);
    setFormCustomPerms({ ...(u.customPermissions || {}) });
  };

  const handleSaveUserModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await api.adminCreateUser({
          fullName: formName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          jobTitle: formJobTitle.trim(),
          department: formDepartment.trim(),
          timezone: formTimezone,
          role: formRole,
          managerId: formManagerId || null,
          isActive: formActive,
          customPermissions: formCustomPerms,
        });
        showToast(isFa ? 'حساب کاربری جدید با موفقیت ایجاد شد' : 'New user account provisioned');
      } else if (modalMode === 'edit' && editingUser) {
        const res = await api.adminUpdateUser(editingUser.id, {
          fullName: formName.trim(),
          jobTitle: formJobTitle.trim(),
          department: formDepartment.trim(),
          timezone: formTimezone,
          role: formRole,
          managerId: formManagerId || null,
          isActive: formActive,
          customPermissions: formCustomPerms,
          newPassword: formPassword.trim() ? formPassword.trim() : undefined,
        });
        if (editingUser.id === currentUser?.id) {
          setCurrentUser(res.user);
        }
        showToast(isFa ? `دسترسی‌ها و پروفایل ${formName.trim()} به‌روزرسانی شد` : `Updated ${formName.trim()}`);
      }
      setModalMode('none');
      queryClient.invalidateQueries({ queryKey: ['directory'] });
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchSession = async (userId: string) => {
    try {
      const res = await api.demoSwitch(userId);
      setAuth(res.accessToken, res.refreshToken, res.user);
      queryClient.invalidateQueries();
      showToast(
        isFa
          ? `نشست کاربری به ${res.user.displayName} تغییر یافت`
          : `Switched active session to ${res.user.displayName}`
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSaveMatrix = async () => {
    setSaving(true);
    try {
      const res = await api.updateRbacMatrix(draftMatrix);
      setRbacMatrix(res.matrix);
      queryClient.invalidateQueries({ queryKey: ['rbac-matrix'] });
      showToast(isFa ? 'ماتریس سطوح دسترسی سازمانی ذخیره شد' : 'RBAC permission matrix saved');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateMyProfile({
        fullName: myFullName.trim(),
        jobTitle: myJobTitle.trim(),
        department: myDept.trim(),
        newPassword: myPassword.trim() || undefined,
      });
      setCurrentUser(res.user);
      setMyPassword('');
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      showToast(isFa ? 'پروفایل کاربری شما ذخیره شد' : 'Your profile was updated');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleOverrideState = (action: PermissionAction) => {
    setFormCustomPerms((prev) => {
      const next = { ...prev };
      if (next[action] === true) next[action] = false;
      else if (next[action] === false) delete next[action];
      else next[action] = true;
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100 truncate">
            {isFa ? 'مدیریت کاربران، حساب‌ها و سطوح دسترسی' : 'User Governance & Granular RBAC'}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
            {[
              { id: 'accounts' as const, label: isFa ? 'کاربران و دسترسی‌ها' : 'Accounts', icon: Users },
              { id: 'matrix' as const, label: isFa ? 'ماتریس نقش‌ها' : 'Role Matrix', icon: Shield },
              { id: 'profile' as const, label: isFa ? 'حساب من' : 'My Profile', icon: UserCog },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    tab === t.id
                      ? 'bg-white dark:bg-neutral-700 text-red-600 dark:text-red-400 shadow-xs'
                      : 'text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {canManageUsers && tab === 'accounts' && (
            <button
              type="button"
              onClick={openCreateUser}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isFa ? 'کاربر جدید' : 'Add User'}</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-6xl">
        {tab === 'accounts' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isFa ? 'جستجوی نام، ایمیل، واحد سازمانی...' : 'Search name, email, department...'}
                  aria-label="Search users"
                  className="w-full ps-9 pe-3 py-2 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      roleFilter === r
                        ? 'bg-red-600 text-white'
                        : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:border-red-300'
                    }`}
                  >
                    {r === 'ALL' ? (isFa ? 'همه نقش‌ها' : 'All Roles') : isFa ? ROLE_LABELS[r].fa : ROLE_LABELS[r].en}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredUsers.map((u, idx) => {
                const isCurrent = u.id === currentUser?.id;
                const active = u.isActive !== false;
                const overrideCount = Object.keys(u.customPermissions || {}).length;
                const manager = users.find((m) => m.id === u.managerId);

                return (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.2) }}
                    className={`p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border transition-colors flex flex-col justify-between gap-3 ${
                      active
                        ? 'border-neutral-200 dark:border-neutral-800'
                        : 'border-red-300 dark:border-red-900/70 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <UserAvatar
                          name={u.displayName}
                          avatarUrl={u.avatarUrl}
                          presence={u.presence}
                          size="md"
                          showPresence
                        />
                        <div className="min-w-0">
                          <div className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                            {u.fullName} {isCurrent && (isFa ? '— (شما)' : '— (Active Session)')}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            {u.jobTitle} · {u.department}
                          </div>
                          <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400 flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-red-600 dark:text-red-400">
                              {isFa ? ROLE_LABELS[u.role].fa : ROLE_LABELS[u.role].en}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className={active ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}>
                              {active ? (isFa ? 'حساب فعال' : 'Active') : (isFa ? 'معلق' : 'Suspended')}
                            </span>
                            {overrideCount > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                                  {overrideCount} {isFa ? 'مجوز اختصاصی' : 'overrides'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
                      <div className="truncate">
                        {u.email}
                        {manager && (
                          <span>
                            {' '}
                            · {isFa ? 'مدیر:' : 'Reports to:'} {manager.displayName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {canManageUsers && (
                          <button
                            type="button"
                            onClick={() => openEditUser(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-300 hover:text-red-600"
                          >
                            <UserCog className="w-3.5 h-3.5" />
                            <span>{isFa ? 'تنظیم دسترسی' : 'Permissions'}</span>
                          </button>
                        )}
                        {!isCurrent && active && demo && (
                          <button
                            type="button"
                            onClick={() => handleSwitchSession(u.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{isFa ? 'ورود با این کاربر' : 'Switch'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'matrix' && (
          <div className="rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  {isFa ? 'ماتریس کنترل دسترسی نقش‌محور (RBAC)' : 'Enterprise Role-Based Permission Matrix'}
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {isFa
                    ? 'تغییرات ماتریس به صورت لحظه‌ای روی تمامی کاربران و کانال‌های شرکت اصفهان چالاک اعمال می‌شود.'
                    : 'Changes apply immediately across all channels, tasks, approvals, and administrative endpoints.'}
                </p>
              </div>
              {canManageRoles && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveMatrix}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{saving ? '...' : isFa ? 'ذخیره ماتریس دسترسی' : 'Save RBAC Matrix'}</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300">
                    <th className="text-start px-5 py-3 font-semibold">
                      {isFa ? 'مجوز عملیاتی' : 'Permission Capability'}
                    </th>
                    {(['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST'] as const).map((r) => (
                      <th key={r} className="text-center px-4 py-3 font-semibold whitespace-nowrap">
                        {isFa ? ROLE_LABELS[r].fa : ROLE_LABELS[r].en}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {ALL_PERMISSION_ACTIONS.map((action) => (
                    <tr key={action} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30">
                      <td className="px-5 py-3">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {isFa ? PERMISSION_LABELS[action].fa : PERMISSION_LABELS[action].en}
                        </div>
                        <div className="text-[11px] font-mono text-neutral-400">{action}</div>
                      </td>
                      {(['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST'] as const).map((role) => {
                        const checked = Boolean(draftMatrix[role]?.[action]);
                        const locked =
                          !canManageRoles ||
                          (role === 'SUPER_ADMIN' &&
                            (action === 'workspace:manage_roles' || action === 'user:manage'));
                        return (
                          <td key={role} className="text-center px-4 py-3">
                            <button
                              type="button"
                              disabled={locked}
                              aria-label={`${role} ${action}`}
                              onClick={() =>
                                setDraftMatrix((prev) => ({
                                  ...prev,
                                  [role]: { ...(prev[role] || {}), [action]: !checked },
                                }))
                              }
                              className={`w-6 h-6 rounded-md inline-flex items-center justify-center border transition-colors ${
                                checked
                                  ? 'bg-red-600 border-red-600 text-white'
                                  : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-transparent'
                              } ${locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {locked && checked ? <Lock className="w-3 h-3" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'profile' && currentUser && (
          <form
            onSubmit={handleSaveMyProfile}
            className="max-w-xl p-6 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4"
          >
            <div className="flex items-center gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-800">
              <UserAvatar
                name={currentUser.displayName}
                avatarUrl={currentUser.avatarUrl}
                presence={currentUser.presence}
                size="lg"
                showPresence
              />
              <div>
                <div className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  {currentUser.fullName}
                </div>
                <div className="text-xs text-neutral-500">
                  {currentUser.email} · {isFa ? ROLE_LABELS[currentUser.role].fa : ROLE_LABELS[currentUser.role].en}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'نام و نام خانوادگی' : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  value={myFullName}
                  onChange={(e) => setMyFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'عنوان شغلی' : 'Job Title'}
                </label>
                <input
                  type="text"
                  required
                  value={myJobTitle}
                  onChange={(e) => setMyJobTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'دپارتمان / واحد' : 'Department'}
                </label>
                <input
                  type="text"
                  required
                  value={myDept}
                  onChange={(e) => setMyDept(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'تغییر رمز عبور (اختیاری)' : 'New Password (Optional)'}
                </label>
                <input
                  type="password"
                  value={myPassword}
                  onChange={(e) => setMyPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{isFa ? 'ذخیره اطلاعات کاربری' : 'Save Account Profile'}</span>
            </button>
          </form>
        )}
      </div>

      {/* Provision / Edit User & Granular Override Modal */}
      {modalMode !== 'none' && (
        <div className="fixed inset-0 z-50 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl rounded-2xl ios-glass-strong bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
          >
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <h2 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {modalMode === 'create'
                  ? isFa
                    ? 'ایجاد کاربر و تعیین سطح دسترسی جدید'
                    : 'Provision Enterprise User Account'
                  : isFa
                    ? `تنظیم حساب و مجوزهای اختصاصی — ${editingUser?.fullName}`
                    : `Configure User Access — ${editingUser?.fullName}`}
              </h2>
              <button
                type="button"
                onClick={() => setModalMode('none')}
                aria-label="Close user governance modal"
                className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUserModal} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'نام کامل' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'ایمیل سازمانی' : 'Work Email'}
                  </label>
                  <input
                    type="email"
                    required
                    disabled={modalMode === 'edit'}
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'عنوان شغلی' : 'Job Title'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formJobTitle}
                    onChange={(e) => setFormJobTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'واحد سازمانی' : 'Department'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'نقش دسترسی' : 'RBAC Role'}
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as Role)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  >
                    <option value="SUPER_ADMIN">{isFa ? ROLE_LABELS.SUPER_ADMIN.fa : ROLE_LABELS.SUPER_ADMIN.en}</option>
                    <option value="DEPT_MANAGER">{isFa ? ROLE_LABELS.DEPT_MANAGER.fa : ROLE_LABELS.DEPT_MANAGER.en}</option>
                    <option value="MEMBER">{isFa ? ROLE_LABELS.MEMBER.fa : ROLE_LABELS.MEMBER.en}</option>
                    <option value="GUEST">{isFa ? ROLE_LABELS.GUEST.fa : ROLE_LABELS.GUEST.en}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'مدیر مستقیم' : 'Reporting Manager'}
                  </label>
                  <select
                    value={formManagerId}
                    onChange={(e) => setFormManagerId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  >
                    <option value="">{isFa ? 'بدون مدیر (سطح ارشد)' : 'No Manager (Top Level)'}</option>
                    {users
                      .filter((u) => u.id !== editingUser?.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {modalMode === 'create'
                      ? isFa
                        ? 'رمز عبور اولیه'
                        : 'Initial Password'
                      : isFa
                        ? 'بازنشانی رمز عبور (اختیاری)'
                        : 'Reset Password (Optional)'}
                  </label>
                  <input
                    type="password"
                    required={modalMode === 'create'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formActive}
                      onChange={(e) => setFormActive(e.target.checked)}
                      className="rounded border-neutral-300 text-red-600 focus:ring-red-500"
                    />
                    <span>{isFa ? 'حساب کاربری فعال باشد' : 'Account Active (Allow Login)'}</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {isFa
                    ? 'استثنائات و مجوزهای اختصاصی کاربر (کلیک برای تغییر: ارث‌بری ← مجاز ← مسدود)'
                    : 'Per-User Permission Overrides (Click to cycle: Inherit → Allow → Deny)'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {ALL_PERMISSION_ACTIONS.map((action) => {
                    const state = formCustomPerms[action];
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => toggleOverrideState(action)}
                        className={`px-3 py-2 rounded-lg border text-start text-xs flex items-center justify-between gap-2 transition-colors ${
                          state === true
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                            : state === false
                              ? 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-700 dark:text-red-300'
                              : 'bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        <span className="truncate">
                          {isFa ? PERMISSION_LABELS[action].fa : PERMISSION_LABELS[action].en}
                        </span>
                        <span className="font-mono text-[10px] shrink-0">
                          {state === true ? (isFa ? 'مجاز' : 'ALLOW') : state === false ? (isFa ? 'مسدود' : 'DENY') : isFa ? 'ارثی' : 'INHERIT'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-300"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{saving ? '...' : isFa ? 'ذخیره تنظیمات کاربری' : 'Save User Account'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
