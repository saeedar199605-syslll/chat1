import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Activity,
  Building2,
  Crown,
  Download,
  Edit3,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { filterAuditLogs } from '../utils/chatLogic';
import { formatAppDate } from '../utils/jalali';
import type { AuditCategory, AuditSeverity, BroadcastLevel, Workspace } from '../types/index';

type AdminTab = 'overview' | 'workspaces' | 'audit';

export function SuperAdminView() {
  const currentUser = useAppStore((s) => s.currentUser);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const setRailTab = useAppStore((s) => s.setRailTab);
  const showToast = useAppStore((s) => s.showToast);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const qc = useQueryClient();
  const isFa = locale === 'fa';

  const [tab, setTab] = useState<AdminTab>('overview');

  // Broadcast form
  const [brdTitle, setBrdTitle] = useState('');
  const [brdMessage, setBrdMessage] = useState('');
  const [brdLevel, setBrdLevel] = useState<BroadcastLevel>('INFO');
  const [brdSubmitting, setBrdSubmitting] = useState(false);

  // Workspace create / edit
  const [newWsName, setNewWsName] = useState('');
  const [newWsDomain, setNewWsDomain] = useState('');
  const [editingWs, setEditingWs] = useState<Workspace | null>(null);
  const [editName, setEditName] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editLogoText, setEditLogoText] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [savingWs, setSavingWs] = useState(false);

  // Audit Log filters
  const [auditCategory, setAuditCategory] = useState<AuditCategory | 'ALL'>('ALL');
  const [auditSeverity, setAuditSeverity] = useState<AuditSeverity | 'ALL'>('ALL');
  const [auditSearch, setAuditSearch] = useState('');

  const { data: overviewData, refetch: refetchOverview } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: api.getAdminOverview,
    enabled: currentUser?.role === 'SUPER_ADMIN',
  });

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.getWorkspaces,
  });

  const { data: broadcastsData } = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: api.getAdminBroadcasts,
    enabled: currentUser?.role === 'SUPER_ADMIN',
  });

  const {
    data: auditData,
    isFetching: auditLoading,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => api.getAuditLogs({ limit: 250 }),
    enabled: currentUser?.role === 'SUPER_ADMIN',
  });

  const overview = overviewData?.overview;
  const workspaces = workspacesData?.workspaces ?? [];
  const broadcasts = broadcastsData?.broadcasts ?? [];
  const allLogs = auditData?.logs ?? [];

  const filteredLogs = useMemo(
    () => filterAuditLogs(allLogs, { category: auditCategory, severity: auditSeverity, q: auditSearch }),
    [allLogs, auditCategory, auditSeverity, auditSearch]
  );

  if (currentUser?.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl ios-glass-card border border-red-200 dark:border-red-900/50 p-6 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
          <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
            {isFa ? 'دسترسی ویژه سوپر ادمین' : 'Super Admin Access Required'}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isFa
              ? 'این مرکز فرماندهی تنها برای حساب‌های با نقش سوپر ادمین فعال است.'
              : 'This command center is restricted to Super Admin accounts.'}
          </p>
        </div>
      </div>
    );
  }

  const handlePublishBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brdTitle.trim() || !brdMessage.trim()) return;
    setBrdSubmitting(true);
    try {
      await api.createBroadcast({ title: brdTitle.trim(), message: brdMessage.trim(), level: brdLevel });
      setBrdTitle('');
      setBrdMessage('');
      qc.invalidateQueries({ queryKey: ['admin-broadcasts'] });
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      showToast(isFa ? 'اطلاعیه سراسری با موفقیت برای همه کاربران ارسال شد' : 'Global broadcast published');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setBrdSubmitting(false);
    }
  };

  const handleRevokeBroadcast = async (id: string) => {
    try {
      await api.deactivateBroadcast(id);
      qc.invalidateQueries({ queryKey: ['admin-broadcasts'] });
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      showToast(isFa ? 'اطلاعیه سراسری لغو شد' : 'Broadcast revoked');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setSavingWs(true);
    try {
      const res = await api.createWorkspace(newWsName.trim(), newWsDomain.trim() || undefined);
      setNewWsName('');
      setNewWsDomain('');
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      showToast(isFa ? `شرکت «${res.workspace.name}» ایجاد شد` : `Created ${res.workspace.name}`);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingWs(false);
    }
  };

  const startEditWorkspace = (ws: Workspace) => {
    setEditingWs(ws);
    setEditName(ws.name);
    setEditDomain(ws.domain || '');
    setEditLogoText(ws.logoText || '');
    setEditLogoUrl(ws.logoUrl || '');
  };

  const handleSaveWorkspaceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWs || !editName.trim()) return;
    setSavingWs(true);
    try {
      await api.updateWorkspace(editingWs.id, {
        name: editName.trim(),
        domain: editDomain.trim(),
        logoText: editLogoText.trim() || undefined,
        logoUrl: editLogoUrl.trim() || null,
      });
      setEditingWs(null);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      showToast(isFa ? 'مشخصات شرکت با موفقیت بروزرسانی شد' : 'Workspace updated');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingWs(false);
    }
  };

  const handleUploadWsLogo = async (wsId: string, file: File) => {
    try {
      const res = await api.uploadWorkspaceLogo(wsId, file);
      if (editingWs?.id === wsId) {
        setEditLogoUrl(res.logoUrl);
      }
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      showToast(isFa ? 'لوگوی شرکت آپلود و ذخیره شد' : 'Workspace logo uploaded');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const exportAuditCsv = () => {
    const headers = ['id', 'createdAt', 'category', 'severity', 'actorName', 'actorEmail', 'action', 'targetLabel'];
    const lines = [
      headers.join(','),
      ...filteredLogs.map((l) =>
        headers
          .map((h) => `"${String((l as unknown as Record<string, unknown>)[h] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esfahan-chalak-audit-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAuditJson = () => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esfahan-chalak-audit-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="superadmin-view" className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 ios-glass border-b border-neutral-200/80 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display font-bold text-base sm:text-lg text-neutral-900 dark:text-white">
              {isFa ? 'مرکز فرماندهی سوپر ادمین اصفهان چالاک' : 'Esfahan Chalak Super Admin Console'}
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {isFa
                ? 'پایش لحظه‌ای سازمان، مدیریت شرکت‌ها و لوگو، فراخوان سراسری و لاگ کامل ممیزی'
                : 'Telemetry, Multi-Company Branding, Global Broadcasts & Complete Audit Trail'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-neutral-100/90 dark:bg-neutral-800/90 p-1 rounded-xl border border-neutral-200/70 dark:border-neutral-700/70">
          {(
            [
              { id: 'overview', labelFa: 'نمای کلی و فراخوان', labelEn: 'Overview & Broadcasts', icon: Activity },
              { id: 'workspaces', labelFa: 'شرکت‌ها و لوگو', labelEn: 'Companies & Logos', icon: Building2 },
              { id: 'audit', labelFa: 'لاگ کامل ممیزی', labelEn: 'Complete Audit Logs', icon: ShieldAlert },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`superadmin-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-white/80 dark:hover:bg-neutral-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isFa ? t.labelFa : t.labelEn}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* TAB 1: OVERVIEW & BROADCASTS */}
        {tab === 'overview' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              {[
                { labelFa: 'شرکت‌ها / فضاهای کاری', labelEn: 'Workspaces', val: overview?.workspaces ?? workspaces.length },
                {
                  labelFa: 'کاربران فعال / معلق',
                  labelEn: 'Active / Suspended',
                  val: `${overview?.usersActive ?? 0} / ${overview?.usersSuspended ?? 0}`,
                },
                { labelFa: 'کانال‌ها و گفتگوها', labelEn: 'Active Channels', val: overview?.channelsTotal ?? 0 },
                { labelFa: 'پیام‌های ثبت‌شده', labelEn: 'Total Messages', val: overview?.messagesTotal ?? 0 },
                { labelFa: 'وظایف باز', labelEn: 'Open Tasks', val: overview?.tasksOpen ?? 0 },
                { labelFa: 'تأییدیه‌های در انتظار', labelEn: 'Pending Approvals', val: overview?.approvalsPending ?? 0 },
                { labelFa: 'نسخه‌های پشتیبان', labelEn: 'Backup Snapshots', val: overview?.backupSnapshots ?? 0 },
                { labelFa: 'کل رویدادهای ممیزی', labelEn: 'Audit Events', val: overview?.auditLogsTotal ?? allLogs.length },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="p-4 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800"
                >
                  <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    {isFa ? stat.labelFa : stat.labelEn}
                  </div>
                  <div className="mt-1.5 font-mono text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
                    {stat.val}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Global Broadcast Publisher + Active List */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <form
                onSubmit={handlePublishBroadcast}
                className="lg:col-span-6 p-5 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 space-y-4"
              >
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Megaphone className="w-4 h-4" />
                  <h2 className="font-display font-bold text-sm text-neutral-900 dark:text-white">
                    {isFa ? 'ارسال اطلاعیه سراسری (بنر فوری سازمان)' : 'Publish Global System Broadcast'}
                  </h2>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {isFa
                    ? 'این پیام به‌صورت لحظه‌ای در بالای صفحه تمامی کاربران متصل نمایش داده می‌شود.'
                    : 'Pushes a live dismissible banner across all connected users immediately.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                      {isFa ? 'عنوان اطلاعیه' : 'Title'}
                    </label>
                    <input
                      type="text"
                      required
                      data-testid="broadcast-title-input"
                      value={brdTitle}
                      onChange={(e) => setBrdTitle(e.target.value)}
                      placeholder={isFa ? 'مثلاً اطلاعیه مهم واحد فناوری' : 'Maintenance window notice'}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                      {isFa ? 'سطح اهمیت' : 'Severity'}
                    </label>
                    <select
                      value={brdLevel}
                      onChange={(e) => setBrdLevel(e.target.value as BroadcastLevel)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="INFO">{isFa ? 'اطلاع‌رسانی' : 'Info'}</option>
                      <option value="WARN">{isFa ? 'هشدار' : 'Warning'}</option>
                      <option value="URGENT">{isFa ? 'اضطراری' : 'Urgent'}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                    {isFa ? 'متن کامل پیام' : 'Broadcast Message'}
                  </label>
                  <textarea
                    rows={3}
                    required
                    data-testid="broadcast-message-input"
                    value={brdMessage}
                    onChange={(e) => setBrdMessage(e.target.value)}
                    placeholder={isFa ? 'متن اطلاعیه سراسری برای کل پرسنل اصفهان چالاک...' : 'Write your broadcast message...'}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={brdSubmitting}
                  data-testid="publish-broadcast-btn"
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
                >
                  {brdSubmitting
                    ? isFa
                      ? 'در حال ارسال...'
                      : 'Publishing...'
                    : isFa
                      ? 'انتشار سراسری'
                      : 'Publish Broadcast'}
                </button>
              </form>

              <div className="lg:col-span-6 p-5 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="font-display font-bold text-sm text-neutral-900 dark:text-white">
                    {isFa ? 'تاریخچه و وضعیت اطلاعیه‌های سراسری' : 'Broadcast History'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => refetchOverview()}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-neutral-800"
                    title={isFa ? 'بروزرسانی' : 'Refresh'}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {broadcasts.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-neutral-400 py-10">
                    {isFa ? 'هنوز اطلاعیه سراسری ارسال نشده است.' : 'No broadcasts published yet.'}
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto">
                    {broadcasts.map((b) => (
                      <div
                        key={b.id}
                        className={`p-3 rounded-xl border text-xs ${
                          b.isActive
                            ? 'border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20'
                            : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 opacity-70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  b.level === 'URGENT'
                                    ? 'bg-red-600'
                                    : b.level === 'WARN'
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                }`}
                              />
                              <span className="truncate">{b.title}</span>
                            </div>
                            <p className="text-neutral-600 dark:text-neutral-300 mt-1">{b.message}</p>
                            <div className="text-[10px] text-neutral-400 mt-1.5 font-mono tabular-nums">
                              {b.createdByName || 'Super Admin'} ·{' '}
                              {formatAppDate(b.createdAt, { calendarSystem, locale, includeTime: true })}
                            </div>
                          </div>
                          {b.isActive && (
                            <button
                              type="button"
                              onClick={() => handleRevokeBroadcast(b.id)}
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-100 dark:hover:bg-red-950 shrink-0"
                              title={isFa ? 'لغو نمایش بنر' : 'Revoke broadcast'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WORKSPACES / COMPANIES CRUD + RENAME + LOGO */}
        {tab === 'workspaces' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Create Company Form */}
            <form
              onSubmit={handleCreateWorkspace}
              className="p-5 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 flex flex-wrap items-end gap-3"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                  {isFa ? 'نام شرکت یا دپارتمان جدید' : 'New Company / Workspace Name'}
                </label>
                <input
                  type="text"
                  required
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder={isFa ? 'مثلاً هلدینگ فناوری چالاک' : 'Chalak Tech Holdings'}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                  {isFa ? 'دامنه اختصاصی (اختیاری)' : 'Domain (optional)'}
                </label>
                <input
                  type="text"
                  value={newWsDomain}
                  onChange={(e) => setNewWsDomain(e.target.value)}
                  placeholder="holding.esfahan-chalak.ir"
                  dir="ltr"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <button
                type="submit"
                disabled={savingWs}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'افزودن شرکت' : 'Add Company'}</span>
              </button>
            </form>

            {/* Companies Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workspaces.map((ws) => {
                const isCurrent = ws.id === activeWorkspaceId;
                return (
                  <div
                    key={ws.id}
                    className={`p-5 rounded-2xl ios-glass-card border transition-all flex flex-col justify-between gap-4 ${
                      isCurrent
                        ? 'border-red-400 dark:border-red-700 ring-1 ring-red-500/20'
                        : 'border-neutral-200/80 dark:border-neutral-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center overflow-hidden shrink-0">
                          {ws.logoUrl ? (
                            <img src={ws.logoUrl} alt={ws.name} className="w-full h-full object-contain p-1" />
                          ) : (
                            <span className="w-full h-full bg-red-600 text-white font-bold text-sm flex items-center justify-center">
                              {ws.logoText}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display font-bold text-sm text-neutral-900 dark:text-white truncate">
                            {ws.name}
                          </h3>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate font-mono">
                            {ws.domain || ws.slug}
                          </p>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 tabular-nums">
                            {ws.memberCount} {isFa ? 'عضو' : 'members'} · {isCurrent ? (isFa ? 'شرکت فعال فعلی' : 'Active') : isFa ? 'آماده سوئیچ' : 'Available'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveWorkspaceId(ws.id);
                          setRailTab('chat');
                          showToast(isFa ? `ورود به فضای کاری «${ws.name}»` : `Switched to ${ws.name}`);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                      >
                        {isCurrent ? (isFa ? 'باز کردن گفتگوها' : 'Open Chat') : isFa ? 'سوئیچ به این شرکت' : 'Switch Company'}
                      </button>

                      <button
                        type="button"
                        onClick={() => startEditWorkspace(ws)}
                        className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'ویرایش نام و لوگو' : 'Edit Name & Logo'}</span>
                      </button>

                      <label className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isFa ? 'آپلود عکس لوگو' : 'Upload Logo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadWsLogo(ws.id, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inline Edit Modal Card */}
            {editingWs && (
              <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4">
                <form
                  onSubmit={handleSaveWorkspaceEdit}
                  className="w-full max-w-md rounded-2xl ios-glass-strong border border-neutral-200 dark:border-neutral-700 p-5 space-y-4 shadow-2xl"
                >
                  <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                    {isFa ? `ویرایش شرکت «${editingWs.name}»` : `Edit ${editingWs.name}`}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                        {isFa ? 'نام شرکت' : 'Company Name'}
                      </label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                          {isFa ? 'دامنه' : 'Domain'}
                        </label>
                        <input
                          type="text"
                          value={editDomain}
                          onChange={(e) => setEditDomain(e.target.value)}
                          dir="ltr"
                          className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                          {isFa ? 'اختصار متنی لوگو' : 'Logo Initials'}
                        </label>
                        <input
                          type="text"
                          maxLength={4}
                          value={editLogoText}
                          onChange={(e) => setEditLogoText(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                        {isFa ? 'نشانی تصویر لوگو (URL یا آپلود)' : 'Logo Image URL'}
                      </label>
                      <input
                        type="text"
                        value={editLogoUrl}
                        onChange={(e) => setEditLogoUrl(e.target.value)}
                        dir="ltr"
                        placeholder="/assets/esfahan-chalak-logo.png"
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingWs(null)}
                      className="px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-300"
                    >
                      {isFa ? 'انصراف' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={savingWs}
                      className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                    >
                      {savingWs ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره تغییرات' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COMPLETE AUDIT LOGS */}
        {tab === 'audit' && (
          <div className="space-y-4 max-w-6xl mx-auto">
            {/* Filters & Export */}
            <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                <div className="relative min-w-[220px] flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    data-testid="audit-search-input"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder={isFa ? 'جستجو در کاربر، عملیات یا هدف...' : 'Search actor, action, target...'}
                    className="w-full ps-8 pe-3 py-1.5 text-xs rounded-xl bg-white/80 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <select
                  data-testid="audit-category-filter"
                  value={auditCategory}
                  onChange={(e) => setAuditCategory(e.target.value as AuditCategory | 'ALL')}
                  className="px-3 py-1.5 text-xs rounded-xl bg-white/80 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100"
                >
                  <option value="ALL">{isFa ? 'همه دسته‌ها' : 'All Categories'}</option>
                  <option value="AUTH">{isFa ? 'ورود و احراز هویت' : 'AUTH'}</option>
                  <option value="WORKSPACE">{isFa ? 'شرکت‌ها و برندینگ' : 'WORKSPACE'}</option>
                  <option value="CHANNEL">{isFa ? 'کانال‌ها' : 'CHANNEL'}</option>
                  <option value="MESSAGE">{isFa ? 'پیام‌ها' : 'MESSAGE'}</option>
                  <option value="USER">{isFa ? 'حساب‌های کاربری' : 'USER'}</option>
                  <option value="RBAC">{isFa ? 'سطوح دسترسی (RBAC)' : 'RBAC'}</option>
                  <option value="TASK">{isFa ? 'وظایف' : 'TASK'}</option>
                  <option value="WORKFLOW">{isFa ? 'تأییدیه‌ها' : 'WORKFLOW'}</option>
                  <option value="BACKUP">{isFa ? 'پشتیبان‌گیری' : 'BACKUP'}</option>
                  <option value="SYSTEM">{isFa ? 'فراخوان سیستم' : 'SYSTEM'}</option>
                </select>

                <select
                  data-testid="audit-severity-filter"
                  value={auditSeverity}
                  onChange={(e) => setAuditSeverity(e.target.value as AuditSeverity | 'ALL')}
                  className="px-3 py-1.5 text-xs rounded-xl bg-white/80 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100"
                >
                  <option value="ALL">{isFa ? 'همه سطوح اهمیت' : 'All Severities'}</option>
                  <option value="INFO">{isFa ? 'عادی (INFO)' : 'INFO'}</option>
                  <option value="WARN">{isFa ? 'هشدار (WARN)' : 'WARN'}</option>
                  <option value="CRITICAL">{isFa ? 'حساس (CRITICAL)' : 'CRITICAL'}</option>
                </select>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => refetchAudit()}
                  className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
                  <span>{isFa ? 'بروزرسانی' : 'Refresh'}</span>
                </button>
                <button
                  type="button"
                  onClick={exportAuditCsv}
                  className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={exportAuditJson}
                  className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table data-testid="audit-logs-table" className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400">
                      <th className="py-2.5 px-3.5 font-semibold whitespace-nowrap">{isFa ? 'زمان ثبت' : 'Timestamp'}</th>
                      <th className="py-2.5 px-3.5 font-semibold whitespace-nowrap">{isFa ? 'کاربر عامل' : 'Actor'}</th>
                      <th className="py-2.5 px-3.5 font-semibold whitespace-nowrap">{isFa ? 'دسته / سطح' : 'Category'}</th>
                      <th className="py-2.5 px-3.5 font-semibold whitespace-nowrap">{isFa ? 'عملیات' : 'Action'}</th>
                      <th className="py-2.5 px-3.5 font-semibold whitespace-nowrap">{isFa ? 'هدف و جزئیات' : 'Target & Details'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/80">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-neutral-400">
                          {isFa ? 'رویداد ممیزی با این فیلتر یافت نشد.' : 'No audit events match your filters.'}
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-red-50/35 dark:hover:bg-neutral-800/40 transition-colors">
                          <td className="py-2.5 px-3.5 font-mono text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap tabular-nums">
                            {formatAppDate(log.createdAt, { calendarSystem, locale, includeTime: true })}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-medium text-neutral-900 dark:text-white">{log.actorName}</div>
                            {log.actorEmail && (
                              <div className="text-[10px] text-neutral-400 font-mono">{log.actorEmail}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-neutral-700 dark:text-neutral-300">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  log.severity === 'CRITICAL'
                                    ? 'bg-red-600'
                                    : log.severity === 'WARN'
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                }`}
                              />
                              {log.category} · {log.severity}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-semibold text-[11px] text-red-700 dark:text-red-400 whitespace-nowrap">
                            {log.action}
                          </td>
                          <td className="py-2.5 px-3.5 text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                            <span>{log.targetLabel || '—'}</span>
                            {log.detailsJson && (
                              <span className="ms-2 text-[10px] font-mono text-neutral-400">{log.detailsJson}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
