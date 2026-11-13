import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileImage, FileSpreadsheet, FileText, Link2, Sparkles, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { canPerformWithMatrix, formatBytes, replaceFileExtension } from '../utils/chatLogic';
import { convertPdfSourceToDocxBlob, renderPdfPageToPngBlob, triggerBlobDownload } from '../utils/pdfTools';
import { tipProps } from './GlassTooltip';
import type { Attachment, Channel } from '../types/index';

interface FilesHubViewProps {
  workspaceId: string;
  channels: Channel[];
}

export function FilesHubView({ workspaceId, channels }: FilesHubViewProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const locale = useAppStore((s) => s.locale);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const setPreviewFile = useAppStore((s) => s.setPreviewFile);
  const openPdfStudio = useAppStore((s) => s.openPdfStudio);
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const showToast = useAppStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const handleFileContextMenu = (e: React.MouseEvent, file: Attachment) => {
    e.preventDefault();
    e.stopPropagation();
    const isPdf = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.fileName);
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: file.fileName,
      items: [
        {
          id: 'file-preview',
          icon: Eye,
          label: isFa ? 'بررسی سریع و پیش‌نمایش' : 'Quick Review & Preview',
          onSelect: () => setPreviewFile(file),
        },
        ...(isPdf
          ? [
              {
                id: 'file-pdf-png',
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
                id: 'file-pdf-docx',
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
                id: 'file-pdf-studio',
                icon: Sparkles,
                label: isFa ? 'باز کردن در استودیو پیشرفته PDF' : 'Open in PDF Studio',
                onSelect: () => openPdfStudio(file),
              },
            ]
          : []),
        {
          id: 'file-copy-link',
          icon: Link2,
          label: isFa ? 'کپی لینک فایل' : 'Copy File Link',
          dividerAbove: true,
          onSelect: () => {
            navigator.clipboard?.writeText(window.location.origin + file.url).catch(() => {});
            showToast(isFa ? 'لینک فایل کپی شد' : 'File link copied');
          },
        },
        {
          id: 'file-download',
          icon: Download,
          label: isFa ? 'دانلود فایل اصلی' : 'Download Original',
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

  const isFa = locale === 'fa';

  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'document'>('all');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const filesQuery = useQuery({
    queryKey: ['org-files', workspaceId, channelFilter, typeFilter],
    queryFn: () =>
      api.getFiles({
        workspaceId,
        channelId: channelFilter || undefined,
        type: typeFilter,
      }),
  });

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const targetChannelId = channelFilter || activeChannelId || channels[0]?.id;
    if (!targetChannelId) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await api.uploadFilePresigned(targetChannelId, file, file.name);
      }
      queryClient.invalidateQueries({ queryKey: ['org-files'] });
      showToast(isFa ? 'فایل در مخزن اسناد بارگذاری شد' : 'File uploaded to repository');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      <header className="h-14 px-6 ios-glass bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
        <h1 className="font-display font-semibold text-base text-neutral-900 dark:text-neutral-100">
          {isFa ? 'مرکز فایل‌ها و مستندات اصفهان چالاک' : 'Organizational Files & Knowledge Hub'}
        </h1>
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer shrink-0">
          <Upload className="w-3.5 h-3.5" />
          <span>{uploading ? (isFa ? 'در حال بارگذاری...' : 'Uploading...') : isFa ? 'بارگذاری فایل' : 'Upload File'}</span>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            {(
              [
                { id: 'all', label: isFa ? 'همه' : 'All' },
                { id: 'image', label: isFa ? 'تصویر' : 'Image' },
                { id: 'video', label: isFa ? 'ویدیو' : 'Video' },
                { id: 'document', label: isFa ? 'اسناد' : 'Document' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  typeFilter === t.id
                    ? 'ios-glass-selected'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            aria-label="Filter files by channel"
            className="px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-200"
          >
            <option value="">{isFa ? 'همه کانال‌ها' : 'All Channels'}</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                #{ch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400">
                <th className="py-3 px-4 text-start font-medium">{isFa ? 'نام فایل' : 'File Name'}</th>
                <th className="py-3 px-4 text-start font-medium">{isFa ? 'کانال' : 'Channel'}</th>
                <th className="py-3 px-4 text-start font-medium">{isFa ? 'بارگذاری توسط' : 'Uploaded By'}</th>
                <th className="py-3 px-4 text-end font-medium">{isFa ? 'حجم' : 'Size'}</th>
                <th className="py-3 px-4 text-end font-medium">{isFa ? 'اقدامات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filesQuery.data?.files.map((file) => {
                const canDelete =
                  file.uploaderId === currentUser?.id ||
                  canPerformWithMatrix(currentUser, 'file:delete_any', 'PUBLIC', rbacMatrix);
                return (
                  <tr
                    key={file.id}
                    onContextMenu={(e) => handleFileContextMenu(e, file)}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="flex items-center gap-2 font-medium text-neutral-900 dark:text-neutral-100 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <FileText className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                        <span className="truncate max-w-xs">{file.fileName}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-neutral-600 dark:text-neutral-300">
                      #{file.channelName || 'channel'}
                    </td>
                    <td className="py-3 px-4 text-neutral-600 dark:text-neutral-300">{file.uploaderName}</td>
                    <td className="py-3 px-4 text-end font-mono tabular-nums text-neutral-500">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {(file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.fileName)) && (
                          <button
                            type="button"
                            onClick={() => openPdfStudio(file)}
                            {...tipProps('باز کردن در استودیو PDF و تبدیل به Word/PNG', 'Open in PDF Studio to convert to Word/PNG')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg ios-glass-selected-soft text-red-700 dark:text-red-300 text-[11px] font-semibold cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{isFa ? 'استودیو PDF' : 'PDF Studio'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          aria-label={`Preview ${file.fileName}`}
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={file.url}
                          download={file.fileName}
                          aria-label={`Download ${file.fileName}`}
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={async () => {
                              await api.deleteFile(file.id);
                              queryClient.invalidateQueries({ queryKey: ['org-files'] });
                            }}
                            aria-label={`Delete ${file.fileName}`}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/50 text-neutral-500 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filesQuery.data?.files.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-neutral-500">
                    {isFa ? 'فایلی مطابق این فیلتر یافت نشد.' : 'No files match this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
