import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  Columns3,
  Edit3,
  List,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { canPerformWithMatrix, getSubordinateIds } from '../utils/chatLogic';
import { formatAppDate } from '../utils/jalali';
import type { Channel, TaskItem, TaskPriority, TaskStatus, User } from '../types/index';

interface TasksHubViewProps {
  workspaceId: string;
  channels: Channel[];
  users: User[];
  onJumpToChannel: (channelId: string) => void;
}

const PRIORITY_STYLE: Record<TaskPriority, { en: string; fa: string; dot: string; text: string }> = {
  LOW: { en: 'Low', fa: 'کم', dot: 'bg-neutral-400', text: 'text-neutral-500 dark:text-neutral-400' },
  MEDIUM: { en: 'Medium', fa: 'متوسط', dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' },
  HIGH: { en: 'High', fa: 'بالا', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  URGENT: { en: 'Urgent', fa: 'فوری', dot: 'bg-red-600', text: 'text-red-600 dark:text-red-400' },
};

const COLUMNS: Array<{ status: TaskStatus; en: string; fa: string }> = [
  { status: 'TODO', en: 'To Do', fa: 'در صف انجام' },
  { status: 'IN_PROGRESS', en: 'In Progress', fa: 'در حال اجرا' },
  { status: 'DONE', en: 'Done', fa: 'تکمیل‌شده' },
];

export function TasksHubView({ workspaceId, channels, users, onJumpToChannel }: TasksHubViewProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const prefilledTaskAssigneeId = useAppStore((s) => s.prefilledTaskAssigneeId);
  const setPrefilledTaskAssigneeId = useAppStore((s) => s.setPrefilledTaskAssigneeId);
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const showToast = useAppStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';

  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'TEAM' | 'MINE'>('ALL');
  const [searchText, setSearchText] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [channelId, setChannelId] = useState(channels[0]?.id || '');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ['all-tasks', workspaceId],
    queryFn: () => api.getAllTasks({ workspaceId }),
    enabled: Boolean(workspaceId),
  });

  const subordinateIds = currentUser ? getSubordinateIds(users, currentUser.id) : [];
  const canAssignTeam = canPerformWithMatrix(currentUser, 'task:assign_team', 'PUBLIC', rbacMatrix);
  const teamAssignCandidates =
    subordinateIds.length > 0
      ? users.filter((u) => subordinateIds.includes(u.id))
      : canAssignTeam
        ? users.filter((u) => u.id !== currentUser?.id)
        : [];

  const openCreateModal = (initialAssigneeId = '') => {
    setEditingTask(null);
    setTitle('');
    setDescription('');
    setChannelId(channels.find((c) => c.type !== 'DM')?.id || channels[0]?.id || '');
    setAssigneeId(initialAssigneeId);
    setPriority('HIGH');
    setStatus('TODO');
    setDueDate('');
    setModalOpen(true);
  };

  useEffect(() => {
    if (prefilledTaskAssigneeId) {
      openCreateModal(prefilledTaskAssigneeId);
      setPrefilledTaskAssigneeId(null);
    }
  }, [prefilledTaskAssigneeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tasks = (tasksQuery.data?.tasks || []).filter((t) => {
    const q = searchText.trim().toLowerCase();
    const matchText =
      !q ||
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.assigneeName || '').toLowerCase().includes(q);
    const matchPriority = priorityFilter === 'ALL' || (t.priority || 'MEDIUM') === priorityFilter;
    const matchChannel = channelFilter === 'ALL' || t.channelId === channelFilter;
    const matchScope =
      scopeFilter === 'ALL'
        ? true
        : scopeFilter === 'MINE'
          ? t.assigneeId === currentUser?.id || t.creatorId === currentUser?.id
          : Boolean(t.assigneeId && subordinateIds.includes(t.assigneeId));
    return matchText && matchPriority && matchChannel && matchScope;
  });

  const openEditModal = (t: TaskItem) => {
    setEditingTask(t);
    setTitle(t.title);
    setDescription(t.description || '');
    setChannelId(t.channelId);
    setAssigneeId(t.assigneeId || '');
    setPriority(t.priority || 'MEDIUM');
    setStatus(t.status);
    setDueDate(t.dueDate || '');
    setModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      if (editingTask) {
        await api.updateTask(editingTask.id, {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        });
        showToast(isFa ? 'وظیفه به‌روزرسانی شد' : 'Task updated');
      } else {
        await api.createTask(channelId, {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        });
        showToast(isFa ? 'وظیفه ایجاد و تخصیص داده شد' : 'Task created and assigned');
      }
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['archive'] });
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (task: TaskItem, nextStatus: TaskStatus) => {
    await api.updateTask(task.id, { status: nextStatus });
    queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks', task.channelId] });
    queryClient.invalidateQueries({ queryKey: ['archive'] });
  };

  const handleDeleteTask = async (task: TaskItem) => {
    try {
      await api.deleteTask(task.id);
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', task.channelId] });
      showToast(isFa ? 'وظیفه حذف شد' : 'Task deleted');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const canDeleteAny = canPerformWithMatrix(currentUser, 'message:delete_any', 'PUBLIC', rbacMatrix);

  const handleTaskContextMenu = (e: React.MouseEvent, task: TaskItem) => {
    e.preventDefault();
    e.stopPropagation();
    const canDelete = canDeleteAny || task.creatorId === currentUser?.id;
    const items = [
      {
        id: 'task-todo',
        label: isFa ? 'انتقال به «در صف انجام»' : 'Move to To Do',
        onSelect: () => handleStatusChange(task, 'TODO'),
      },
      {
        id: 'task-prog',
        label: isFa ? 'انتقال به «در حال اجرا»' : 'Move to In Progress',
        onSelect: () => handleStatusChange(task, 'IN_PROGRESS'),
      },
      {
        id: 'task-done',
        label: isFa ? 'علامت‌گذاری به عنوان تکمیل‌شده' : 'Mark Done',
        onSelect: () => handleStatusChange(task, 'DONE'),
      },
      {
        id: 'task-edit',
        label: isFa ? 'ویرایش جزئیات وظیفه' : 'Edit Task',
        dividerAbove: true,
        onSelect: () => openEditModal(task),
      },
      {
        id: 'task-channel',
        label: isFa ? 'رفتن به کانال مرتبط' : 'Jump to Channel',
        onSelect: () => onJumpToChannel(task.channelId),
      },
    ];
    if (canDelete) {
      items.push({
        id: 'task-delete',
        label: isFa ? 'حذف وظیفه' : 'Delete Task',
        dividerAbove: true,
        danger: true,
        onSelect: () => handleDeleteTask(task),
      } as typeof items[number]);
    }
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: task.title.slice(0, 36),
      items,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      {/* Header */}
      <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckSquare className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100 truncate">
            {isFa ? 'مدیریت وظایف و تکالیف سازمانی' : 'Task Management & Action Items'}
          </h1>
          <span className="text-xs font-mono tabular-nums text-neutral-400 shrink-0">
            ({tasks.length})
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                viewMode === 'board'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>{isFa ? 'تخته کانبان' : 'Board'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>{isFa ? 'جدول' : 'List'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => openCreateModal()}
            data-testid="new-task-button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isFa ? 'تعریف وظیفه جدید' : 'New Task'}</span>
          </button>
        </div>
      </header>

      {/* Manager Quick-Assign Strip */}
      {teamAssignCandidates.length > 0 && (
        <div className="px-6 py-2.5 bg-red-50/70 dark:bg-red-950/20 border-b border-red-200/80 dark:border-red-900/50 flex items-center gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300 whitespace-nowrap shrink-0">
            <Users className="w-3.5 h-3.5" />
            <span>{isFa ? 'تعریف سریع تسک برای پرسنل:' : 'Quick-Assign to Team:'}</span>
          </div>
          {teamAssignCandidates.slice(0, 6).map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => openCreateModal(emp.id)}
              data-testid={`quick-assign-${emp.id}`}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-800/70 text-[11px] font-medium text-neutral-800 dark:text-neutral-200 hover:border-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
            >
              + {isFa ? `تعریف تسک برای ${emp.displayName}` : `Assign to ${emp.displayName}`}
            </button>
          ))}
        </div>
      )}

      {/* Filters Bar */}
      <div className="px-6 py-3 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center gap-3 shrink-0">
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={isFa ? 'جستجوی عنوان یا مسئول انجام...' : 'Search tasks or assignees...'}
            aria-label="Search tasks"
            className="w-full ps-8 pe-3 py-1.5 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
          {(
            [
              { id: 'ALL', fa: 'همه وظایف', en: 'All' },
              { id: 'TEAM', fa: 'وظایف زیرمجموعه', en: 'My Team' },
              { id: 'MINE', fa: 'وظایف من', en: 'Mine' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScopeFilter(tab.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                scopeFilter === tab.id
                  ? 'bg-red-600 text-white'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900'
              }`}
            >
              {isFa ? tab.fa : tab.en}
            </button>
          ))}
        </div>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | TaskPriority)}
          aria-label="Filter by priority"
          className="px-2.5 py-1.5 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
        >
          <option value="ALL">{isFa ? 'همه اولویت‌ها' : 'All Priorities'}</option>
          <option value="URGENT">{isFa ? 'فوری' : 'Urgent'}</option>
          <option value="HIGH">{isFa ? 'بالا' : 'High'}</option>
          <option value="MEDIUM">{isFa ? 'متوسط' : 'Medium'}</option>
          <option value="LOW">{isFa ? 'کم' : 'Low'}</option>
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          aria-label="Filter by channel"
          className="px-2.5 py-1.5 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
        >
          <option value="ALL">{isFa ? 'همه کانال‌ها' : 'All Channels'}</option>
          {channels
            .filter((c) => c.type !== 'DM')
            .map((ch) => (
              <option key={ch.id} value={ch.id}>
                #{ch.name}
              </option>
            ))}
        </select>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {viewMode === 'board' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            {COLUMNS.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col.status);
              return (
                <div
                  key={col.status}
                  className="rounded-xl bg-neutral-100/80 dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between px-1">
                    <h2 className="font-display font-semibold text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                      {isFa ? col.fa : col.en}
                    </h2>
                    <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                      {colTasks.length}
                    </span>
                  </div>

                  {colTasks.length === 0 ? (
                    <div className="py-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg">
                      {isFa ? `موردی در «${col.fa}» نیست` : `No tasks in ${col.en}`}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {colTasks.map((task, idx) => {
                        const prio = PRIORITY_STYLE[task.priority || 'MEDIUM'];
                        const canDelete = canDeleteAny || task.creatorId === currentUser?.id;
                        return (
                          <motion.div
                            key={task.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.14, delay: Math.min(idx * 0.02, 0.12) }}
                            onContextMenu={(e) => handleTaskContextMenu(e, task)}
                            data-testid={`task-card-${task.id}`}
                            className="p-3.5 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-red-200 dark:hover:border-red-900/60 transition-colors space-y-2.5 shadow-2xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                                <span className={`w-2 h-2 rounded-full ${prio.dot}`} />
                                <span className={prio.text}>{isFa ? prio.fa : prio.en}</span>
                                {task.channelName && (
                                  <>
                                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                                    <button
                                      type="button"
                                      onClick={() => onJumpToChannel(task.channelId)}
                                      className="text-red-600 dark:text-red-400 hover:underline truncate max-w-[120px]"
                                    >
                                      #{task.channelName}
                                    </button>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(task)}
                                  aria-label={`Edit task ${task.title}`}
                                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTask(task)}
                                    aria-label={`Delete task ${task.title}`}
                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-neutral-400 hover:text-red-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div>
                              <h3
                                className={`text-xs font-semibold leading-snug ${
                                  task.status === 'DONE'
                                    ? 'line-through text-neutral-400'
                                    : 'text-neutral-900 dark:text-neutral-100'
                                }`}
                              >
                                {task.title}
                              </h3>
                              {task.description && (
                                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2">
                                  {task.description}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                                <span>{task.assigneeName || (isFa ? 'بدون مسئول' : 'Unassigned')}</span>
                                {task.dueDate && (
                                  <span className="ms-2 inline-flex items-center gap-1 font-mono tabular-nums">
                                    <Calendar className="w-3 h-3" /> {formatAppDate(task.dueDate, { calendarSystem, locale })}
                                  </span>
                                )}
                              </div>
                              <select
                                value={task.status}
                                onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                                aria-label={`Change status for ${task.title}`}
                                className="px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 shrink-0"
                              >
                                <option value="TODO">{isFa ? 'در صف' : 'To Do'}</option>
                                <option value="IN_PROGRESS">{isFa ? 'در حال اجرا' : 'In Progress'}</option>
                                <option value="DONE">{isFa ? 'تکمیل‌شده' : 'Done'}</option>
                              </select>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  <th className="py-3 px-4 text-start">{isFa ? 'وظیفه' : 'Task'}</th>
                  <th className="py-3 px-4 text-start">{isFa ? 'کانال' : 'Channel'}</th>
                  <th className="py-3 px-4 text-start">{isFa ? 'اولویت' : 'Priority'}</th>
                  <th className="py-3 px-4 text-start">{isFa ? 'مسئول انجام' : 'Assignee'}</th>
                  <th className="py-3 px-4 text-start">{isFa ? 'سررسید' : 'Due Date'}</th>
                  <th className="py-3 px-4 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                  <th className="py-3 px-4 text-end">{isFa ? 'اقدامات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                {tasks.map((task) => {
                  const prio = PRIORITY_STYLE[task.priority || 'MEDIUM'];
                  const canDelete = canDeleteAny || task.creatorId === currentUser?.id;
                  return (
                    <tr
                      key={task.id}
                      onContextMenu={(e) => handleTaskContextMenu(e, task)}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              task.status === 'DONE' ? 'text-emerald-500' : 'text-neutral-300 dark:text-neutral-600'
                            }`}
                          />
                          <span className={task.status === 'DONE' ? 'line-through text-neutral-400' : 'font-medium text-neutral-900 dark:text-neutral-100'}>
                            {task.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-red-600 dark:text-red-400">
                        {task.channelName ? `#${task.channelName}` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${prio.text}`}>
                          <span className={`w-2 h-2 rounded-full ${prio.dot}`} />
                          {isFa ? prio.fa : prio.en}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-neutral-600 dark:text-neutral-300">
                        {task.assigneeName || (isFa ? 'بدون مسئول' : 'Unassigned')}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-neutral-500">
                        {task.dueDate ? formatAppDate(task.dueDate, { calendarSystem, locale }) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                          aria-label={`List status for ${task.title}`}
                          className="px-2 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                        >
                          <option value="TODO">{isFa ? 'در صف' : 'To Do'}</option>
                          <option value="IN_PROGRESS">{isFa ? 'در حال اجرا' : 'In Progress'}</option>
                          <option value="DONE">{isFa ? 'تکمیل‌شده' : 'Done'}</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-end">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(task)}
                            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                            aria-label="Edit task"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(task)}
                              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-neutral-500 hover:text-red-600"
                              aria-label="Delete task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Task Modal */}
      <AnimatePresence>
        {modalOpen && (
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
              data-testid="task-modal"
              className="w-full max-w-lg rounded-2xl ios-glass-strong bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <h2 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  {editingTask
                    ? isFa
                      ? 'ویرایش وظیفه سازمانی'
                      : 'Edit Task Configuration'
                    : isFa
                      ? 'تعریف و تخصیص وظیفه جدید'
                      : 'Create & Assign New Task'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close task modal"
                  className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveTask} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'عنوان وظیفه' : 'Task Title'}
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={isFa ? 'مثال: بررسی گزارش فنی خط تولید' : 'e.g., Implement Redis Sentinel failover check'}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'توضیحات و معیارهای پذیرش' : 'Description'}
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={isFa ? 'شرح دقیق تکلیف، زمان‌بندی یا نکات...' : 'Acceptance criteria, links, or notes...'}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {!editingTask && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        {isFa ? 'کانال مرتبط' : 'Channel'}
                      </label>
                      <select
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      >
                        {channels
                          .filter((c) => c.type !== 'DM')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              #{c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'کارمند / مسئول انجام' : 'Assignee'}
                    </label>
                    <select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      data-testid="task-assignee-select"
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                    >
                      <option value="">{isFa ? 'بدون مسئول' : 'Unassigned'}</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'اولویت' : 'Priority'}
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as TaskPriority)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                    >
                      <option value="LOW">{isFa ? 'کم' : 'Low'}</option>
                      <option value="MEDIUM">{isFa ? 'متوسط' : 'Medium'}</option>
                      <option value="HIGH">{isFa ? 'بالا' : 'High'}</option>
                      <option value="URGENT">{isFa ? 'فوری' : 'Urgent'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'وضعیت' : 'Status'}
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TaskStatus)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                    >
                      <option value="TODO">{isFa ? 'در صف انجام' : 'To Do'}</option>
                      <option value="IN_PROGRESS">{isFa ? 'در حال اجرا' : 'In Progress'}</option>
                      <option value="DONE">{isFa ? 'تکمیل‌شده' : 'Done'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'تاریخ سررسید' : 'Due Date'}
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3.5 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200"
                  >
                    {isFa ? 'انصراف' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !title.trim()}
                    data-testid="task-submit-button"
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {submitting
                      ? isFa
                        ? 'در حال ثبت...'
                        : 'Saving...'
                      : editingTask
                        ? isFa
                          ? 'ذخیره تغییرات'
                          : 'Save Changes'
                        : isFa
                          ? 'ثبت و تخصیص وظیفه'
                          : 'Create Task'}
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
