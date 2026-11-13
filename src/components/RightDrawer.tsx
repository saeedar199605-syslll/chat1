import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Link2,
  MessageSquare,
  Pin,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { DateField } from './JalaliDatePicker';
import { api } from '../lib/api';
import { getSharedSocket } from '../hooks/useSocket';
import { useAppStore } from '../store/useAppStore';
import { canPerformWithMatrix, formatBytes, formatLocalTime, replaceFileExtension } from '../utils/chatLogic';
import { formatAppDate } from '../utils/jalali';
import { convertPdfSourceToDocxBlob, renderPdfPageToPngBlob, triggerBlobDownload } from '../utils/pdfTools';
import { tipProps } from './GlassTooltip';
import { MessageItem } from './MessageItem';
import { UserAvatar } from './UserAvatar';
import type { Attachment, Channel, Message, TaskPriority, TaskStatus, User } from '../types/index';

interface RightDrawerProps {
  channel: Channel | undefined;
  channels: Channel[];
  messages: Message[];
  directoryUsers: User[];
  onReact: (messageId: string, emoji: string) => void;
  onVotePoll: (pollId: string, optionId: string) => void;
  onToggleTask: (taskId: string, status: TaskStatus) => void;
  onPin: (messageId: string) => void;
  onBookmark: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onForward: (messageId: string, targetChannelId: string) => void;
  onOpenDm: (userId: string) => void;
}

export function RightDrawer({
  channel,
  channels,
  messages,
  directoryUsers,
  onReact,
  onVotePoll,
  onToggleTask,
  onPin,
  onBookmark,
  onEdit,
  onDelete,
  onForward,
  onOpenDm,
}: RightDrawerProps) {
  const drawerTab = useAppStore((s) => s.drawerTab);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);
  const activeThreadMessageId = useAppStore((s) => s.activeThreadMessageId);
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const setPreviewFile = useAppStore((s) => s.setPreviewFile);
  const openPdfStudio = useAppStore((s) => s.openPdfStudio);
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const wikiCursorsByChannel = useAppStore((s) => s.wikiCursorsByChannel);
  const showToast = useAppStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';

  const handleDrawerFileContextMenu = (e: React.MouseEvent, file: Attachment) => {
    e.preventDefault();
    e.stopPropagation();
    const isPdf = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.fileName);
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: file.fileName,
      items: [
        {
          id: 'drawer-preview',
          icon: Eye,
          label: isFa ? 'بررسی سریع و پیش‌نمایش' : 'Quick Review & Preview',
          onSelect: () => setPreviewFile(file),
        },
        ...(isPdf
          ? [
              {
                id: 'drawer-png',
                icon: FileImage,
                label: isFa ? 'تبدیل PDF به تصویر (PNG)' : 'Convert PDF → PNG',
                onSelect: async () => {
                  try {
                    const blob = await renderPdfPageToPngBlob(file.url, 1, 2.0);
                    const out = replaceFileExtension(file.fileName, 'png');
                    triggerBlobDownload(blob, out);
                    showToast(isFa ? `تصویر ${out} آماده و دانلود شد` : `Converted & downloaded ${out}`);
                  } catch (err) {
                    showToast((err as Error).message, 'error');
                  }
                },
              },
              {
                id: 'drawer-docx',
                icon: FileSpreadsheet,
                label: isFa ? 'تبدیل PDF به Word (.docx)' : 'Convert PDF → Word (.docx)',
                onSelect: async () => {
                  try {
                    const { blob } = await convertPdfSourceToDocxBlob(file.url, file.fileName.replace(/\.pdf$/i, ''));
                    const out = replaceFileExtension(file.fileName, 'docx');
                    triggerBlobDownload(blob, out);
                    showToast(isFa ? `فایل ورد ${out} دانلود شد` : `Converted & downloaded ${out}`);
                  } catch (err) {
                    showToast((err as Error).message, 'error');
                  }
                },
              },
              {
                id: 'drawer-studio',
                icon: Sparkles,
                label: isFa ? 'باز کردن در استودیو PDF' : 'Open in PDF Studio',
                onSelect: () => openPdfStudio(file),
              },
            ]
          : []),
        {
          id: 'drawer-link',
          icon: Link2,
          label: isFa ? 'کپی لینک فایل' : 'Copy File Link',
          dividerAbove: true,
          onSelect: () => {
            navigator.clipboard?.writeText(window.location.origin + file.url).catch(() => {});
            showToast(isFa ? 'لینک فایل کپی شد' : 'File link copied');
          },
        },
        {
          id: 'drawer-dl',
          icon: Download,
          label: isFa ? 'دانلود فایل' : 'Download File',
          onSelect: () => {
            const a = document.createElement('a');
            a.href = file.url;
            a.download = file.fileName;
            a.click();
          },
        },
      ],
    });
  };

  const [threadReply, setThreadReply] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'image' | 'video' | 'document'>('all');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [wikiTitle, setWikiTitle] = useState('');
  const [wikiContent, setWikiContent] = useState('');
  const [wikiDirty, setWikiDirty] = useState(false);

  const threadQuery = useQuery({
    queryKey: ['thread', activeThreadMessageId],
    queryFn: () => api.getThread(activeThreadMessageId!),
    enabled: drawerTab === 'thread' && Boolean(activeThreadMessageId),
  });

  const filesQuery = useQuery({
    queryKey: ['channel-files', channel?.id, fileTypeFilter],
    queryFn: () => api.getFiles({ channelId: channel!.id, type: fileTypeFilter }),
    enabled: drawerTab === 'files' && Boolean(channel?.id),
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', channel?.id],
    queryFn: () => api.getTasks(channel!.id),
    enabled: drawerTab === 'tasks' && Boolean(channel?.id),
  });

  const wikiQuery = useQuery({
    queryKey: ['wiki', channel?.id],
    queryFn: () => api.getWiki(channel!.id),
    enabled: drawerTab === 'wiki' && Boolean(channel?.id),
  });

  const membersQuery = useQuery({
    queryKey: ['channel-members', channel?.id],
    queryFn: () => api.getChannelMembers(channel!.id),
    enabled: drawerTab === 'members' && Boolean(channel?.id),
  });

  useEffect(() => {
    if (wikiQuery.data?.wiki && !wikiDirty) {
      setWikiTitle(wikiQuery.data.wiki.title);
      setWikiContent(wikiQuery.data.wiki.content);
    } else if (wikiQuery.data && !wikiQuery.data.wiki && !wikiDirty && channel) {
      setWikiTitle(isFa ? `#${channel.name} — دانش‌نامه واحد` : `#${channel.name} — Knowledge Base`);
      setWikiContent(
        isFa
          ? `# #${channel.name}\n\nدستورالعمل‌ها، صورت‌جلسات و مستندات واحد را اینجا بنویسید.`
          : `# #${channel.name}\n\nAdd SOPs, meeting notes, and department playbooks here.`
      );
    }
  }, [wikiQuery.data, wikiDirty, channel, isFa]);

  useEffect(() => {
    setWikiDirty(false);
  }, [channel?.id]);

  if (drawerTab === 'none' || !channel) return null;

  const activeCursors = Object.values(wikiCursorsByChannel[channel.id] || {}).filter(
    (c) => c.userId !== currentUser?.id && Date.now() - c.updatedAt < 15000
  );

  const pinnedMessages = messages.filter((m) => m.isPinned && !m.deletedAt);

  const handleSendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadReply.trim() || !activeThreadMessageId) return;
    await api.postMessage(channel.id, {
      content: threadReply.trim(),
      parentId: activeThreadMessageId,
    });
    setThreadReply('');
    queryClient.invalidateQueries({ queryKey: ['thread', activeThreadMessageId] });
    queryClient.invalidateQueries({ queryKey: ['messages', channel.id] });
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    await api.createTask(channel.id, {
      title: newTaskTitle.trim(),
      assigneeId: newTaskAssignee || null,
      dueDate: newTaskDue || null,
      priority: newTaskPriority,
    });
    setNewTaskTitle('');
    setNewTaskAssignee('');
    setNewTaskDue('');
    setNewTaskPriority('MEDIUM');
    queryClient.invalidateQueries({ queryKey: ['tasks', channel.id] });
    queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
    showToast(isFa ? 'وظیفه به کانال اضافه شد' : 'Action item added to channel');
  };

  const handleWikiEdit = (nextTitle: string, nextContent: string, cursorOffset: number) => {
    setWikiTitle(nextTitle);
    setWikiContent(nextContent);
    setWikiDirty(true);
    const sock = getSharedSocket();
    sock?.emit('wiki:edit', { channelId: channel.id, title: nextTitle, content: nextContent });
    sock?.emit('wiki:cursor', { channelId: channel.id, offset: cursorOffset });
  };

  const handleSaveWiki = async () => {
    await api.saveWiki(channel.id, wikiTitle, wikiContent);
    setWikiDirty(false);
    queryClient.invalidateQueries({ queryKey: ['wiki', channel.id] });
    showToast(isFa ? 'دانش‌نامه کانال ذخیره شد' : 'Channel Wiki saved');
  };

  const titles: Record<string, { label: string; icon: typeof MessageSquare }> = {
    thread: { label: isFa ? 'رشته گفتگو' : 'Thread', icon: MessageSquare },
    files: { label: isFa ? 'فایل‌ها و پیوندها' : 'Files & Links', icon: FolderOpen },
    wiki: { label: isFa ? 'دانش‌نامه مشترک زنده' : 'Live Collaborative Wiki', icon: FileText },
    tasks: { label: isFa ? 'وظایف کانال' : 'Action Items', icon: CheckCircle2 },
    pinned: { label: isFa ? 'پیام‌های سنجاق‌شده' : 'Pinned Messages', icon: Pin },
    members: { label: isFa ? 'اعضای کانال' : 'Channel Members', icon: Users },
  };
  const HeaderIcon = titles[drawerTab]?.icon || FileText;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="w-full sm:w-[360px] shrink-0 h-full ios-glass bg-white dark:bg-neutral-900 border-s border-neutral-200 dark:border-neutral-800 flex flex-col z-20"
    >
      {/* Drawer Header */}
      <div className="h-14 px-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <HeaderIcon className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <h3 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
            {titles[drawerTab]?.label}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setDrawerTab('none')}
          aria-label="Close drawer"
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto">
        {/* 1. THREAD PANEL */}
        {drawerTab === 'thread' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
              {threadQuery.data?.parent && (
                <div className="py-2 bg-neutral-50/70 dark:bg-neutral-800/30">
                  <MessageItem
                    message={threadQuery.data.parent}
                    channels={channels}
                    isThreadView
                    onReact={onReact}
                    onVotePoll={onVotePoll}
                    onToggleTask={onToggleTask}
                    onConvertTask={() => {}}
                    onPin={onPin}
                    onBookmark={onBookmark}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onForward={onForward}
                  />
                </div>
              )}
              <div className="py-2">
                <div className="px-4 py-1 text-[11px] font-medium text-neutral-500">
                  {threadQuery.data?.replies.length || 0} {isFa ? 'پاسخ' : 'replies'}
                </div>
                {threadQuery.data?.replies.map((reply) => (
                  <MessageItem
                    key={reply.id}
                    message={reply}
                    channels={channels}
                    isThreadView
                    onReact={onReact}
                    onVotePoll={onVotePoll}
                    onToggleTask={onToggleTask}
                    onConvertTask={() => {}}
                    onPin={onPin}
                    onBookmark={onBookmark}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onForward={onForward}
                  />
                ))}
              </div>
            </div>

            <form
              onSubmit={handleSendThreadReply}
              className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2"
            >
              <input
                type="text"
                value={threadReply}
                onChange={(e) => setThreadReply(e.target.value)}
                placeholder={isFa ? 'پاسخ در رشته گفتگو...' : 'Reply in thread...'}
                aria-label="Thread reply"
                className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <button
                type="submit"
                disabled={!threadReply.trim()}
                aria-label="Send thread reply"
                className="p-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* 2. FILES & LINKS REPOSITORY */}
        {drawerTab === 'files' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
              {(
                [
                  { id: 'all', label: isFa ? 'همه' : 'All' },
                  { id: 'image', label: isFa ? 'تصویر' : 'Image' },
                  { id: 'video', label: isFa ? 'ویدیو' : 'Video' },
                  { id: 'document', label: isFa ? 'اسناد' : 'Document' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFileTypeFilter(f.id)}
                  className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    fileTypeFilter === f.id
                      ? 'ios-glass-selected'
                      : 'text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filesQuery.data?.files.length === 0 ? (
              <div className="py-10 text-center text-xs text-neutral-500">
                {isFa ? 'هنوز فایلی در این کانال ثبت نشده است.' : 'No files indexed in this channel yet. Drag and drop files into the composer to share.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filesQuery.data?.files.map((file) => {
                  const canDelete =
                    file.uploaderId === currentUser?.id ||
                    canPerformWithMatrix(currentUser, 'file:delete_any', channel.type, rbacMatrix);
                  return (
                    <div
                      key={file.id}
                      onContextMenu={(e) => handleDrawerFileContextMenu(e, file)}
                      className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-start"
                      >
                        <FileText className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {file.fileName}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-mono tabular-nums">
                            {formatBytes(file.sizeBytes)} · {file.uploaderName}
                          </div>
                        </div>
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={async () => {
                            await api.deleteFile(file.id);
                            queryClient.invalidateQueries({ queryKey: ['channel-files', channel.id] });
                          }}
                          aria-label={`Delete ${file.fileName}`}
                          className="p-1 text-neutral-400 hover:text-red-600 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. LIVE COLLABORATIVE WIKI */}
        {drawerTab === 'wiki' && (
          <div className="p-4 flex flex-col h-full space-y-3">
            <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span>
                v{wikiQuery.data?.wiki?.version || 1} · {isFa ? 'ویرایش:' : 'Updated by'} {wikiQuery.data?.wiki?.updatedByName || currentUser?.displayName}
              </span>
              <button
                type="button"
                onClick={handleSaveWiki}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600 text-white font-medium hover:bg-red-700"
              >
                <Save className="w-3 h-3" />
                <span>{isFa ? 'ذخیره نسخه' : 'Save Snapshot'}</span>
              </button>
            </div>

            {activeCursors.length > 0 && (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>
                  {isFa ? 'در حال ویرایش همزمان:' : 'Live editing:'}{' '}
                  {activeCursors.map((c) => `${c.displayName} (${isFa ? 'کاراکتر' : 'char'} ${c.offset})`).join('، ')}
                </span>
              </div>
            )}

            <input
              type="text"
              value={wikiTitle}
              onChange={(e) => handleWikiEdit(e.target.value, wikiContent, e.target.selectionStart || 0)}
              aria-label="Wiki document title"
              className="w-full px-3 py-2 text-sm font-display font-semibold rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
            />

            <textarea
              value={wikiContent}
              onChange={(e) => handleWikiEdit(wikiTitle, e.target.value, e.target.selectionStart || 0)}
              aria-label="Collaborative wiki markdown content"
              className="flex-1 min-h-[340px] w-full p-3 text-xs font-mono leading-relaxed rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 resize-none focus:outline-none focus:border-red-500"
            />
          </div>
        )}

        {/* 4. TASKS / ACTION ITEMS */}
        {drawerTab === 'tasks' && (
          <div className="p-4 space-y-4">
            <form onSubmit={handleCreateTask} className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/70 border border-neutral-200 dark:border-neutral-700 space-y-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder={isFa ? 'عنوان وظیفه جدید...' : 'New action item...'}
                aria-label="New task title"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
              />
              <div className="grid grid-cols-3 gap-1.5">
                <select
                  value={newTaskAssignee}
                  onChange={(e) => setNewTaskAssignee(e.target.value)}
                  aria-label="Task assignee"
                  className="px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
                >
                  <option value="">{isFa ? 'بدون مسئول' : 'Unassigned'}</option>
                  {directoryUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                  aria-label="Task priority"
                  className="px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
                >
                  <option value="LOW">{isFa ? 'کم' : 'Low'}</option>
                  <option value="MEDIUM">{isFa ? 'متوسط' : 'Medium'}</option>
                  <option value="HIGH">{isFa ? 'بالا' : 'High'}</option>
                  <option value="URGENT">{isFa ? 'فوری' : 'Urgent'}</option>
                </select>
                <DateField
                  value={newTaskDue}
                  onChange={setNewTaskDue}
                  ariaLabel="Task due date"
                  className="px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
                />
              </div>
              <button
                type="submit"
                disabled={!newTaskTitle.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'افزودن وظیفه' : 'Add Action Item'}</span>
              </button>
            </form>

            <div className="space-y-2">
              {tasksQuery.data?.tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-xs font-medium ${
                        task.status === 'DONE'
                          ? 'line-through text-neutral-400'
                          : 'text-neutral-900 dark:text-neutral-100'
                      }`}
                    >
                      {task.title}
                    </span>
                    <select
                      value={task.status}
                      onChange={(e) => onToggleTask(task.id, e.target.value as TaskStatus)}
                      aria-label={`Status for ${task.title}`}
                      className="px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 shrink-0"
                    >
                      <option value="TODO">{isFa ? 'در صف' : 'To Do'}</option>
                      <option value="IN_PROGRESS">{isFa ? 'در حال اجرا' : 'In Progress'}</option>
                      <option value="DONE">{isFa ? 'تکمیل‌شده' : 'Done'}</option>
                    </select>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                    <span>
                      {isFa
                        ? task.priority === 'URGENT'
                          ? 'فوری'
                          : task.priority === 'HIGH'
                            ? 'بالا'
                            : task.priority === 'LOW'
                              ? 'کم'
                              : 'متوسط'
                        : task.priority || 'MEDIUM'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{task.assigneeName || (isFa ? 'بدون مسئول' : 'Unassigned')}</span>
                    {task.dueDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {isFa
                            ? `سررسید ${formatAppDate(task.dueDate, { calendarSystem, locale })}`
                            : `Due ${formatAppDate(task.dueDate, { calendarSystem, locale })}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. PINNED MESSAGES */}
        {drawerTab === 'pinned' && (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {pinnedMessages.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                {isFa ? `پیام سنجاق‌شده‌ای در #${channel.name} وجود ندارد.` : `No pinned messages in #${channel.name}.`}
              </div>
            ) : (
              pinnedMessages.map((pm) => (
                <MessageItem
                  key={pm.id}
                  message={pm}
                  channels={channels}
                  isThreadView
                  onReact={onReact}
                  onVotePoll={onVotePoll}
                  onToggleTask={onToggleTask}
                  onConvertTask={() => {}}
                  onPin={onPin}
                  onBookmark={onBookmark}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onForward={onForward}
                />
              ))
            )}
          </div>
        )}

        {/* 6. CHANNEL MEMBERS + ADD COLLEAGUES */}
        {drawerTab === 'members' && (
          <div className="p-3 space-y-4">
            <div className="space-y-1">
              {membersQuery.data?.members.map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/60 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar name={m.displayName} avatarUrl={m.avatarUrl} presence={m.presence} size="sm" showPresence />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {m.displayName}
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {m.jobTitle} · <span className="font-mono tabular-nums">{formatLocalTime(m.timezone)}</span>
                      </div>
                    </div>
                  </div>
                  {m.id !== currentUser?.id && (
                    <button
                      type="button"
                      onClick={() => onOpenDm(m.id)}
                      className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
                    >
                      {isFa ? 'پیام' : 'Message'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {channel.type !== 'DM' && (() => {
              const memberIdSet = new Set((membersQuery.data?.members || []).map((m) => m.id));
              const nonMembers = directoryUsers.filter((u) => !memberIdSet.has(u.id));
              if (nonMembers.length === 0) return null;
              return (
                <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                  <div className="px-2 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-red-600" />
                    <span>{isFa ? 'افزودن همکاران دیگر به این فضا' : 'Invite or Add Colleagues'}</span>
                  </div>
                  <div className="space-y-1.5">
                    {nonMembers.map((u) => {
                      const isReq = u.groupAddPolicy === 'REQUEST';
                      return (
                        <div
                          key={u.id}
                          className="p-2 rounded-xl bg-neutral-50/80 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} presence={u.presence} size="xs" />
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                {u.displayName}
                              </div>
                              <div className="text-[10px] text-neutral-500 truncate">
                                {isReq
                                  ? isFa
                                    ? 'ارسال درخواست تأیید'
                                    : 'Requires invite approval'
                                  : isFa
                                    ? 'عضویت مستقیم'
                                    : 'Direct add'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid={`drawer-add-member-${u.id}`}
                            onClick={async () => {
                              try {
                                const res = await api.addChannelMembers(channel.id, [u.id]);
                                queryClient.invalidateQueries({ queryKey: ['channel-members', channel.id] });
                                queryClient.invalidateQueries({ queryKey: ['channels'] });
                                if (res.requestedUserIds.length > 0) {
                                  showToast(
                                    isFa
                                      ? `درخواست عضویت برای ${u.displayName} ارسال شد`
                                      : `Invitation request sent to ${u.displayName}`
                                  );
                                } else {
                                  showToast(
                                    isFa
                                      ? `${u.displayName} به فضا اضافه شد`
                                      : `${u.displayName} added`
                                  );
                                }
                              } catch (err) {
                                showToast((err as Error).message, 'error');
                              }
                            }}
                            {...tipProps(
                              isReq ? 'ارسال دعوت‌نامه عضویت برای تأیید همکار' : 'افزودن فوری همکار به گروه',
                              isReq ? 'Send group invitation request' : 'Add colleague directly'
                            )}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ios-glass-selected text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>{isReq ? (isFa ? 'دعوت' : 'Invite') : isFa ? 'افزودن' : 'Add'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </motion.aside>
  );
}
