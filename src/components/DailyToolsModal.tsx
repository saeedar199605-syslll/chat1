import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import {
  Calculator,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Loader2,
  QrCode,
  Send,
  Sparkles,
  StickyNote,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { replaceFileExtension } from '../utils/chatLogic';
import {
  JALALI_MONTHS_FA,
  JALALI_WEEKDAYS_SHORT_FA,
  calculateFinancialSuite,
  diffDaysBetweenDates,
  formatJalaliString,
  getJalaliMonthCalendarGrid,
  gregorianToJalali,
  isJalaliLeapYear,
  jalaliToGregorian,
} from '../utils/jalali';
import {
  convertPdfSourceToDocxBlob,
  inspectPdfSource,
  renderPdfPageToPngBlob,
  triggerBlobDownload,
  type PdfInspectionResult,
} from '../utils/pdfTools';
import { tipProps } from './GlassTooltip';
import type { Channel } from '../types/index';

interface DailyToolsModalProps {
  workspaceId: string;
  activeChannel: Channel | undefined;
  onSendToChat: (payload: { content: string; attachmentIds?: string[] }) => Promise<void>;
}

export function DailyToolsModal({ workspaceId, activeChannel, onSendToChat }: DailyToolsModalProps) {
  const dailyToolsOpen = useAppStore((s) => s.dailyToolsOpen);
  const dailyToolsTab = useAppStore((s) => s.dailyToolsTab);
  const dailyToolsPdfAttachment = useAppStore((s) => s.dailyToolsPdfAttachment);
  const setDailyToolsOpen = useAppStore((s) => s.setDailyToolsOpen);
  const openPdfStudio = useAppStore((s) => s.openPdfStudio);
  const setComposerQuoteDraft = useAppStore((s) => s.setComposerQuoteDraft);
  const locale = useAppStore((s) => s.locale);
  const showToast = useAppStore((s) => s.showToast);
  const qc = useQueryClient();

  const isFa = locale === 'fa';

  // PDF Studio state
  const [localPdfBytes, setLocalPdfBytes] = useState<Uint8Array | null>(null);
  const [localPdfName, setLocalPdfName] = useState<string | null>(null);
  const [pdfInspection, setPdfInspection] = useState<PdfInspectionResult | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [pdfViewMode, setPdfViewMode] = useState<'preview' | 'text'>('preview');
  const [convertingKind, setConvertingKind] = useState<'png' | 'all-png' | 'docx' | null>(null);
  const [sendResultToChat, setSendResultToChat] = useState(true);

  // Jalali Converter & Monthly Calendar state
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => today.toISOString().slice(0, 10), [today]);
  const todayJalali = useMemo(
    () => gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    [today]
  );
  const [gregInput, setGregInput] = useState(() => todayIso);
  const [jyInput, setJyInput] = useState(todayJalali.jy);
  const [jmInput, setJmInput] = useState(todayJalali.jm);
  const [jdInput, setJdInput] = useState(todayJalali.jd);
  const [calYear, setCalYear] = useState(todayJalali.jy);
  const [calMonth, setCalMonth] = useState(todayJalali.jm);
  const [diffDateA, setDiffDateA] = useState(() => todayIso);
  const [diffDateB, setDiffDateB] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  // Financial & Data Unit Calculator state
  const [unitPrice, setUnitPrice] = useState(1250000);
  const [quantity, setQuantity] = useState(4);
  const [discountPct, setDiscountPct] = useState(5);
  const [vatRate, setVatRate] = useState(10);
  const [currencyUnit, setCurrencyUnit] = useState<'toman' | 'rial'>('toman');
  const [dataValue, setDataValue] = useState(25);
  const [dataUnit, setDataUnit] = useState<'B' | 'KB' | 'MB' | 'GB'>('MB');

  // QR Code Generator state
  const [qrText, setQrText] = useState('https://esfahan-chalak.ir');
  const [qrDarkColor, setQrDarkColor] = useState('#dc2626');
  const [qrSize, setQrSize] = useState<240 | 320 | 512>(320);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrSending, setQrSending] = useState(false);

  // Quick Notes state
  const [notes, setNotes] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('ws_daily_notes') || '' : ''
  );

  const filesQuery = useQuery({
    queryKey: ['org-files-pdfs', workspaceId],
    queryFn: () => api.getFiles({ workspaceId, type: 'document' }),
    enabled: dailyToolsOpen && dailyToolsTab === 'pdf',
  });

  const pdfFiles = useMemo(
    () =>
      (filesQuery.data?.files || []).filter(
        (f) => f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.fileName)
      ),
    [filesQuery.data]
  );

  // Determine active PDF source
  const activePdfName = localPdfName || dailyToolsPdfAttachment?.fileName || pdfFiles[0]?.fileName || null;
  const activePdfUrl = !localPdfBytes ? dailyToolsPdfAttachment?.url || pdfFiles[0]?.url || null : null;

  useEffect(() => {
    if (!dailyToolsOpen || dailyToolsTab !== 'pdf') return;
    const source: string | Uint8Array | null = localPdfBytes || activePdfUrl;
    if (!source) {
      setPdfInspection(null);
      setPdfError(null);
      return;
    }

    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    inspectPdfSource(source, { maxPages: 8, scale: 1.35 })
      .then((res) => {
        if (cancelled) return;
        setPdfInspection(res);
        setActivePage(1);
      })
      .catch((err) => {
        if (cancelled) return;
        setPdfInspection(null);
        setPdfError((err as Error).message || 'Failed to inspect PDF');
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dailyToolsOpen, dailyToolsTab, localPdfBytes, activePdfUrl]);

  useEffect(() => {
    if (!dailyToolsOpen || dailyToolsTab !== 'qr') return;
    const target = qrText.trim() || 'https://esfahan-chalak.ir';
    let cancelled = false;
    QRCode.toDataURL(target, {
      width: qrSize,
      margin: 2,
      color: { dark: qrDarkColor, light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [dailyToolsOpen, dailyToolsTab, qrText, qrDarkColor, qrSize]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ws_daily_notes', notes);
    }
  }, [notes]);

  useEffect(() => {
    if (!dailyToolsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDailyToolsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dailyToolsOpen, setDailyToolsOpen]);

  const handleLocalPdfUpload = async (file: File) => {
    const buf = await file.arrayBuffer();
    setLocalPdfBytes(new Uint8Array(buf));
    setLocalPdfName(file.name);
  };

  const handleConvertPng = async () => {
    const source: string | Uint8Array | null = localPdfBytes || activePdfUrl;
    if (!source || !activePdfName) return;
    setConvertingKind('png');
    try {
      const pngBlob = await renderPdfPageToPngBlob(source, activePage, 2.0);
      const outName = replaceFileExtension(activePdfName, `page-${activePage}.png`);
      triggerBlobDownload(pngBlob, outName);

      if (sendResultToChat && activeChannel) {
        const att = await api.uploadFilePresigned(
          activeChannel.id,
          new File([pngBlob], outName, { type: 'image/png' }),
          outName
        );
        await onSendToChat({
          content: isFa
            ? `خروجی تصویر صفحه ${activePage} از فایل **${activePdfName}**`
            : `Converted page ${activePage} of **${activePdfName}** to PNG`,
          attachmentIds: [att.id],
        });
        qc.invalidateQueries({ queryKey: ['messages', activeChannel.id] });
      }
      showToast(isFa ? `فایل ${outName} آماده و دانلود شد` : `Converted & downloaded ${outName}`);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setConvertingKind(null);
    }
  };

  const handleExportAllPng = async () => {
    const source: string | Uint8Array | null = localPdfBytes || activePdfUrl;
    if (!source || !activePdfName || !pdfInspection) return;
    setConvertingKind('all-png');
    try {
      const totalPages = Math.min(pdfInspection.pageCount, 12);
      const uploadedIds: string[] = [];
      for (let p = 1; p <= totalPages; p++) {
        const pngBlob = await renderPdfPageToPngBlob(source, p, 1.75);
        const outName = replaceFileExtension(activePdfName, `page-${p}.png`);
        triggerBlobDownload(pngBlob, outName);
        if (sendResultToChat && activeChannel && p <= 4) {
          const att = await api.uploadFilePresigned(
            activeChannel.id,
            new File([pngBlob], outName, { type: 'image/png' }),
            outName
          );
          uploadedIds.push(att.id);
        }
      }
      if (sendResultToChat && activeChannel && uploadedIds.length > 0) {
        await onSendToChat({
          content: isFa
            ? `خروجی تصویر ${totalPages} صفحه از فایل **${activePdfName}**`
            : `Exported ${totalPages} pages of **${activePdfName}** as PNG images`,
          attachmentIds: uploadedIds,
        });
        qc.invalidateQueries({ queryKey: ['messages', activeChannel.id] });
      }
      showToast(
        isFa ? `${totalPages} صفحه با فرمت PNG ذخیره شد` : `Exported ${totalPages} PNG pages`
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setConvertingKind(null);
    }
  };

  const handleConvertDocx = async () => {
    const source: string | Uint8Array | null = localPdfBytes || activePdfUrl;
    if (!source || !activePdfName) return;
    setConvertingKind('docx');
    try {
      const { blob, pageCount } = await convertPdfSourceToDocxBlob(
        source,
        activePdfName.replace(/\.pdf$/i, '')
      );
      const outName = replaceFileExtension(activePdfName, 'docx');
      triggerBlobDownload(blob, outName);

      if (sendResultToChat && activeChannel) {
        const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const att = await api.uploadFilePresigned(
          activeChannel.id,
          new File([blob], outName, { type: mime }),
          outName
        );
        await onSendToChat({
          content: isFa
            ? `تبدیل PDF به Word انجام شد (${pageCount} صفحه): **${outName}**`
            : `Converted PDF (${pageCount} pages) to Word: **${outName}**`,
          attachmentIds: [att.id],
        });
        qc.invalidateQueries({ queryKey: ['messages', activeChannel.id] });
      }
      showToast(isFa ? `سند ورد ${outName} ساخته و دانلود شد` : `Converted & downloaded ${outName}`);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setConvertingKind(null);
    }
  };

  const handleSendQrToChat = async () => {
    if (!qrDataUrl || !activeChannel) return;
    setQrSending(true);
    try {
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      const fileName = `qr-esfahan-chalak-${Date.now()}.png`;
      const att = await api.uploadFilePresigned(
        activeChannel.id,
        new File([blob], fileName, { type: 'image/png' }),
        fileName
      );
      await onSendToChat({
        content: isFa
          ? `رمزینه پاسخ سریع (QR Code) برای: ${qrText.trim()}`
          : `Generated QR Code for: ${qrText.trim()}`,
        attachmentIds: [att.id],
      });
      qc.invalidateQueries({ queryKey: ['messages', activeChannel.id] });
      showToast(isFa ? 'رمزینه QR به کانال ارسال شد' : 'QR Code posted to channel');
      setDailyToolsOpen(false);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setQrSending(false);
    }
  };

  // Computed Jalali/Gregorian values
  const parsedGreg = useMemo(() => {
    const [y, m, d] = gregInput.split('-').map(Number);
    if (!y || !m || !d) return null;
    return gregorianToJalali(y, m, d);
  }, [gregInput]);

  const parsedJalaliToGreg = useMemo(() => {
    if (!jyInput || !jmInput || !jdInput) return null;
    const g = jalaliToGregorian(jyInput, jmInput, jdInput);
    return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  }, [jyInput, jmInput, jdInput]);

  const calendarGrid = useMemo(
    () => getJalaliMonthCalendarGrid(calYear, calMonth),
    [calYear, calMonth]
  );

  const dayDiffCount = useMemo(
    () => diffDaysBetweenDates(diffDateA, diffDateB),
    [diffDateA, diffDateB]
  );

  const financialResult = useMemo(
    () =>
      calculateFinancialSuite({
        unitPrice,
        quantity,
        discountPct,
        vatRatePct: vatRate,
      }),
    [unitPrice, quantity, discountPct, vatRate]
  );

  const dataConversions = useMemo(() => {
    const safe = Number.isFinite(dataValue) ? Math.max(0, dataValue) : 0;
    const mult: Record<'B' | 'KB' | 'MB' | 'GB', number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };
    const bytes = safe * mult[dataUnit];
    return {
      B: bytes,
      KB: bytes / 1024,
      MB: bytes / (1024 * 1024),
      GB: bytes / (1024 * 1024 * 1024),
    };
  }, [dataValue, dataUnit]);

  const stepCalendarMonth = (delta: number) => {
    let nextMonth = calMonth + delta;
    let nextYear = calYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setCalYear(nextYear);
    setCalMonth(nextMonth);
  };

  const currencyFactor = currencyUnit === 'rial' ? 10 : 1;
  const currencyLabel = isFa ? (currencyUnit === 'rial' ? 'ریال' : 'تومان') : currencyUnit === 'rial' ? 'IRR' : 'Toman';

  const currentPagePreview = pdfInspection?.pages[activePage - 1];

  return (
    <AnimatePresence>
      {dailyToolsOpen && (
        <motion.div
          role="dialog"
          aria-label={isFa ? 'ابزارهای کاربردی روزانه و استودیو PDF' : 'Daily Enterprise Tools & PDF Studio'}
          data-testid="daily-tools-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 bg-neutral-950/65 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="w-full max-w-4xl max-h-[90vh] rounded-3xl ios-glass-strong bg-white/95 dark:bg-neutral-900/95 border border-white/70 dark:border-neutral-800 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="h-14 px-5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl ios-glass-selected flex items-center justify-center shrink-0">
                  <Wrench className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display font-bold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                    {isFa ? 'جعبه ابزار هوشمند و مبدل PDF اصفهان چالاک' : 'Daily Utility Suite & PDF Converter Studio'}
                  </h2>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                    {isFa
                      ? 'بررسی و تبدیل PDF، تقویم کامل شمسی، محاسبه‌گر مالی، تولید QR و یادداشت سریع'
                      : 'PDF review & PNG/DOCX conversion, full Jalali calendar, finance calc, QR studio & scratchpad'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDailyToolsOpen(false)}
                aria-label={isFa ? 'بستن جعبه ابزار' : 'Close daily tools'}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* iOS 27 Glass Tab Bar */}
            <div className="px-5 py-2.5 border-b border-neutral-200/70 dark:border-neutral-800 flex flex-wrap items-center gap-1.5 bg-neutral-50/70 dark:bg-neutral-900/60 shrink-0">
              {(
                [
                  {
                    id: 'pdf' as const,
                    icon: FileText,
                    label: isFa ? 'بررسی و تبدیل PDF' : 'PDF Review & Convert',
                    tipFa: 'بررسی صفحات PDF و تبدیل مستقیم به Word یا عکس',
                    tipEn: 'Inspect PDF pages & convert to Word (.docx) or PNG',
                  },
                  {
                    id: 'jalali' as const,
                    icon: CalendarDays,
                    label: isFa ? 'تقویم شمسی و مبدل' : 'Jalali Calendar',
                    tipFa: 'تقویم ماهانه شمسی، تبدیل تاریخ و محاسبه اختلاف روزها',
                    tipEn: 'Monthly Jalali grid, date converter & day diff calculator',
                  },
                  {
                    id: 'calc' as const,
                    icon: Calculator,
                    label: isFa ? 'مالی، تخفیف و واحدها' : 'Finance & Units',
                    tipFa: 'محاسبه فاکتور با تخفیف و مالیات + مبدل واحد حجم فایل',
                    tipEn: 'Invoice breakdown (discount + VAT) & data unit converter',
                  },
                  {
                    id: 'qr' as const,
                    icon: QrCode,
                    label: isFa ? 'تولید QR Code' : 'QR Studio',
                    tipFa: 'ساخت رمزینه QR برای لینک‌ها و اسناد با امکان ارسال به چت',
                    tipEn: 'Generate custom QR codes for links and share to chat',
                  },
                  {
                    id: 'notes' as const,
                    icon: StickyNote,
                    label: isFa ? 'یادداشت سریع' : 'Quick Notes',
                    tipFa: 'دفترچه یادداشت فوری با امکان ارسال به کانال',
                    tipEn: 'Persistent scratchpad with one-click share to chat',
                  },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = dailyToolsTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`daily-tools-tab-${t.id}`}
                    onClick={() => setDailyToolsOpen(true, t.id)}
                    {...tipProps(t.tipFa, t.tipEn)}
                    className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                      active
                        ? 'ios-glass-selected text-white shadow-sm'
                        : 'text-neutral-600 dark:text-neutral-300 hover:bg-red-50/70 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* 1. PDF REVIEW & CONVERTER STUDIO */}
              {dailyToolsTab === 'pdf' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800">
                    <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                      <select
                        value={localPdfBytes ? '__local__' : dailyToolsPdfAttachment?.id || pdfFiles[0]?.id || ''}
                        onChange={(e) => {
                          const found = pdfFiles.find((f) => f.id === e.target.value);
                          if (found) {
                            setLocalPdfBytes(null);
                            setLocalPdfName(null);
                            openPdfStudio(found);
                          }
                        }}
                        aria-label={isFa ? 'انتخاب فایل PDF از چت' : 'Choose PDF from workspace'}
                        className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 max-w-xs"
                      >
                        {localPdfName && <option value="__local__">{localPdfName} (Local)</option>}
                        {pdfFiles.length === 0 && !localPdfName && (
                          <option value="">{isFa ? 'فایل PDF در کانال‌ها یافت نشد' : 'No PDF files in workspace yet'}</option>
                        )}
                        {pdfFiles.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.fileName} (#{f.channelName || 'file'})
                          </option>
                        ))}
                      </select>

                      <label
                        {...tipProps('بارگذاری فایل PDF از سیستم برای بررسی یا تبدیل', 'Load a local PDF file to review or convert')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-medium cursor-pointer hover:bg-red-100/80 transition-colors whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isFa ? 'انتخاب PDF از سیستم' : 'Upload Local PDF'}</span>
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleLocalPdfUpload(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={sendResultToChat}
                          onChange={(e) => setSendResultToChat(e.target.checked)}
                          className="accent-red-600 rounded"
                        />
                        <span>{isFa ? 'ارسال خروجی به چت فعال' : 'Also post to active chat'}</span>
                      </label>

                      <button
                        type="button"
                        data-testid="pdf-convert-png-btn"
                        disabled={!pdfInspection || convertingKind !== null}
                        onClick={handleConvertPng}
                        {...tipProps('تبدیل صفحه فعلی PDF به تصویر PNG با کیفیت بالا', 'Convert current PDF page to high-res PNG image')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-400 text-xs font-semibold text-neutral-800 dark:text-neutral-100 disabled:opacity-45 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        {convertingKind === 'png' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" /> : <FileImage className="w-3.5 h-3.5 text-red-600" />}
                        <span>{isFa ? 'تبدیل صفحه به PNG' : 'Page → PNG'}</span>
                      </button>

                      <button
                        type="button"
                        data-testid="pdf-export-all-png-btn"
                        disabled={!pdfInspection || convertingKind !== null}
                        onClick={handleExportAllPng}
                        {...tipProps('تبدیل و دانلود همه صفحات PDF به صورت تصویر PNG', 'Export all PDF pages as PNG images')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-400 text-xs font-semibold text-neutral-800 dark:text-neutral-100 disabled:opacity-45 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        {convertingKind === 'all-png' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" /> : <Download className="w-3.5 h-3.5 text-red-600" />}
                        <span>{isFa ? 'خروجی PNG همه صفحات' : 'All Pages PNG'}</span>
                      </button>

                      <button
                        type="button"
                        data-testid="pdf-convert-docx-btn"
                        disabled={!pdfInspection || convertingKind !== null}
                        onClick={handleConvertDocx}
                        {...tipProps('استخراج متن و تبدیل PDF به فایل Word (.docx)', 'Convert PDF document to editable Word (.docx)')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ios-glass-selected text-xs font-semibold disabled:opacity-45 whitespace-nowrap cursor-pointer"
                      >
                        {convertingKind === 'docx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                        <span>{isFa ? 'تبدیل به Word (.docx)' : 'Convert to Word (.docx)'}</span>
                      </button>
                    </div>
                  </div>

                  {pdfLoading ? (
                    <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-neutral-500">
                      <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                      <span>{isFa ? 'در حال تحلیل و رندر صفحات PDF...' : 'Inspecting & rendering PDF pages...'}</span>
                    </div>
                  ) : pdfError ? (
                    <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                      {pdfError}
                    </div>
                  ) : pdfInspection ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPdfViewMode('preview')}
                            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                              pdfViewMode === 'preview'
                                ? 'ios-glass-selected-soft text-red-700 dark:text-red-300'
                                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`}
                          >
                            {isFa ? 'بررسی بصری صفحات' : 'Visual Page Review'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPdfViewMode('text')}
                            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                              pdfViewMode === 'text'
                                ? 'ios-glass-selected-soft text-red-700 dark:text-red-300'
                                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`}
                          >
                            {isFa ? 'خلاصه متن استخراج‌شده' : 'Extracted Text Review'}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={activePage <= 1}
                            onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                            aria-label="Previous PDF page"
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-mono text-xs tabular-nums text-neutral-700 dark:text-neutral-200">
                            {isFa
                              ? `صفحه ${activePage} از ${pdfInspection.pageCount}`
                              : `Page ${activePage} of ${pdfInspection.pageCount}`}
                          </span>
                          <button
                            type="button"
                            disabled={activePage >= pdfInspection.pages.length}
                            onClick={() => setActivePage((p) => Math.min(pdfInspection.pages.length, p + 1))}
                            aria-label="Next PDF page"
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {pdfViewMode === 'preview' && currentPagePreview ? (
                        <div className="rounded-2xl bg-neutral-100/80 dark:bg-neutral-950/70 border border-neutral-200 dark:border-neutral-800 p-4 flex flex-col items-center gap-3">
                          <img
                            src={currentPagePreview.dataUrl}
                            alt={`${activePdfName} page ${activePage}`}
                            className="max-h-[420px] w-auto rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 bg-white"
                          />
                          {currentPagePreview.text && (
                            <div className="w-full p-3 rounded-xl bg-white/90 dark:bg-neutral-900/90 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                              <span className="font-semibold text-red-600 dark:text-red-400 me-1.5">
                                {isFa ? 'پیش‌خوانی متن صفحه:' : 'Page Text Summary:'}
                              </span>
                              {currentPagePreview.text}
                            </div>
                          )}
                        </div>
                      ) : (
                        <pre className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-xs leading-relaxed whitespace-pre-wrap text-neutral-800 dark:text-neutral-200 max-h-[420px] overflow-y-auto">
                          {pdfInspection.fullText || (isFa ? 'متن قابل استخراج در این PDF یافت نشد.' : 'No selectable text detected in this PDF.')}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-neutral-500">
                      {isFa
                        ? 'یک فایل PDF از لیست بالا یا از سیستم خود انتخاب کنید تا پیش‌نمایش و ابزار تبدیل فعال شود.'
                        : 'Select a workspace PDF or upload one from your device to inspect and convert.'}
                    </div>
                  )}
                </div>
              )}

              {/* 2. FULL JALALI CALENDAR + CONVERTER + DIFF */}
              {dailyToolsTab === 'jalali' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl ios-glass-selected-soft flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-red-700 dark:text-red-300">
                        {isFa ? 'تاریخ امروز به هجری شمسی و میلادی' : "Today's Synchronized Date"}
                      </div>
                      <div className="font-display font-bold text-base text-neutral-900 dark:text-neutral-100 mt-0.5">
                        {formatJalaliString(todayJalali, true)} · {todayIso}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `${formatJalaliString(todayJalali, true)} (${todayIso})`;
                        setComposerQuoteDraft(snippet);
                        setDailyToolsOpen(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ios-glass-selected text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isFa ? 'درج در پیام' : 'Insert in Message'}</span>
                    </button>
                  </div>

                  {/* Interactive Monthly Jalali Calendar Grid */}
                  <div
                    data-testid="jalali-month-grid"
                    className="p-4 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-bold text-sm text-neutral-900 dark:text-neutral-100">
                          {calendarGrid.monthName} {calendarGrid.year}
                        </h3>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-200/80 dark:border-red-900/60">
                          {isJalaliLeapYear(calYear)
                            ? isFa
                              ? 'سال کبیسه (۳۶۶ روز)'
                              : 'Leap Year (366d)'
                            : isFa
                              ? 'سال عادی (۳۶۵ روز)'
                              : 'Standard Year'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCalYear(todayJalali.jy);
                            setCalMonth(todayJalali.jm);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium hover:border-red-400"
                        >
                          {isFa ? 'امروز' : 'Today'}
                        </button>
                        <button
                          type="button"
                          data-testid="jalali-prev-month-btn"
                          onClick={() => stepCalendarMonth(-1)}
                          aria-label={isFa ? 'ماه قبل' : 'Previous Jalali month'}
                          className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          data-testid="jalali-next-month-btn"
                          onClick={() => stepCalendarMonth(1)}
                          aria-label={isFa ? 'ماه بعد' : 'Next Jalali month'}
                          className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                      {JALALI_WEEKDAYS_SHORT_FA.map((w, i) => (
                        <div key={w} className={`py-1 ${i === 6 ? 'text-red-600 dark:text-red-400' : ''}`}>
                          {w}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {calendarGrid.cells.map((cell, idx) => {
                        if (!cell.day || !cell.jalali || !cell.gregorian) {
                          return <div key={`empty-${idx}`} className="h-10 rounded-xl" />;
                        }
                        const isToday =
                          cell.jalali.jy === todayJalali.jy &&
                          cell.jalali.jm === todayJalali.jm &&
                          cell.jalali.jd === todayJalali.jd;
                        const isSelected =
                          cell.jalali.jy === jyInput &&
                          cell.jalali.jm === jmInput &&
                          cell.jalali.jd === jdInput;
                        const isFriday = idx % 7 === 6;

                        return (
                          <button
                            key={`${cell.jalali.jy}-${cell.jalali.jm}-${cell.day}`}
                            type="button"
                            onClick={() => {
                              setJyInput(cell.jalali!.jy);
                              setJmInput(cell.jalali!.jm);
                              setJdInput(cell.jalali!.jd);
                              setGregInput(
                                `${cell.gregorian!.gy}-${String(cell.gregorian!.gm).padStart(2, '0')}-${String(cell.gregorian!.gd).padStart(2, '0')}`
                              );
                            }}
                            className={`h-10 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                              isSelected
                                ? 'ios-glass-selected border-red-500 font-bold'
                                : isToday
                                  ? 'bg-red-50 dark:bg-red-950/40 border-red-400 text-red-700 dark:text-red-300 font-bold'
                                  : isFriday
                                    ? 'border-transparent hover:bg-red-50/60 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400'
                                    : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                            }`}
                          >
                            <span className="text-xs leading-none">{cell.day}</span>
                            <span className={`text-[9px] font-mono leading-none mt-0.5 ${isSelected ? 'text-white/80' : 'text-neutral-400'}`}>
                              {cell.gregorian.gd}/{cell.gregorian.gm}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Converters + Date Diff */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                      <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-100">
                        {isFa ? 'میلادی ← شمسی' : 'Gregorian → Jalali'}
                      </h3>
                      <input
                        type="date"
                        value={gregInput}
                        onChange={(e) => setGregInput(e.target.value)}
                        aria-label="Gregorian date input"
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      />
                      <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 text-xs font-semibold text-red-600 dark:text-red-400">
                        {parsedGreg ? formatJalaliString(parsedGreg, true) : '—'}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                      <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-100">
                        {isFa ? 'شمسی ← میلادی' : 'Jalali → Gregorian'}
                      </h3>
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="number"
                          value={jyInput}
                          onChange={(e) => setJyInput(Number(e.target.value))}
                          min={1300}
                          max={1500}
                          aria-label="Jalali year"
                          className="px-2 py-2 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                        />
                        <select
                          value={jmInput}
                          onChange={(e) => setJmInput(Number(e.target.value))}
                          aria-label="Jalali month"
                          className="px-1.5 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                        >
                          {JALALI_MONTHS_FA.map((m, idx) => (
                            <option key={m} value={idx + 1}>
                              {idx + 1} - {m}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={jdInput}
                          onChange={(e) => setJdInput(Number(e.target.value))}
                          min={1}
                          max={31}
                          aria-label="Jalali day"
                          className="px-2 py-2 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 text-xs font-mono font-semibold text-red-600 dark:text-red-400">
                        {parsedJalaliToGreg || '—'}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                      <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-100">
                        {isFa ? 'محاسبه اختلاف دو تاریخ' : 'Date Difference'}
                      </h3>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="date"
                          value={diffDateA}
                          onChange={(e) => setDiffDateA(e.target.value)}
                          aria-label="Start date"
                          className="px-2 py-1.5 text-[11px] font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                        />
                        <input
                          type="date"
                          value={diffDateB}
                          onChange={(e) => setDiffDateB(e.target.value)}
                          aria-label="End date"
                          className="px-2 py-1.5 text-[11px] font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                        {isFa ? `${dayDiffCount} روز تقویمی` : `${dayDiffCount} calendar days`}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. FINANCIAL & DATA UNIT CALCULATOR */}
              {dailyToolsTab === 'calc' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-100">
                      {isFa ? 'محاسبه‌گر فاکتور (تخفیف + مالیات ارزش افزوده)' : 'Invoice Calculator (Discount + VAT)'}
                    </h3>
                    <div className="inline-flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-1">
                      <button
                        type="button"
                        onClick={() => setCurrencyUnit('toman')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          currencyUnit === 'toman' ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {isFa ? 'تومان' : 'Toman'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrencyUnit('rial')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          currencyUnit === 'rial' ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {isFa ? 'ریال' : 'IRR'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        {isFa ? 'مبلغ واحد (تومان)' : 'Unit Price'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        {isFa ? 'تعداد / مقدار' : 'Quantity'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        {isFa ? 'تخفیف (٪)' : 'Discount (%)'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={discountPct}
                        onChange={(e) => setDiscountPct(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        {isFa ? 'ارزش افزوده (٪)' : 'VAT / Tax (%)'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={vatRate}
                        onChange={(e) => setVatRate(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800">
                      <div className="text-[11px] text-neutral-500">{isFa ? 'مبلغ ناخالص' : 'Gross'}</div>
                      <div className="mt-1 font-mono font-bold text-base text-neutral-900 dark:text-neutral-100 tabular-nums">
                        {(financialResult.gross * currencyFactor).toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800">
                      <div className="text-[11px] text-neutral-500">{isFa ? `تخفیف (${discountPct}٪)` : `Discount (${discountPct}%)`}</div>
                      <div className="mt-1 font-mono font-bold text-base text-emerald-600 dark:text-emerald-400 tabular-nums">
                        -{(financialResult.discountAmount * currencyFactor).toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800">
                      <div className="text-[11px] text-neutral-500">{isFa ? `مالیات (${vatRate}٪)` : `VAT (${vatRate}%)`}</div>
                      <div className="mt-1 font-mono font-bold text-base text-amber-600 dark:text-amber-400 tabular-nums">
                        {(financialResult.vatAmount * currencyFactor).toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl ios-glass-selected-soft">
                      <div className="text-[11px] font-semibold text-red-700 dark:text-red-300">
                        {isFa ? `جمع کل (${currencyLabel})` : `Grand Total (${currencyLabel})`}
                      </div>
                      <div className="mt-1 font-mono font-bold text-base text-red-700 dark:text-red-300 tabular-nums">
                        {(financialResult.total * currencyFactor).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const summary = isFa
                          ? `برآورد مالی: ناخالص ${(financialResult.gross * currencyFactor).toLocaleString()} | تخفیف ${(financialResult.discountAmount * currencyFactor).toLocaleString()} | مالیات ${(financialResult.vatAmount * currencyFactor).toLocaleString()} | قابل پرداخت ${(financialResult.total * currencyFactor).toLocaleString()} ${currencyLabel}`
                          : `Invoice Summary: Gross ${(financialResult.gross * currencyFactor).toLocaleString()} | Discount ${(financialResult.discountAmount * currencyFactor).toLocaleString()} | VAT ${(financialResult.vatAmount * currencyFactor).toLocaleString()} | Total ${(financialResult.total * currencyFactor).toLocaleString()} ${currencyLabel}`;
                        navigator.clipboard?.writeText(summary).catch(() => {});
                        showToast(isFa ? 'خلاصه فاکتور کپی شد' : 'Invoice summary copied');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{isFa ? 'کپی خلاصه فاکتور' : 'Copy Invoice'}</span>
                    </button>

                    {activeChannel && (
                      <button
                        type="button"
                        onClick={async () => {
                          const msg = isFa
                            ? `**برآورد مالی:** جمع پایه ${(financialResult.subtotal * currencyFactor).toLocaleString()} + مالیات (${vatRate}٪) ${(financialResult.vatAmount * currencyFactor).toLocaleString()} = **${(financialResult.total * currencyFactor).toLocaleString()} ${currencyLabel}**`
                            : `**Cost Breakdown:** Subtotal ${(financialResult.subtotal * currencyFactor).toLocaleString()} + VAT (${vatRate}%) ${(financialResult.vatAmount * currencyFactor).toLocaleString()} = **${(financialResult.total * currencyFactor).toLocaleString()} ${currencyLabel}**`;
                          await onSendToChat({ content: msg });
                          setDailyToolsOpen(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ios-glass-selected text-xs font-semibold cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isFa ? `ارسال خلاصه مالی به #${activeChannel.name}` : `Post Summary to #${activeChannel.name}`}</span>
                      </button>
                    )}
                  </div>

                  {/* Quick Data / File Size Converter */}
                  <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 dark:text-neutral-100">
                      <HardDrive className="w-3.5 h-3.5 text-red-600" />
                      <span>{isFa ? 'تبدیل سریع واحد حجم فایل و داده' : 'File & Data Size Converter'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={dataValue}
                        onChange={(e) => setDataValue(Number(e.target.value))}
                        aria-label="Data value"
                        className="w-32 px-3 py-1.5 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      />
                      <select
                        value={dataUnit}
                        onChange={(e) => setDataUnit(e.target.value as 'B' | 'KB' | 'MB' | 'GB')}
                        aria-label="Data unit"
                        className="px-3 py-1.5 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                      >
                        <option value="B">Bytes (B)</option>
                        <option value="KB">Kilobytes (KB)</option>
                        <option value="MB">Megabytes (MB)</option>
                        <option value="GB">Gigabytes (GB)</option>
                      </select>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-neutral-600 dark:text-neutral-300">
                        <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                          {dataConversions.KB.toLocaleString(undefined, { maximumFractionDigits: 2 })} KB
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                          {dataConversions.MB.toLocaleString(undefined, { maximumFractionDigits: 3 })} MB
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                          {dataConversions.GB.toLocaleString(undefined, { maximumFractionDigits: 4 })} GB
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. QR CODE STUDIO */}
              {dailyToolsTab === 'qr' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="p-4 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-100 mb-1.5">
                        {isFa ? 'متن یا نشانی وب (URL)' : 'Text or URL to encode'}
                      </label>
                      <textarea
                        rows={3}
                        value={qrText}
                        onChange={(e) => setQrText(e.target.value)}
                        data-testid="qr-text-input"
                        placeholder="https://esfahan-chalak.ir"
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1.5">
                          {isFa ? 'رنگ رمزینه' : 'QR Color'}
                        </div>
                        <div className="flex items-center gap-2">
                          {[
                            { color: '#dc2626', label: 'Red' },
                            { color: '#171717', label: 'Ink' },
                            { color: '#0f172a', label: 'Navy' },
                          ].map((sw) => (
                            <button
                              key={sw.color}
                              type="button"
                              onClick={() => setQrDarkColor(sw.color)}
                              aria-label={sw.label}
                              className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform ${
                                qrDarkColor === sw.color ? 'border-red-500 scale-110' : 'border-neutral-300 dark:border-neutral-700'
                              }`}
                              style={{ backgroundColor: sw.color }}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1.5">
                          {isFa ? 'ابعاد تصویر' : 'Output Size'}
                        </div>
                        <select
                          value={qrSize}
                          onChange={(e) => setQrSize(Number(e.target.value) as 240 | 320 | 512)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                        >
                          <option value={240}>240 × 240 px</option>
                          <option value={320}>320 × 320 px</option>
                          <option value={512}>512 × 512 px</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      {qrDataUrl && (
                        <a
                          href={qrDataUrl}
                          download="esfahan-chalak-qr.png"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:border-red-400"
                        >
                          <Download className="w-3.5 h-3.5 text-red-600" />
                          <span>{isFa ? 'دانلود PNG' : 'Download PNG'}</span>
                        </a>
                      )}
                      {activeChannel && (
                        <button
                          type="button"
                          disabled={!qrDataUrl || qrSending}
                          onClick={handleSendQrToChat}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl ios-glass-selected text-xs font-semibold disabled:opacity-50 cursor-pointer"
                        >
                          {qrSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          <span>{isFa ? `ارسال به #${activeChannel.name}` : `Share to #${activeChannel.name}`}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-800 flex flex-col items-center justify-center gap-3 min-h-[260px]">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="Generated QR Code"
                        data-testid="qr-preview-img"
                        className="w-52 h-52 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-md bg-white p-2"
                      />
                    ) : (
                      <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                    )}
                    <span className="text-[11px] font-mono text-neutral-500 truncate max-w-full">
                      {qrText.trim() || 'https://esfahan-chalak.ir'}
                    </span>
                  </div>
                </div>
              )}

              {/* 5. QUICK SCRATCHPAD */}
              {dailyToolsTab === 'notes' && (
                <div className="space-y-3">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={8}
                    placeholder={
                      isFa
                        ? 'یادداشت‌های جلسه، چک‌لیست روزانه یا پیش‌نویس گزارش خود را اینجا بنویسید (ذخیره خودکار)...'
                        : 'Write meeting notes, quick reminders, or report drafts here (auto-saved locally)...'
                    }
                    className="w-full p-4 rounded-2xl bg-neutral-50/90 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 text-xs leading-relaxed text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-red-500"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-red-500" />
                      {isFa ? 'ذخیره خودکار در مرورگر شما' : 'Auto-saved in browser storage'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(notes).catch(() => {});
                          showToast(isFa ? 'یادداشت کپی شد' : 'Notes copied');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isFa ? 'کپی' : 'Copy'}</span>
                      </button>
                      {activeChannel && notes.trim() && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onSendToChat({ content: notes.trim() });
                            setDailyToolsOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl ios-glass-selected text-xs font-semibold cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isFa ? 'ارسال به کانال' : 'Send to Channel'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
