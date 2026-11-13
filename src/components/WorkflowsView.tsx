import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck,
  Plus,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { canPerformWithMatrix } from '../utils/chatLogic';
import { formatAppDate } from '../utils/jalali';
import { UserAvatar } from './UserAvatar';
import type { ApprovalCategory, StandupMood, User } from '../types/index';

interface WorkflowsViewProps {
  users: User[];
}

export function WorkflowsView({ users }: WorkflowsViewProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const showToast = useAppStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';
  const [tab, setTab] = useState<'approvals' | 'standups'>('approvals');

  // New Approval Form
  const [approvalModal, setApprovalModal] = useState(false);
  const [category, setCategory] = useState<ApprovalCategory>('PURCHASE');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [metricLabel, setMetricLabel] = useState('');
  const [approverId, setApproverId] = useState(currentUser?.managerId || '');
  const [reviewNoteById, setReviewNoteById] = useState<Record<string, string>>({});

  // Daily Standup Form
  const [yesterday, setYesterday] = useState('');
  const [today, setToday] = useState('');
  const [blockers, setBlockers] = useState('');
  const [mood, setMood] = useState<StandupMood>('FOCUSED');

  const approvalsQuery = useQuery({
    queryKey: ['approvals'],
    queryFn: api.getApprovals,
  });

  const standupsQuery = useQuery({
    queryKey: ['standups'],
    queryFn: api.getStandups,
  });

  const approvals = approvalsQuery.data?.approvals || [];
  const standups = standupsQuery.data?.standups || [];
  const canReviewAny = canPerformWithMatrix(currentUser, 'approval:review', 'PUBLIC', rbacMatrix);

  const handleSubmitApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createApproval({
        category,
        title: title.trim(),
        details: details.trim(),
        metricLabel: metricLabel.trim() || undefined,
        approverId: approverId || null,
      });
      setTitle('');
      setDetails('');
      setMetricLabel('');
      setApprovalModal(false);
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      showToast(isFa ? 'درخواست تأیید به مدیر مربوطه ارسال شد' : 'Approval request submitted');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.reviewApproval(id, {
        status,
        reviewerNote: reviewNoteById[id]?.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      showToast(
        status === 'APPROVED'
          ? isFa
            ? 'درخواست تأیید شد'
            : 'Request approved'
          : isFa
            ? 'درخواست رد شد'
            : 'Request rejected'
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSubmitStandup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createStandup({
        yesterday: yesterday.trim(),
        today: today.trim(),
        blockers: blockers.trim() || null,
        mood,
      });
      setYesterday('');
      setToday('');
      setBlockers('');
      queryClient.invalidateQueries({ queryKey: ['standups'] });
      showToast(isFa ? 'گزارش کار روزانه ثبت شد' : 'Daily check-in published');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const categoryLabel = (cat: ApprovalCategory) => {
    const map: Record<ApprovalCategory, { fa: string; en: string }> = {
      LEAVE: { fa: 'مرخصی / مأموریت', en: 'Leave' },
      PURCHASE: { fa: 'تأمین و خرید', en: 'Purchase' },
      ACCESS: { fa: 'دسترسی سیستمی', en: 'Access' },
      EXPENSE: { fa: 'هزینه و تنخواه', en: 'Expense' },
    };
    return isFa ? map[cat].fa : map[cat].en;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileCheck className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100 truncate">
            {isFa ? 'گردش کار تأییدیه‌ها و گزارش کار روزانه' : 'Approvals & Daily Check-ins'}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setTab('approvals')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                tab === 'approvals'
                  ? 'bg-white dark:bg-neutral-700 text-red-600 dark:text-red-400 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>{isFa ? `تأییدیه‌ها (${approvals.length})` : `Approvals (${approvals.length})`}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('standups')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                tab === 'standups'
                  ? 'bg-white dark:bg-neutral-700 text-red-600 dark:text-red-400 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{isFa ? `گزارش کار روزانه (${standups.length})` : `Standups (${standups.length})`}</span>
            </button>
          </div>

          {tab === 'approvals' && (
            <button
              type="button"
              onClick={() => setApprovalModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isFa ? 'ثبت درخواست جدید' : 'New Request'}</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-5xl">
        {tab === 'approvals' ? (
          <div className="space-y-3">
            {approvals.map((apr, idx) => {
              const canDecide =
                apr.status === 'PENDING' && (canReviewAny || apr.approverId === currentUser?.id);
              return (
                <motion.div
                  key={apr.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(idx * 0.03, 0.18) }}
                  className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {categoryLabel(apr.category)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isFa ? 'درخواست‌کننده:' : 'Requester:'}{' '}
                          <strong className="text-neutral-800 dark:text-neutral-200">{apr.requesterName}</strong>
                        </span>
                        {apr.approverName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {isFa ? 'تأییدکننده:' : 'Approver:'} {apr.approverName}
                            </span>
                          </>
                        )}
                        {apr.metricLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-neutral-700 dark:text-neutral-300">
                              {apr.metricLabel}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                        {apr.title}
                      </h3>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">{apr.details}</p>
                    </div>

                    <span
                      className={`text-xs font-semibold shrink-0 flex items-center gap-1 ${
                        apr.status === 'APPROVED'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : apr.status === 'REJECTED'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {apr.status === 'APPROVED'
                          ? isFa
                            ? 'تأیید شده'
                            : 'Approved'
                          : apr.status === 'REJECTED'
                            ? isFa
                              ? 'رد شده'
                              : 'Rejected'
                            : isFa
                              ? 'در انتظار بررسی'
                              : 'Pending Review'}
                      </span>
                    </span>
                  </div>

                  {apr.reviewerNote && (
                    <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-300">
                      {isFa ? 'توضیح مدیر:' : 'Reviewer note:'} {apr.reviewerNote}
                    </div>
                  )}

                  {canDecide && (
                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={reviewNoteById[apr.id] || ''}
                        onChange={(e) => setReviewNoteById((p) => ({ ...p, [apr.id]: e.target.value }))}
                        placeholder={isFa ? 'یادداشت مدیر (اختیاری)...' : 'Decision note (optional)...'}
                        className="flex-1 min-w-[180px] px-3 py-1.5 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      />
                      <button
                        type="button"
                        onClick={() => handleReview(apr.id, 'APPROVED')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{isFa ? 'تأیید درخواست' : 'Approve'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReview(apr.id, 'REJECTED')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>{isFa ? 'رد درخواست' : 'Reject'}</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={handleSubmitStandup}
              className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3 h-fit"
            >
              <h2 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {isFa ? 'ثبت گزارش کار روزانه' : 'Log Daily Check-in'}
              </h2>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'اقدامات انجام‌شده (دیروز)' : 'Completed Yesterday'}
                </label>
                <textarea
                  required
                  rows={2}
                  value={yesterday}
                  onChange={(e) => setYesterday(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'برنامه کاری امروز' : 'Focus for Today'}
                </label>
                <textarea
                  required
                  rows={2}
                  value={today}
                  onChange={(e) => setToday(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'موانع یا نیازمندی‌ها (اختیاری)' : 'Blockers (Optional)'}
                </label>
                <input
                  type="text"
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'وضعیت تمرکز' : 'Team Status'}
                </label>
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value as StandupMood)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                >
                  <option value="FOCUSED">{isFa ? 'متمرکز و در مسیر' : 'Focused'}</option>
                  <option value="ENERGIZED">{isFa ? 'پیشرفت عالی' : 'Energized'}</option>
                  <option value="BLOCKED">{isFa ? 'نیازمند پیگیری / مانع' : 'Blocked'}</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isFa ? 'ثبت گزارش روزانه' : 'Publish Check-in'}</span>
              </button>
            </form>

            <div className="lg:col-span-2 space-y-3">
              {standups.map((st) => (
                <div
                  key={st.id}
                  className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar name={st.userName || 'Team'} avatarUrl={st.userAvatarUrl} size="sm" />
                      <div>
                        <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                          {st.userName}
                        </div>
                        <div className="text-[11px] text-neutral-500">{st.department}</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-neutral-400">
                      {formatAppDate(st.createdAt, { calendarSystem, locale, includeTime: true })}
                    </span>
                  </div>
                  <div className="text-xs space-y-1.5 text-neutral-700 dark:text-neutral-300">
                    <div>
                      <strong className="text-neutral-900 dark:text-neutral-100">
                        {isFa ? 'دیروز: ' : 'Yesterday: '}
                      </strong>
                      {st.yesterday}
                    </div>
                    <div>
                      <strong className="text-red-600 dark:text-red-400">{isFa ? 'امروز: ' : 'Today: '}</strong>
                      {st.today}
                    </div>
                    {st.blockers && (
                      <div className="text-amber-700 dark:text-amber-400">
                        <strong>{isFa ? 'مانع: ' : 'Blocker: '}</strong>
                        {st.blockers}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Approval Modal */}
      {approvalModal && (
        <div className="fixed inset-0 z-50 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl ios-glass-strong bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <h2 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {isFa ? 'ثبت درخواست تأیید سازمانی' : 'Submit Approval Request'}
              </h2>
              <button
                type="button"
                onClick={() => setApprovalModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitApproval} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'نوع درخواست' : 'Category'}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ApprovalCategory)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  >
                    <option value="PURCHASE">{isFa ? 'تأمین و خرید' : 'Purchase'}</option>
                    <option value="LEAVE">{isFa ? 'مرخصی / مأموریت' : 'Leave'}</option>
                    <option value="ACCESS">{isFa ? 'دسترسی سیستمی' : 'Access'}</option>
                    <option value="EXPENSE">{isFa ? 'هزینه و تنخواه' : 'Expense'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'مبلغ یا مدت' : 'Amount / Duration'}
                  </label>
                  <input
                    type="text"
                    value={metricLabel}
                    onChange={(e) => setMetricLabel(e.target.value)}
                    placeholder={isFa ? 'مثلاً ۲ روز یا ۲۵ میلیون' : 'e.g. 2 days'}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'عنوان درخواست' : 'Request Title'}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'توضیحات تکمیلی' : 'Details'}
                </label>
                <textarea
                  required
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'ارجاع به مدیر تأییدکننده' : 'Approver'}
                </label>
                <select
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                >
                  {users
                    .filter((u) => u.role === 'SUPER_ADMIN' || u.role === 'DEPT_MANAGER')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.jobTitle})
                      </option>
                    ))}
                </select>
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setApprovalModal(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
                >
                  {isFa ? 'ارسال درخواست' : 'Submit'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
