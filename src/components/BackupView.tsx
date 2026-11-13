import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileCheck2,
  HardDrive,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { formatBytes } from '../utils/chatLogic';
import { formatAppDate } from '../utils/jalali';

export function BackupView() {
  const currentUser = useAppStore((s) => s.currentUser);
  const accessToken = useAppStore((s) => s.accessToken);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const showToast = useAppStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const isFa = locale === 'fa';

  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [verifyBanner, setVerifyBanner] = useState<{
    valid: boolean;
    message: string;
    sha256?: string;
  } | null>(null);
  const [jsonInput, setJsonInput] = useState('');

  const backupQuery = useQuery({
    queryKey: ['backup-snapshots'],
    queryFn: api.getBackupSnapshots,
  });

  const snapshots = backupQuery.data?.snapshots || [];
  const liveCounts = backupQuery.data?.liveCounts || {};
  const totalRows = Object.values(liveCounts).reduce((a, b) => a + b, 0);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.createBackupSnapshot(label.trim() || undefined);
      setLabel('');
      setVerifyBanner({
        valid: true,
        message: isFa
          ? `نسخه پشتیبان «${res.snapshot.label}» با امضای SHA-256 با موفقیت ثبت شد.`
          : `Snapshot "${res.snapshot.label}" persisted with verified SHA-256 checksum.`,
        sha256: res.snapshot.sha256,
      });
      queryClient.invalidateQueries({ queryKey: ['backup-snapshots'] });
      showToast(isFa ? 'نسخه پشتیبان تأییدشده ایجاد شد' : 'Verified backup snapshot created');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleVerifySnapshot = async (snapshotId: string) => {
    try {
      const res = await api.verifyBackup({ snapshotId });
      setVerifyBanner({
        valid: res.valid,
        message: res.valid
          ? isFa
            ? `سلامت رمزنگاری‌شده تأیید شد (${Object.values(res.counts).reduce((a, b) => a + b, 0)} رکورد سالم).`
            : `Cryptographic integrity verified (${Object.values(res.counts).reduce((a, b) => a + b, 0)} relational rows intact).`
          : res.errors.join(' · '),
        sha256: res.computedSha256,
      });
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    try {
      const res = await api.restoreBackup({ snapshotId });
      setConfirmRestoreId(null);
      setVerifyBanner({
        valid: true,
        message: isFa
          ? `بازیابی تراکنشی تکمیل شد (${Object.values(res.restoredCounts).reduce((a, b) => a + b, 0)} رکورد بازگردانی شد).`
          : `Transactional restore completed (${Object.values(res.restoredCounts).reduce((a, b) => a + b, 0)} rows restored).`,
        sha256: res.sha256,
      });
      queryClient.invalidateQueries();
      showToast(isFa ? 'پایگاه داده از نسخه پشتیبان بازیابی شد' : 'Database restored from snapshot');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDownloadSnapshot = async (snapshotId: string) => {
    const res = await fetch(`/api/backup/snapshots/${snapshotId}/download`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) {
      showToast(isFa ? 'دانلود ناموفق بود' : 'Download failed', 'error');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esfahan-chalak-backup-${snapshotId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setJsonInput(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const handleVerifyPastedBundle = async (restoreAfterVerify: boolean) => {
    try {
      const parsed = JSON.parse(jsonInput);
      const res = await api.verifyBackup({ bundle: parsed });
      setVerifyBanner({
        valid: res.valid,
        message: res.valid
          ? isFa
            ? `یکپارچگی فایل پشتیبان تأیید شد (${Object.values(res.counts).reduce((a, b) => a + b, 0)} رکورد).`
            : `Bundle integrity verified (${Object.values(res.counts).reduce((a, b) => a + b, 0)} rows).`
          : res.errors.join(' · '),
        sha256: res.computedSha256,
      });
      if (res.valid && restoreAfterVerify) {
        await api.restoreBackup({ bundle: parsed });
        queryClient.invalidateQueries();
        showToast(isFa ? 'پایگاه داده از فایل پشتیبان بازیابی شد' : 'Database restored from uploaded bundle');
      }
    } catch (err) {
      setVerifyBanner({
        valid: false,
        message: `Invalid JSON bundle: ${(err as Error).message}`,
      });
    }
  };

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <DatabaseBackup className="w-4 h-4 text-red-600 dark:text-red-400" />
          <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100">
            {isFa ? 'پشتیبان‌گیری دقیق و بازیابی رمزنگاری‌شده (SHA-256)' : 'Precision Backup & Cryptographic Recovery'}
          </h1>
        </div>
        <div className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
          {Object.keys(liveCounts).length} {isFa ? 'جدول' : 'tables'} · {totalRows} {isFa ? 'رکورد فعال' : 'live rows'}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl">
        {/* Integrity Status Banner */}
        {verifyBanner && (
          <div
            data-testid="backup-verify-banner"
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              verifyBanner.valid
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
            }`}
          >
            {verifyBanner.valid ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1 text-xs space-y-1">
              <div className="font-semibold">{verifyBanner.message}</div>
              {verifyBanner.sha256 && (
                <div className="font-mono text-[11px] opacity-80 break-all">
                  SHA-256: {verifyBanner.sha256}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Relational Table Telemetry */}
        <section className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              <HardDrive className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span>{isFa ? 'آمار لحظه‌ای جداول پایگاه‌داده اصفهان چالاک' : 'Live Relational Schema Inventory'}</span>
            </div>
            <span className="text-[11px] text-neutral-500">
              {isFa ? 'خروجی اتمیک نقطه‌ای با کنترل تمامیت' : 'Full point-in-time atomic export'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {Object.entries(liveCounts).map(([tableName, count]) => (
              <div
                key={tableName}
                className="px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/70 border border-neutral-200/70 dark:border-neutral-800"
              >
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{tableName}</div>
                <div className="text-sm font-mono font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                  {count}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Create Snapshot Control */}
        <section className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
          <form onSubmit={handleCreateSnapshot} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={isFa ? 'عنوان نسخه پشتیبان (مثال: بکاپ پایان شیفت)...' : 'Snapshot label (e.g., Pre-migration baseline v4.2)...'}
              aria-label="Backup snapshot label"
              className="flex-1 min-w-[220px] px-3 py-2 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{creating ? (isFa ? 'در حال ثبت...' : 'Snapshotting...') : isFa ? 'ایجاد نسخه پشتیبان' : 'Create Verified Snapshot'}</span>
            </button>
          </form>
        </section>

        {/* Snapshot History */}
        <section className="rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <h2 className="font-display font-semibold text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
              {isFa ? `مخزن نسخه‌های پشتیبان تأییدشده (${snapshots.length})` : `Verified Snapshot Vault (${snapshots.length})`}
            </h2>
          </div>

          {snapshots.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              {isFa
                ? 'هنوز نسخه پشتیبانی ثبت نشده است. دکمه «ایجاد نسخه پشتیبان» را بزنید.'
                : 'No backup snapshots created yet. Click "Create Verified Snapshot" above to capture an immutable SHA-256 checkpoint.'}
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {snapshots.map((snap) => {
                const snapTotal = Object.values(snap.counts).reduce((a, b) => a + b, 0);
                return (
                  <div key={snap.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                          {snap.label}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-neutral-400">
                          {formatBytes(snap.sizeBytes)} · {snapTotal} {isFa ? 'رکورد' : 'rows'}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex flex-wrap items-center gap-2">
                        <span>{isFa ? `توسط ${snap.createdByName}` : `By ${snap.createdByName}`}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">
                          {formatAppDate(snap.createdAt, { calendarSystem, locale, includeTime: true })}
                        </span>
                        <span>·</span>
                        <span title={snap.sha256} className="font-mono text-emerald-600 dark:text-emerald-400">
                          sha256:{snap.sha256.slice(0, 14)}…
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleVerifySnapshot(snap.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400"
                      >
                        <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{isFa ? 'راستی‌آزمایی' : 'Verify'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadSnapshot(snap.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isFa ? 'خروجی JSON' : 'Export JSON'}</span>
                      </button>

                      {isSuperAdmin && (
                        confirmRestoreId === snap.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRestoreSnapshot(snap.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
                            >
                              {isFa ? 'تأیید بازیابی' : 'Confirm Restore'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRestoreId(null)}
                              className="px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs"
                            >
                              {isFa ? 'انصراف' : 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreId(snap.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{isFa ? 'بازیابی' : 'Restore'}</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* External JSON Verification & Recovery */}
        <section className="p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                {isFa ? 'بررسی یا بازیابی از فایل پشتیبان خارجی' : 'Inspect or Restore External Backup Bundle'}
              </h2>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {isFa
                  ? 'فایل JSON خروجی‌گرفته‌شده را بارگذاری کنید تا پیش از بازیابی، کد SHA-256 آن بررسی شود.'
                  : 'Upload a previously exported JSON archive to validate its SHA-256 digest before transactional restore.'}
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium cursor-pointer hover:border-red-400">
              <Upload className="w-3.5 h-3.5" />
              <span>{isFa ? 'بارگذاری JSON' : 'Load JSON File'}</span>
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
            </label>
          </div>

          <textarea
            rows={4}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='{"schemaVersion": "workstream.v2", "sha256": "...", "tables": {...}}'
            aria-label="Backup JSON bundle input"
            className="w-full p-3 text-xs font-mono rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-red-500"
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={!jsonInput.trim()}
              onClick={() => handleVerifyPastedBundle(false)}
              className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium disabled:opacity-40"
            >
              {isFa ? 'بررسی امضای دیجیتال' : 'Verify Checksum'}
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                disabled={!jsonInput.trim()}
                onClick={() => handleVerifyPastedBundle(true)}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-40"
              >
                {isFa ? 'بررسی و بازیابی پایگاه‌داده' : 'Verify & Restore Database'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
