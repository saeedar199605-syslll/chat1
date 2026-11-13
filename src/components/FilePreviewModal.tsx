import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  X,
  ZoomIn,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatBytes, replaceFileExtension } from '../utils/chatLogic';
import {
  convertPdfSourceToDocxBlob,
  inspectPdfSource,
  renderPdfPageToPngBlob,
  triggerBlobDownload,
  type PdfInspectionResult,
} from '../utils/pdfTools';
import { tipProps } from './GlassTooltip';

export function FilePreviewModal() {
  const previewFile = useAppStore((s) => s.previewFile);
  const setPreviewFile = useAppStore((s) => s.setPreviewFile);
  const openPdfStudio = useAppStore((s) => s.openPdfStudio);
  const showToast = useAppStore((s) => s.showToast);
  const locale = useAppStore((s) => s.locale);
  const isFa = locale === 'fa';

  const [textContent, setTextContent] = useState<string | null>(null);
  const [pdfInspection, setPdfInspection] = useState<PdfInspectionResult | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTab, setPdfTab] = useState<'pages' | 'text'>('pages');
  const [zoomed, setZoomed] = useState(false);
  const [converting, setConverting] = useState<'png' | 'docx' | null>(null);

  const isTextLike =
    previewFile &&
    (previewFile.mimeType.startsWith('text/') ||
      previewFile.mimeType.includes('json') ||
      /\.(md|txt|csv|json|ts|tsx|js|yml|yaml|sql)$/i.test(previewFile.fileName));

  const isImage = previewFile?.mimeType.startsWith('image/');
  const isVideo = previewFile?.mimeType.startsWith('video/');
  const isPdf =
    Boolean(previewFile) &&
    (previewFile!.mimeType === 'application/pdf' || /\.pdf$/i.test(previewFile!.fileName));

  useEffect(() => {
    if (!previewFile || !isTextLike) {
      setTextContent(null);
      return;
    }
    fetch(previewFile.url)
      .then((r) => r.text())
      .then((txt) => setTextContent(txt))
      .catch(() =>
        setTextContent(
          isFa ? 'امکان پیش‌نمایش متنی این فایل وجود ندارد.' : 'Unable to preview file content inline.'
        )
      );
  }, [previewFile, isTextLike, isFa]);

  useEffect(() => {
    if (!previewFile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewFile(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewFile, setPreviewFile]);

  useEffect(() => {
    if (!previewFile || !isPdf) {
      setPdfInspection(null);
      setPdfLoading(false);
      setPdfError(null);
      return;
    }
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    setPdfInspection(null);
    setPdfPage(1);
    setPdfTab('pages');
    inspectPdfSource(previewFile.url, { maxPages: 8, scale: 1.5 })
      .then((res) => {
        if (!cancelled) setPdfInspection(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setPdfInspection(null);
          setPdfError((err as Error).message || 'Failed to render PDF preview');
        }
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewFile, isPdf]);

  const activePdfPage = pdfInspection?.pages[pdfPage - 1];

  return (
    <AnimatePresence>
      {previewFile && (
        <motion.div
          role="dialog"
          aria-label={isFa ? `پیش‌نمایش ${previewFile.fileName}` : `Preview ${previewFile.fileName}`}
          data-testid="file-preview-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewFile(null);
          }}
          className="fixed inset-0 z-50 bg-neutral-950/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="w-full max-w-4xl max-h-[90vh] rounded-3xl ios-glass-strong bg-white/95 dark:bg-neutral-900/95 border border-white/60 dark:border-neutral-800 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="min-h-14 px-5 py-2.5 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                  {previewFile.fileName}
                </h3>
                <p className="text-[11px] font-mono tabular-nums text-neutral-500">
                  {previewFile.mimeType} · {formatBytes(previewFile.sizeBytes)}
                  {pdfInspection ? ` · ${pdfInspection.pageCount} ${isFa ? 'صفحه' : 'pages'}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {isPdf && (
                  <>
                    <button
                      type="button"
                      data-testid="preview-pdf-to-png"
                      disabled={converting !== null}
                      onClick={async () => {
                        setConverting('png');
                        try {
                          const blob = await renderPdfPageToPngBlob(previewFile.url, pdfPage, 2.0);
                          const out = replaceFileExtension(previewFile.fileName, `page-${pdfPage}.png`);
                          triggerBlobDownload(blob, out);
                          showToast(isFa ? `تصویر ${out} ذخیره شد` : `Downloaded ${out}`);
                        } catch (err) {
                          showToast((err as Error).message, 'error');
                        } finally {
                          setConverting(null);
                        }
                      }}
                      {...tipProps('تبدیل صفحه جاری PDF به عکس PNG', 'Export current page as PNG image')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-400 text-xs font-medium text-neutral-800 dark:text-neutral-100 cursor-pointer"
                    >
                      {converting === 'png' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" /> : <FileImage className="w-3.5 h-3.5 text-red-600" />}
                      <span>{isFa ? 'تبدیل به PNG' : 'To PNG'}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="preview-pdf-to-word"
                      disabled={converting !== null}
                      onClick={async () => {
                        setConverting('docx');
                        try {
                          const { blob } = await convertPdfSourceToDocxBlob(
                            previewFile.url,
                            previewFile.fileName.replace(/\.pdf$/i, '')
                          );
                          const out = replaceFileExtension(previewFile.fileName, 'docx');
                          triggerBlobDownload(blob, out);
                          showToast(isFa ? `فایل ورد ${out} ذخیره شد` : `Downloaded ${out}`);
                        } catch (err) {
                          showToast((err as Error).message, 'error');
                        } finally {
                          setConverting(null);
                        }
                      }}
                      {...tipProps('تبدیل کل PDF به سند قابل ویرایش Word', 'Convert PDF to editable Word (.docx)')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-400 text-xs font-medium text-neutral-800 dark:text-neutral-100 cursor-pointer"
                    >
                      {converting === 'docx' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-red-600" />}
                      <span>{isFa ? 'تبدیل به Word' : 'To Word'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const file = previewFile;
                        setPreviewFile(null);
                        openPdfStudio(file);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl ios-glass-selected-soft text-red-700 dark:text-red-300 text-xs font-semibold cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isFa ? 'استودیو PDF' : 'PDF Studio'}</span>
                    </button>
                  </>
                )}

                <a
                  href={previewFile.url}
                  download={previewFile.fileName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ios-glass-selected text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isFa ? 'دانلود' : 'Download'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  aria-label={isFa ? 'بستن پیش‌نمایش' : 'Close file preview'}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 bg-neutral-100/80 dark:bg-neutral-950/90 flex flex-col items-center justify-center">
              {isImage ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.fileName}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[70vh] rounded-xl shadow-sm"
                />
              ) : isVideo ? (
                <video src={previewFile.url} controls className="max-w-full max-h-[70vh] rounded-xl" />
              ) : isPdf ? (
                pdfLoading || (!pdfInspection && !pdfError) ? (
                  <div className="py-16 flex flex-col items-center gap-2 text-xs text-neutral-500">
                    <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                    <span>{isFa ? 'در حال بررسی و آماده‌سازی صفحات PDF...' : 'Rendering PDF review pages...'}</span>
                  </div>
                ) : pdfInspection && activePdfPage ? (
                  <div className="w-full space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-white/90 dark:bg-neutral-900/90 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPdfTab('pages')}
                          className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                            pdfTab === 'pages' ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {isFa ? 'پیش‌نمایش صفحات' : 'Visual Pages'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPdfTab('text')}
                          className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                            pdfTab === 'text' ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {isFa ? 'متن استخراج‌شده' : 'Extracted Text'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoomed((z) => !z)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                            zoomed ? 'ios-glass-selected-soft text-red-700' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          }`}
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>{zoomed ? '140%' : '100%'}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={pdfPage <= 1}
                          onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                          className="p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono text-xs tabular-nums">
                          {pdfPage} / {pdfInspection.pageCount}
                        </span>
                        <button
                          type="button"
                          disabled={pdfPage >= pdfInspection.pages.length}
                          onClick={() => setPdfPage((p) => Math.min(pdfInspection.pages.length, p + 1))}
                          className="p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {pdfTab === 'pages' ? (
                      <div className="flex flex-col items-center gap-3">
                        <img
                          src={activePdfPage.dataUrl}
                          alt={`${previewFile.fileName} page ${pdfPage}`}
                          className={`${zoomed ? 'max-h-[75vh] scale-105' : 'max-h-[54vh]'} w-auto rounded-xl shadow-lg bg-white border border-neutral-200 transition-transform`}
                        />
                        {activePdfPage.text && (
                          <div className="w-full p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-200">
                            {activePdfPage.text}
                          </div>
                        )}
                      </div>
                    ) : (
                      <pre className="w-full p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs leading-relaxed whitespace-pre-wrap max-h-[58vh] overflow-auto">
                        {pdfInspection.fullText || (isFa ? 'متنی یافت نشد.' : 'No selectable text found.')}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className="py-12 px-6 rounded-2xl bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 text-center space-y-2 max-w-md">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                      {isFa ? 'خطا در بررسی مستقیم PDF' : 'Unable to render PDF inline'}
                    </p>
                    <p className="text-[11px] text-neutral-500 font-mono">{pdfError}</p>
                  </div>
                )
              ) : textContent !== null ? (
                <pre className="w-full p-5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs font-mono text-neutral-800 dark:text-neutral-200 overflow-auto max-h-[68vh] leading-relaxed">
                  {textContent}
                </pre>
              ) : (
                <div className="text-center space-y-2">
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    {isFa
                      ? 'پیش‌نمایش مستقیم برای تصاویر، ویدیوها، PDF و اسناد متنی فعال است.'
                      : 'Inline preview is available for images, PDFs, videos, CSVs, and text/code documents.'}
                  </p>
                  <a
                    href={previewFile.url}
                    download={previewFile.fileName}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ios-glass-selected text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" />{' '}
                    {isFa ? `دانلود ${previewFile.fileName}` : `Download ${previewFile.fileName}`}
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
