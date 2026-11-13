import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { FileText, Hash, MessageSquare, Search, User as UserIcon, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { formatBytes } from '../utils/chatLogic';
import { formatAppDate } from '../utils/jalali';

interface GlobalSearchModalProps {
  workspaceId: string;
  onJumpToChannel: (channelId: string) => void;
  onOpenDm: (userId: string) => void;
}

const FILTER_CHIPS = [
  'in:#engineering-core',
  'from:@marcus',
  'has:file',
  'before:2026-12-01',
];

export function GlobalSearchModal({
  workspaceId,
  onJumpToChannel,
  onOpenDm,
}: GlobalSearchModalProps) {
  const searchOpen = useAppStore((s) => s.searchOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setPreviewFile = useAppStore((s) => s.setPreviewFile);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const isFa = locale === 'fa';
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(!useAppStore.getState().searchOpen);
      } else if (e.key === 'Escape' && useAppStore.getState().searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen]);

  const searchQuery = useQuery({
    queryKey: ['global-search', workspaceId, query],
    queryFn: () => api.search(query, workspaceId),
    enabled: searchOpen && query.trim().length > 0,
  });

  const data = searchQuery.data;

  return (
    <AnimatePresence>
      {searchOpen && (
        <motion.div
          role="dialog"
          aria-label={isFa ? 'جستجوی سراسری فضای کاری' : 'Global omnibox search'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-neutral-950/60 backdrop-blur-xs flex items-start justify-center pt-16 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="w-full max-w-2xl rounded-2xl ios-glass-strong bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[78vh]"
          >
            <div className="p-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
              <Search className="w-4 h-4 text-red-600 shrink-0" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  isFa
                    ? 'جستجو در پیام‌ها، فایل‌ها، کانال‌ها و همکاران (پشتیبانی از from:@user و in:#channel)'
                    : 'Search messages, files, channels, people (supports from:@user, in:#channel, has:file)'
                }
                aria-label={isFa ? 'عبارت جستجو' : 'Search query'}
                className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label={isFa ? 'بستن جستجو' : 'Close search'}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3.5 py-2 border-b border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center gap-1.5 bg-neutral-50 dark:bg-neutral-900/60">
              <span className="text-[11px] text-neutral-500 me-1">
                {isFa ? 'فیلترهای سریع:' : 'Operators:'}
              </span>
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setQuery((q) => `${q ? `${q.trim()} ` : ''}${chip} `)}
                  className="px-2 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-[11px] text-red-600 dark:text-red-400 hover:border-red-400 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {!query.trim() ? (
                <div className="py-10 text-center text-xs text-neutral-500">
                  {isFa
                    ? 'عبارت مورد نظر را تایپ کنید یا از عملگرهای فیلتر بالا استفاده نمایید.'
                    : 'Type keywords or click a search operator above to filter across channels, files, and people.'}
                </div>
              ) : searchQuery.isLoading ? (
                <div className="py-10 text-center text-xs text-neutral-500">
                  {isFa ? 'در حال جستجو در فضای کاری...' : 'Searching workspace...'}
                </div>
              ) : (
                <>
                  {data && data.channels.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-neutral-500">
                        {isFa ? 'کانال‌ها' : 'Channels'}
                      </div>
                      {data.channels.map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => {
                            onJumpToChannel(ch.id);
                            setSearchOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-start text-xs transition-colors"
                        >
                          <Hash className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">{ch.name}</span>
                          <span className="text-neutral-400 truncate">{ch.topic}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {data && data.people.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-neutral-500">
                        {isFa ? 'همکاران' : 'People'}
                      </div>
                      {data.people.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            onOpenDm(u.id);
                            setSearchOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-start text-xs transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <UserIcon className="w-3.5 h-3.5 text-red-500" />
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">{u.fullName}</span>
                          </span>
                          <span className="text-neutral-400">{u.jobTitle} · {u.department}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {data && data.files.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-neutral-500">
                        {isFa ? 'فایل‌ها' : 'Files'}
                      </div>
                      {data.files.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setPreviewFile(f);
                            setSearchOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-start text-xs transition-colors"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{f.fileName}</span>
                          </span>
                          <span className="text-neutral-400 font-mono tabular-nums shrink-0">
                            #{f.channelName} · {formatBytes(f.sizeBytes)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {data && data.messages.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-neutral-500">
                        {isFa ? 'پیام‌ها' : 'Messages'}
                      </div>
                      {data.messages.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onJumpToChannel(m.channelId);
                            setSearchOpen(false);
                          }}
                          className="w-full p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-red-400 text-start space-y-1 transition-colors"
                        >
                          <div className="flex items-center justify-between text-[11px] text-neutral-500">
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                              <MessageSquare className="w-3 h-3 text-red-500" /> {m.author.displayName}{' '}
                              {isFa ? 'در' : 'in'} #{m.channelName}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatAppDate(m.createdAt, { calendarSystem, locale })}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2">{m.content}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {data &&
                    data.channels.length === 0 &&
                    data.people.length === 0 &&
                    data.files.length === 0 &&
                    data.messages.length === 0 && (
                      <div className="py-8 text-center text-xs text-neutral-500">
                        {isFa ? `نتیجه‌ای برای «${query}» یافت نشد.` : `No matching results for “${query}”.`}
                      </div>
                    )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
