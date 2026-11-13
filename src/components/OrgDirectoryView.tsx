import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckSquare,
  Clock,
  Edit3,
  GitFork,
  LayoutGrid,
  MessageSquare,
  Search,
  Settings2,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import {
  buildOrgTree,
  canPerformWithMatrix,
  formatLocalTime,
  wouldCreateOrgCycle,
  type OrgTreeNode,
} from '../utils/chatLogic';
import { UserAvatar } from './UserAvatar';
import type { Role, User } from '../types/index';

interface OrgDirectoryViewProps {
  users: User[];
  currentUserId?: string;
  onOpenDm: (userId: string) => void;
}

const PRESENCE_LABEL: Record<User['presence'], { en: string; fa: string; tone: string }> = {
  ONLINE: { en: 'Online', fa: 'آنلاین', tone: 'text-emerald-600 dark:text-emerald-400' },
  IN_MEETING: { en: 'In a Meeting', fa: 'در جلسه', tone: 'text-red-600 dark:text-red-400' },
  FOCUS_MODE: { en: 'Focus Mode', fa: 'حالت تمرکز', tone: 'text-red-700 dark:text-red-300' },
  AWAY: { en: 'Away', fa: 'دور از میز', tone: 'text-amber-600 dark:text-amber-400' },
  OFFLINE: { en: 'Offline', fa: 'آفلاین', tone: 'text-neutral-400' },
};

const ROLE_LABEL: Record<Role, { en: string; fa: string }> = {
  SUPER_ADMIN: { en: 'Super Admin', fa: 'مدیر کل سیستم' },
  DEPT_MANAGER: { en: 'Department Manager', fa: 'مدیر دپارتمان' },
  MEMBER: { en: 'Member', fa: 'کارشناس / عضو' },
  GUEST: { en: 'Guest', fa: 'مهمان' },
};

function OrgNodeCard({
  node,
  currentUserId,
  canManage,
  canAssignTasks,
  configMode,
  isFa,
  onOpenDm,
  onEditNode,
  onAssignTask,
  onNodeContextMenu,
  depth = 0,
}: {
  node: OrgTreeNode;
  currentUserId?: string;
  canManage: boolean;
  canAssignTasks: boolean;
  configMode: boolean;
  isFa: boolean;
  onOpenDm: (userId: string) => void;
  onEditNode: (user: User) => void;
  onAssignTask: (user: User) => void;
  onNodeContextMenu: (e: React.MouseEvent, user: User) => void;
  depth?: number;
}) {
  const { user, reports } = node;
  const p = PRESENCE_LABEL[user.presence];
  const isDirectReport = user.managerId === currentUserId;
  const showAssignBtn = (canAssignTasks || isDirectReport) && user.id !== currentUserId;

  return (
    <div className={depth > 0 ? 'ms-6 ps-4 border-s border-red-200 dark:border-red-900/50 space-y-3' : 'space-y-3'}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        onContextMenu={(e) => onNodeContextMenu(e, user)}
        data-testid={`org-node-${user.id}`}
        className="p-3.5 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-red-200 dark:hover:border-red-900/60 transition-colors flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} presence={user.presence} size="md" showPresence />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                {user.fullName}
              </span>
              {isDirectReport && (
                <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                  {isFa ? 'زیرمجموعه شما' : 'Direct Report'}
                </span>
              )}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {user.jobTitle} · {user.department}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              <span className={`font-medium ${p.tone}`}>{isFa ? p.fa : p.en}</span>
              {user.customStatus && (
                <>
                  <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">·</span>
                  <span className="text-neutral-600 dark:text-neutral-300">
                    {user.customEmoji} {user.customStatus}
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="font-mono tabular-nums text-neutral-400 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatLocalTime(user.timezone)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showAssignBtn && (
            <button
              type="button"
              onClick={() => onAssignTask(user)}
              aria-label={`Assign task to ${user.fullName}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap shrink-0"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{isFa ? 'تعریف تسک' : 'Assign Task'}</span>
            </button>
          )}
          {canManage && configMode && (
            <button
              type="button"
              onClick={() => onEditNode(user)}
              aria-label={`Configure ${user.fullName}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isFa ? 'ویرایش جایگاه' : 'Edit Node'}</span>
            </button>
          )}
          {user.id !== currentUserId && (
            <button
              type="button"
              onClick={() => onOpenDm(user.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{isFa ? 'پیام' : 'Message'}</span>
            </button>
          )}
        </div>
      </motion.div>

      {reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((child) => (
            <OrgNodeCard
              key={child.user.id}
              node={child}
              currentUserId={currentUserId}
              canManage={canManage}
              canAssignTasks={canAssignTasks}
              configMode={configMode}
              isFa={isFa}
              onOpenDm={onOpenDm}
              onEditNode={onEditNode}
              onAssignTask={onAssignTask}
              onNodeContextMenu={onNodeContextMenu}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgDirectoryView({ users, currentUserId, onOpenDm }: OrgDirectoryViewProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const locale = useAppStore((s) => s.locale);
  const setRailTab = useAppStore((s) => s.setRailTab);
  const setPrefilledTaskAssigneeId = useAppStore((s) => s.setPrefilledTaskAssigneeId);
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const showToast = useAppStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';

  const [viewMode, setViewMode] = useState<'grid' | 'tree'>('grid');
  const [configMode, setConfigMode] = useState(false);
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');

  const [modalMode, setModalMode] = useState<'none' | 'edit' | 'create'>('none');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [timezone, setTimezone] = useState('Asia/Tehran');
  const [role, setRole] = useState<Role>('MEMBER');
  const [managerId, setManagerId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const canManage = canPerformWithMatrix(currentUser, 'channel:delete', 'PUBLIC', rbacMatrix);
  const canAssignTasks = canPerformWithMatrix(currentUser, 'task:assign_team', 'PUBLIC', rbacMatrix);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const departments = ['ALL', ...Array.from(new Set(users.map((u) => u.department)))];
  const filtered = users.filter((u) => {
    const matchesDept = deptFilter === 'ALL' || u.department === deptFilter;
    const q = query.trim().toLowerCase();
    const matchesQ =
      !q ||
      u.fullName.toLowerCase().includes(q) ||
      u.jobTitle.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q);
    return matchesDept && matchesQ;
  });

  const orgTree = buildOrgTree(users);

  const handleAssignTaskToUser = (targetUser: User) => {
    setPrefilledTaskAssigneeId(targetUser.id);
    setRailTab('tasks');
  };

  const openEditModal = (u: User) => {
    setModalMode('edit');
    setEditingUser(u);
    setFullName(u.fullName);
    setEmail(u.email);
    setJobTitle(u.jobTitle);
    setDepartment(u.department);
    setTimezone(u.timezone);
    setRole(u.role);
    setManagerId(u.managerId || '');
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingUser(null);
    setFullName('');
    setEmail('');
    setJobTitle('');
    setDepartment('Engineering');
    setTimezone('Asia/Tehran');
    setRole('MEMBER');
    setManagerId(users[0]?.id || '');
  };

  const handleMemberContextMenu = (e: React.MouseEvent, user: User) => {
    e.preventDefault();
    e.stopPropagation();
    const isDirectReport = user.managerId === currentUserId;
    const items = [];
    if (user.id !== currentUserId) {
      items.push({
        id: 'member-dm',
        label: isFa ? `ارسال پیام مستقیم به ${user.displayName}` : `Send Direct Message`,
        onSelect: () => onOpenDm(user.id),
      });
    }
    if (canAssignTasks || isDirectReport) {
      items.push({
        id: 'member-task',
        label: isFa ? `تعریف تسک برای ${user.displayName}` : `Assign Task to ${user.displayName}`,
        onSelect: () => handleAssignTaskToUser(user),
      });
    }
    if (canManage) {
      items.push({
        id: 'member-org',
        label: isFa ? 'تنظیم جایگاه در چارت سازمانی' : 'Configure Org Node',
        dividerAbove: items.length > 0,
        onSelect: () => openEditModal(user),
      });
    }
    if (items.length === 0) return;
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: user.fullName,
      items,
    });
  };

  const handleSaveOrgNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modalMode === 'edit' && editingUser) {
        await api.updateMember(editingUser.id, {
          fullName: fullName.trim(),
          jobTitle: jobTitle.trim(),
          department: department.trim(),
          timezone: timezone.trim(),
          role: isSuperAdmin ? role : undefined,
          managerId: managerId || null,
        });
        showToast(isFa ? `جایگاه سازمانی ${fullName.trim()} به‌روزرسانی شد` : `Updated org placement for ${fullName.trim()}`);
      } else if (modalMode === 'create') {
        await api.createMember({
          fullName: fullName.trim(),
          email: email.trim(),
          jobTitle: jobTitle.trim(),
          department: department.trim(),
          timezone: timezone.trim(),
          role,
          managerId: managerId || null,
        });
        showToast(isFa ? `${fullName.trim()} به چارت سازمانی اضافه شد` : `Added ${fullName.trim()} to organization chart`);
      }
      setModalMode('none');
      queryClient.invalidateQueries({ queryKey: ['directory'] });
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100 truncate">
            {isFa ? 'دایرکتوری پرسنل و چارت سازمانی اصفهان چالاک' : 'Organizational Directory & Reporting Chart'}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setConfigMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  configMode
                    ? 'bg-red-50 dark:bg-red-950/60 border-red-400 text-red-700 dark:text-red-300'
                    : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>{configMode ? (isFa ? 'اتمام تنظیم چارت' : 'Done Configuring') : isFa ? 'تنظیم چارت سازمانی' : 'Configure Org Chart'}</span>
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isFa ? 'افزودن همکار' : 'Add Member'}</span>
              </button>
            </>
          )}

          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{isFa ? 'دایرکتوری' : 'Directory'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                viewMode === 'tree'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>{isFa ? 'چارت درختی' : 'Org Chart'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {viewMode === 'grid' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isFa ? 'جستجوی نام، سمت یا واحد سازمانی...' : 'Search people, roles, departments...'}
                aria-label="Search employee directory"
                className="w-full ps-9 pe-3 py-2 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {departments.map((dept) => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setDeptFilter(dept)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    deptFilter === dept
                      ? 'bg-red-600 text-white'
                      : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  {dept === 'ALL' ? (isFa ? 'همه واحدها' : 'All Departments') : dept}
                </button>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((user, idx) => {
              const p = PRESENCE_LABEL[user.presence];
              const manager = users.find((m) => m.id === user.managerId);
              const isDirectReport = user.managerId === currentUserId;
              const showAssignBtn = (canAssignTasks || isDirectReport) && user.id !== currentUserId;
              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: Math.min(idx * 0.02, 0.15) }}
                  onContextMenu={(e) => handleMemberContextMenu(e, user)}
                  data-testid={`directory-card-${user.id}`}
                  className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-red-200 dark:hover:border-red-900/60 transition-colors flex flex-col justify-start gap-4"
                >
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      name={user.displayName}
                      avatarUrl={user.avatarUrl}
                      presence={user.presence}
                      size="lg"
                      showPresence
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                          {user.fullName}
                        </div>
                        {isDirectReport && (
                          <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 shrink-0">
                            {isFa ? 'زیرمجموعه شما' : 'Direct Report'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-300 truncate">{user.jobTitle}</div>
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {user.department} · {isFa ? ROLE_LABEL[user.role].fa : ROLE_LABEL[user.role].en}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${p.tone}`}>{isFa ? p.fa : p.en}</span>
                      <span className="font-mono tabular-nums text-neutral-400">
                        {isFa ? 'ساعت محلی' : 'Local'} {formatLocalTime(user.timezone)}
                      </span>
                    </div>
                    {user.customStatus && (
                      <div className="text-neutral-600 dark:text-neutral-300 truncate">
                        {user.customEmoji} {user.customStatus}
                      </div>
                    )}
                    {manager && (
                      <div className="text-[11px] text-neutral-500">
                        {isFa ? 'مدیر مستقیم:' : 'Reports to:'}{' '}
                        <span className="font-medium text-neutral-700 dark:text-neutral-200">{manager.fullName}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {showAssignBtn && (
                      <button
                        type="button"
                        onClick={() => handleAssignTaskToUser(user)}
                        aria-label={`Assign task to ${user.fullName}`}
                        data-testid={`assign-task-${user.id}`}
                        className="flex-1 py-2 px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>{isFa ? 'تعریف تسک' : 'Assign Task'}</span>
                      </button>
                    )}
                    {canManage && configMode && (
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="flex-1 py-2 px-2.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'ویرایش جایگاه' : 'Edit Hierarchy'}</span>
                      </button>
                    )}
                    {user.id !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => onOpenDm(user.id)}
                        className="flex-1 py-2 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{isFa ? 'پیام مستقیم' : 'Message'}</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="max-w-3xl space-y-4">
            {orgTree.map((root) => (
              <OrgNodeCard
                key={root.user.id}
                node={root}
                currentUserId={currentUserId}
                canManage={canManage}
                canAssignTasks={canAssignTasks}
                configMode={configMode}
                isFa={isFa}
                onOpenDm={onOpenDm}
                onEditNode={openEditModal}
                onAssignTask={handleAssignTaskToUser}
                onNodeContextMenu={handleMemberContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      {/* Org Chart Node Configuration Modal */}
      <AnimatePresence>
        {modalMode !== 'none' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16 }}
              className="w-full max-w-lg rounded-2xl ios-glass-strong bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <h2 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  {modalMode === 'edit'
                    ? isFa
                      ? `تنظیم جایگاه سازمانی — ${editingUser?.fullName}`
                      : `Configure Org Position — ${editingUser?.fullName}`
                    : isFa
                      ? 'افزودن عضو جدید به چارت سازمانی'
                      : 'Add Employee to Org Chart'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  aria-label="Close org chart modal"
                  className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveOrgNode} className="p-5 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'نام و نام خانوادگی' : 'Full Name'}
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  {modalMode === 'create' ? (
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        {isFa ? 'ایمیل سازمانی' : 'Work Email'}
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@esfahan-chalak.ir"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        {isFa ? 'منطقه زمانی' : 'Timezone'}
                      </label>
                      <input
                        type="text"
                        required
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'عنوان شغلی' : 'Job Title'}
                    </label>
                    <input
                      type="text"
                      required
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder={isFa ? 'مثال: سرپرست فنی سیستم‌ها' : 'e.g., Principal Distributed Systems Engineer'}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'واحد سازمانی' : 'Department'}
                    </label>
                    <input
                      type="text"
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder={isFa ? 'مثال: فنی و مهندسی' : 'e.g., Core Platform'}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'مدیر مستقیم' : 'Reports To (Manager)'}
                    </label>
                    <select
                      value={managerId}
                      onChange={(e) => setManagerId(e.target.value)}
                      aria-label="Reporting manager"
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                    >
                      <option value="">{isFa ? 'بدون مدیر (سطح ارشد)' : 'No Manager (Executive / Root)'}</option>
                      {users
                        .filter((candidate) =>
                          editingUser ? !wouldCreateOrgCycle(users, editingUser.id, candidate.id) : true
                        )
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName} ({m.jobTitle})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'نقش دسترسی' : 'RBAC Role'}
                    </label>
                    <select
                      value={role}
                      disabled={!isSuperAdmin}
                      onChange={(e) => setRole(e.target.value as Role)}
                      aria-label="RBAC role"
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 disabled:opacity-60"
                    >
                      <option value="SUPER_ADMIN">{isFa ? ROLE_LABEL.SUPER_ADMIN.fa : ROLE_LABEL.SUPER_ADMIN.en}</option>
                      <option value="DEPT_MANAGER">{isFa ? ROLE_LABEL.DEPT_MANAGER.fa : ROLE_LABEL.DEPT_MANAGER.en}</option>
                      <option value="MEMBER">{isFa ? ROLE_LABEL.MEMBER.fa : ROLE_LABEL.MEMBER.en}</option>
                      <option value="GUEST">{isFa ? ROLE_LABEL.GUEST.fa : ROLE_LABEL.GUEST.en}</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalMode('none')}
                    className="px-3.5 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium"
                  >
                    {isFa ? 'انصراف' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {saving
                      ? isFa
                        ? 'در حال ذخیره...'
                        : 'Saving...'
                      : modalMode === 'edit'
                        ? isFa
                          ? 'ذخیره جایگاه'
                          : 'Save Org Placement'
                        : isFa
                          ? 'افزودن به چارت'
                          : 'Add to Org Chart'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
