import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, Hash, MessageSquare, RotateCcw, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { formatAppDate } from '../utils/jalali';

interface ArchiveViewProps {
  workspaceId: string;
  onJumpToChannel: (channelId: string) => void;
}

export function ArchiveView({ workspaceId, onJumpToChannel }: ArchiveViewProps) {
  const showToast = useAppStore((s) => s.showToast);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';

  const [tab, setTab] = useState<'channels' | 'messages' | 'tasks'>('messages');
  const [query, setQuery] = useState('');

  const archiveQuery = useQuery({
    queryKey: ['archive', workspaceId],
    queryFn: () => api.getArchive(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const archivedChannels = (archiveQuery.data?.channels || []).filter(
    (c) => !query.trim() || c.name.toLowerCase().includes(query.toLowerCase())
  );
  const archivedMessages = (archiveQuery.data?.messages || []).filter(
    (m) =>
      !query.trim() ||
      m.content.toLowerCase().includes(query.toLowerCase()) ||
      m.author.displayName.toLowerCase().includes(query.toLowerCase())
  );
  const completedTasks = (archiveQuery.data?.tasks || []).filter(
    (t) =>
      !query.trim() ||
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      (t.assigneeName || '').toLowerCase().includes(query.toLowerCase())
  );

  const handleRestoreChannel = async (channelId: string, name: string) => {
    try {
      await api.unarchiveChannel(channelId);
      queryClient.invalidateQueries({ queryKey: ['archive'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      showToast(isFa ? `کانال #${name} بازیابی شد` : `Restored #${name}`);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRestoreMessage = async (messageId: string, channelId: string) => {
    try {
      await api.unarchiveMessage(messageId);
      queryClient.invalidateQueries({ queryKey: ['archive'] });
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
      showToast(isFa ? 'پیام به کانال بازگردانده شد' : 'Message restored to channel');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleReopenTask = async (taskId: string) => {
    await api.updateTask(taskId, { status: 'TODO' });
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
    showToast(isFa ? 'وظیفه به تخته فعال بازگردانده شد' : 'Task reopened to active board');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <Archive className="w-4 h-4 text-red-600 dark:text-red-400" />
          <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100">
            {isFa ? 'بایگانی و آرشیو اسناد اصفهان چالاک' : 'Workspace Archive & Retention Vault'}
          </h1>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => setTab('messages')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
              tab === 'messages'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-300'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{isFa ? `پیام‌ها (${archivedMessages.length})` : `Messages (${archivedMessages.length})`}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('channels')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
              tab === 'channels'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-300'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>{isFa ? `کانال‌ها (${archivedChannels.length})` : `Channels (${archivedChannels.length})`}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('tasks')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
              tab === 'tasks'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isFa ? `وظایف تکمیل‌شده (${completedTasks.length})` : `Completed Tasks (${completedTasks.length})`}</span>
          </button>
        </div>
      </header>

      <div className="px-6 py-3 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        <div className="relative max-w-sm">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isFa ? 'فیلتر موارد بایگانی‌شده...' : 'Filter archived records...'}
            aria-label="Filter archived records"
            className="w-full ps-8 pe-3 py-1.5 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl space-y-3">
        {tab === 'messages' && (
          archivedMessages.length === 0 ? (
            <div className="p-10 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-500">
              {isFa
                ? 'هنوز پیامی بایگانی نشده است. روی پیام کلیک راست کنید و بایگانی را انتخاب نمایید.'
                : 'No archived messages yet. Hover any message in a channel and click Archive to move it here.'}
            </div>
          ) : (
            archivedMessages.map((msg) => (
              <div
                key={msg.id}
                className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {msg.author.displayName}
                    </span>
                    {msg.channelName && (
                      <>
                        <span className="text-neutral-300 dark:text-neutral-700">·</span>
                        <span className="text-red-600 dark:text-red-400">#{msg.channelName}</span>
                      </>
                    )}
                    {msg.archivedAt && (
                      <>
                        <span className="text-neutral-300 dark:text-neutral-700">·</span>
                        <span className="font-mono tabular-nums text-[11px] text-neutral-400">
                          {isFa ? 'بایگانی:' : 'Archived'}{' '}
                          {formatAppDate(msg.archivedAt, { calendarSystem, locale })}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">{msg.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestoreMessage(msg.id, msg.channelId)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 hover:text-red-600 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isFa ? 'بازگردانی' : 'Restore'}</span>
                </button>
              </div>
            ))
          )
        )}

        {tab === 'channels' && (
          archivedChannels.length === 0 ? (
            <div className="p-10 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-500">
              {isFa
                ? 'کانال بایگانی‌شده‌ای وجود ندارد.'
                : 'No archived channels. Admins and Managers can archive inactive channels from the channel header.'}
            </div>
          ) : (
            archivedChannels.map((ch) => (
              <div
                key={ch.id}
                className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                    #{ch.name}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                    {ch.description || ch.topic || (isFa ? 'کانال بایگانی‌شده' : 'Archived workspace channel')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestoreChannel(ch.id, ch.name)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isFa ? 'بازگردانی کانال' : 'Restore Channel'}</span>
                </button>
              </div>
            ))
          )
        )}

        {tab === 'tasks' && (
          completedTasks.length === 0 ? (
            <div className="p-10 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-500">
              {isFa ? 'وظیفه تکمیل‌شده‌ای در بایگانی نیست.' : 'No completed tasks archived yet.'}
            </div>
          ) : (
            completedTasks.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{t.title}</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center gap-2">
                    {t.channelName && (
                      <button
                        type="button"
                        onClick={() => onJumpToChannel(t.channelId)}
                        className="text-red-600 dark:text-red-400 hover:underline"
                      >
                        #{t.channelName}
                      </button>
                    )}
                    <span>· {isFa ? 'مسئول:' : 'Assignee:'} {t.assigneeName || (isFa ? 'نامشخص' : 'Unassigned')}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleReopenTask(t.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 hover:text-red-600 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isFa ? 'بازگشایی مجدد' : 'Reopen'}</span>
                </button>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
