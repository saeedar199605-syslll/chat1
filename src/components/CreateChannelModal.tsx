import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Hash, ShieldQuestion, UserPlus, Users, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { tipProps } from './GlassTooltip';
import { UserAvatar } from './UserAvatar';
import type { User } from '../types/index';

interface CreateChannelModalProps {
  directoryUsers: User[];
  onCreate: (payload: { name: string; description: string; type: 'PUBLIC' | 'PRIVATE' | 'ANNOUNCEMENT' }) => Promise<void>;
  onCreateGroup: (payload: { name: string; description: string; memberIds: string[] }) => Promise<void>;
}

export function CreateChannelModal({ directoryUsers, onCreate, onCreateGroup }: CreateChannelModalProps) {
  const createChannelOpen = useAppStore((s) => s.createChannelOpen);
  const createChannelInitialMode = useAppStore((s) => s.createChannelInitialMode);
  const setCreateChannelOpen = useAppStore((s) => s.setCreateChannelOpen);
  const currentUser = useAppStore((s) => s.currentUser);
  const locale = useAppStore((s) => s.locale);
  const isFa = locale === 'fa';

  const [mode, setMode] = useState<'channel' | 'group'>('channel');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'PUBLIC' | 'PRIVATE' | 'ANNOUNCEMENT'>('PUBLIC');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (createChannelOpen) {
      setMode(createChannelInitialMode || 'channel');
      setError('');
    }
  }, [createChannelOpen, createChannelInitialMode]);

  const toggleMember = (uid: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError(
        mode === 'group'
          ? isFa
            ? 'نام گروه باید حداقل ۲ کاراکتر باشد.'
            : 'Group name must be at least 2 characters.'
          : isFa
            ? 'نام کانال باید حداقل ۲ کاراکتر باشد.'
            : 'Channel name must be at least 2 characters.'
      );
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'group') {
        await onCreateGroup({
          name: name.trim(),
          description: description.trim(),
          memberIds: selectedMemberIds,
        });
      } else {
        await onCreate({ name: name.trim(), description: description.trim(), type });
      }
      setName('');
      setDescription('');
      setSelectedMemberIds([]);
      setCreateChannelOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const candidateMembers = directoryUsers.filter((u) => u.id !== currentUser?.id);

  return (
    <AnimatePresence>
      {createChannelOpen && (
        <motion.div
          role="dialog"
          aria-label={isFa ? 'ایجاد کانال یا گروه جدید' : 'Create new channel or group'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="w-full max-w-lg rounded-3xl ios-glass-strong bg-white/95 dark:bg-neutral-900/95 border border-white/60 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
          >
            <div className="h-14 px-5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between shrink-0">
              <h3 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {mode === 'group'
                  ? isFa
                    ? 'ایجاد گروه کاری و افزودن اعضا'
                    : 'Create Work Group & Add Members'
                  : isFa
                    ? 'ایجاد کانال سازمانی جدید'
                    : 'Create Organizational Channel'}
              </h3>
              <button
                type="button"
                onClick={() => setCreateChannelOpen(false)}
                aria-label={isFa ? 'بستن پنجره' : 'Close create modal'}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="px-5 pt-4 shrink-0">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-neutral-100/90 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60">
                <button
                  type="button"
                  data-testid="create-mode-channel"
                  onClick={() => setMode('channel')}
                  {...tipProps('ایجاد کانال عمومی، خصوصی یا اطلاع‌رسانی', 'Create Public, Private, or Announcement channel')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    mode === 'channel'
                      ? 'ios-glass-selected'
                      : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Hash className="w-3.5 h-3.5" />
                  <span>{isFa ? 'کانال سازمانی' : 'Channel'}</span>
                </button>
                <button
                  type="button"
                  data-testid="create-mode-group"
                  onClick={() => setMode('group')}
                  {...tipProps('ایجاد گروه با انتخاب همکاران و رعایت حریم افزودن (مستقیم/درخواستی)', 'Create multi-member group respecting Direct vs Request join policy')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    mode === 'group'
                      ? 'ios-glass-selected'
                      : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{isFa ? 'گروه کاری جدید' : 'Work Group'}</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              {error && (
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="ch-name" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {mode === 'group' ? (isFa ? 'نام گروه' : 'Group Name') : isFa ? 'نام کانال' : 'Channel Name'}
                </label>
                <input
                  id="ch-name"
                  data-testid="create-channel-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    mode === 'group'
                      ? isFa
                        ? 'مثلاً تیم پشتیبانی پروژه اصفهان'
                        : 'e.g. Esfahan Launch Squad'
                      : isFa
                        ? 'مثلاً عملیات-فروش-اصفهان'
                        : 'e.g. q4-launch-warroom'
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                />
              </div>

              {mode === 'channel' && (
                <div className="space-y-1.5">
                  <label htmlFor="ch-type" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {isFa ? 'نوع دسترسی کانال' : 'Channel Access Type'}
                  </label>
                  <select
                    id="ch-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as 'PUBLIC' | 'PRIVATE' | 'ANNOUNCEMENT')}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                  >
                    <option value="PUBLIC">
                      {isFa ? 'عمومی — همه اعضای سازمان می‌توانند عضو شوند' : 'Public — Any workspace member can join'}
                    </option>
                    <option value="PRIVATE">
                      {isFa ? 'خصوصی — محرمانه و فقط با دعوت‌نامه' : 'Private — Invite-only confidential channel'}
                    </option>
                    <option value="ANNOUNCEMENT">
                      {isFa ? 'اطلاع‌رسانی — ارسال فقط برای مدیران' : 'Announcement — Read-only broadcast for Members'}
                    </option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="ch-desc" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {isFa ? 'توضیحات' : 'Description'}
                </label>
                <input
                  id="ch-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={isFa ? 'هدف و موضوع این فضا چیست؟' : 'What is this space focused on?'}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                />
              </div>

              {mode === 'group' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-red-600" />
                      <span>{isFa ? 'انتخاب اعضای گروه' : 'Select Group Members'}</span>
                    </span>
                    <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
                      {selectedMemberIds.length} {isFa ? 'انتخاب‌شده' : 'selected'}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-2xl bg-neutral-50/80 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
                    {candidateMembers.map((u) => {
                      const selected = selectedMemberIds.includes(u.id);
                      const requiresRequest = u.groupAddPolicy === 'REQUEST';
                      return (
                        <button
                          key={u.id}
                          type="button"
                          data-testid={`group-member-pick-${u.id}`}
                          onClick={() => toggleMember(u.id)}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-start text-xs transition-all cursor-pointer ${
                            selected
                              ? 'ios-glass-selected-soft text-red-900 dark:text-red-100 font-semibold'
                              : 'hover:bg-white dark:hover:bg-neutral-800/80 text-neutral-800 dark:text-neutral-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} presence={u.presence} size="xs" />
                            <div className="min-w-0">
                              <div className="truncate">{u.displayName}</div>
                              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                {u.department}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                requiresRequest
                                  ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                                  : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                              }`}
                            >
                              {requiresRequest && <ShieldQuestion className="w-2.5 h-2.5" />}
                              {requiresRequest
                                ? isFa
                                  ? 'نیاز به تأیید'
                                  : 'Request'
                                : isFa
                                  ? 'عضویت مستقیم'
                                  : 'Direct'}
                            </span>
                            <span
                              className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                                selected
                                  ? 'bg-red-600 border-red-600 text-white'
                                  : 'border-neutral-300 dark:border-neutral-600'
                              }`}
                            >
                              {selected && <Check className="w-3 h-3" />}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateChannelOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0 transition-colors"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  data-testid="create-channel-submit-btn"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl ios-glass-selected text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {submitting
                    ? isFa
                      ? 'در حال ایجاد...'
                      : 'Creating...'
                    : mode === 'group'
                      ? isFa
                        ? 'ایجاد گروه و ارسال دعوت'
                        : 'Create Group'
                      : isFa
                        ? 'ایجاد کانال'
                        : 'Create Channel'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
