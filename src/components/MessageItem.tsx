import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Archive,
  Bookmark,
  CheckCircle2,
  CheckSquare,
  Copy,
  CornerUpRight,
  Download,
  Edit3,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileText,
  History,
  Link2,
  Loader2,
  MessageSquare,
  Pause,
  Pin,
  Play,
  Quote,
  SmilePlus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { canPerformWithMatrix, formatBytes, replaceFileExtension } from '../utils/chatLogic';
import { formatAppDate } from '../utils/jalali';
import {
  convertPdfSourceToDocxBlob,
  renderPdfPageToPngBlob,
  triggerBlobDownload,
} from '../utils/pdfTools';
import { EmojiPicker } from './EmojiPicker';
import { tipProps } from './GlassTooltip';
import { lazyNamed } from '../lib/lazyNamed';
const PollResultChart = lazyNamed(() => import('./PollResultChart'), 'PollResultChart');
import { RichTextRenderer } from './RichTextRenderer';
import { UserAvatar } from './UserAvatar';
import type { Attachment, Channel, Message, TaskStatus } from '../types/index';

interface MessageItemProps {
  message: Message;
  channels: Channel[];
  isThreadView?: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onVotePoll: (pollId: string, optionId: string) => void;
  onToggleTask: (taskId: string, status: TaskStatus) => void;
  onConvertTask: (message: Message) => void;
  onPin: (messageId: string) => void;
  onArchive?: (messageId: string) => void;
  onBookmark: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onForward: (messageId: string, targetChannelId: string) => void;
}

const QUICK_EMOJIS = ['👍', '✅', '🚀', '👀', '🙌', '❤️'];
const WAVE_BARS = [0.35, 0.72, 0.5, 0.92, 0.65, 1, 0.45, 0.84, 0.6, 0.95, 0.55, 0.78, 0.42, 0.88, 0.62, 0.74, 0.48, 0.9, 0.56, 0.68];

function VoiceMessagePlayer({ attachment, isFa }: { attachment: Attachment; isFa: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnd = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = rate;
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const cycleRate = () => {
    const next: 1 | 1.5 | 2 = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const fmt = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div
      data-testid={`voice-player-${attachment.id}`}
      className="w-76 max-w-full p-2.5 rounded-2xl ios-glass-card border border-red-200/70 dark:border-red-900/50 flex items-center gap-2.5"
    >
      <audio ref={audioRef} src={attachment.url} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? (isFa ? 'توقف صدا' : 'Pause voice message') : isFa ? 'پخش پیام صوتی' : 'Play voice message'}
        className="w-9 h-9 rounded-xl ios-glass-selected flex items-center justify-center shrink-0 cursor-pointer"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ms-0.5" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div
          className="flex items-center gap-0.5 h-6 cursor-pointer"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = ratio * duration;
          }}
        >
          {WAVE_BARS.map((h, i) => {
            const filled = (i / WAVE_BARS.length) * 100 <= pct;
            return (
              <span
                key={i}
                style={{ height: `${Math.round(h * 100)}%` }}
                className={`flex-1 rounded-full transition-colors ${
                  filled ? 'bg-red-600 dark:bg-red-400' : 'bg-neutral-300 dark:bg-neutral-700'
                }`}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
          <span>
            {fmt(currentTime)} / {duration > 0 ? fmt(duration) : formatBytes(attachment.sizeBytes)}
          </span>
          <span className="truncate max-w-[110px]">{attachment.fileName}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={cycleRate}
        aria-label="Playback speed"
        className="px-1.5 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-mono text-[10px] font-bold shrink-0 cursor-pointer"
      >
        {rate}x
      </button>

      <a
        href={attachment.url}
        download={attachment.fileName}
        aria-label={`Download ${attachment.fileName}`}
        className="p-1 text-neutral-400 hover:text-red-600 shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

export function MessageItem({
  message,
  channels,
  isThreadView = false,
  onReact,
  onVotePoll,
  onToggleTask,
  onConvertTask,
  onPin,
  onArchive,
  onBookmark,
  onEdit,
  onDelete,
  onForward,
}: MessageItemProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const locale = useAppStore((s) => s.locale);
  const calendarSystem = useAppStore((s) => s.calendarSystem);
  const openThread = useAppStore((s) => s.openThread);
  const setPreviewFile = useAppStore((s) => s.setPreviewFile);
  const openPdfStudio = useAppStore((s) => s.openPdfStudio);
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const setComposerQuoteDraft = useAppStore((s) => s.setComposerQuoteDraft);
  const showToast = useAppStore((s) => s.showToast);

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);
  const [fullEmojiOpen, setFullEmojiOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [convertingAttachmentId, setConvertingAttachmentId] = useState<string | null>(null);

  const isFa = locale === 'fa';
  const isOwn = currentUser?.id === message.authorId;
  const canDelete =
    isOwn || canPerformWithMatrix(currentUser, 'message:delete_any', 'PUBLIC', rbacMatrix);
  const canPin = canPerformWithMatrix(currentUser, 'message:pin', 'PUBLIC', rbacMatrix);

  const formattedTime = formatAppDate(message.createdAt, {
    calendarSystem,
    locale,
    includeDate: false,
    includeTime: true,
  });

  const handleAttachmentContextMenu = (e: React.MouseEvent, att: Attachment) => {
    e.preventDefault();
    e.stopPropagation();
    const isPdf = att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.fileName);
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: att.fileName,
      items: [
        {
          id: 'att-review',
          icon: Eye,
          label: isFa ? 'بررسی سریع و پیش‌نمایش' : 'Quick Review & Preview',
          onSelect: () => setPreviewFile(att),
        },
        ...(isPdf
          ? [
              {
                id: 'att-to-png',
                icon: FileImage,
                label: isFa ? 'تبدیل PDF به تصویر (PNG)' : 'Convert PDF → PNG',
                onSelect: async () => {
                  setConvertingAttachmentId(att.id);
                  try {
                    const blob = await renderPdfPageToPngBlob(att.url, 1, 2.0);
                    const out = replaceFileExtension(att.fileName, 'png');
                    triggerBlobDownload(blob, out);
                    showToast(isFa ? `تصویر ${out} آماده و دانلود شد` : `Converted & downloaded ${out}`);
                  } catch (err) {
                    showToast((err as Error).message, 'error');
                  } finally {
                    setConvertingAttachmentId(null);
                  }
                },
              },
              {
                id: 'att-to-docx',
                icon: FileSpreadsheet,
                label: isFa ? 'تبدیل PDF به Word (.docx)' : 'Convert PDF → Word (.docx)',
                onSelect: async () => {
                  setConvertingAttachmentId(att.id);
                  try {
                    const { blob } = await convertPdfSourceToDocxBlob(
                      att.url,
                      att.fileName.replace(/\.pdf$/i, '')
                    );
                    const out = replaceFileExtension(att.fileName, 'docx');
                    triggerBlobDownload(blob, out);
                    showToast(isFa ? `فایل ورد ${out} دانلود شد` : `Converted & downloaded ${out}`);
                  } catch (err) {
                    showToast((err as Error).message, 'error');
                  } finally {
                    setConvertingAttachmentId(null);
                  }
                },
              },
              {
                id: 'att-studio',
                icon: Sparkles,
                label: isFa ? 'باز کردن در استودیو PDF' : 'Open in PDF Studio',
                onSelect: () => openPdfStudio(att),
              },
            ]
          : []),
        {
          id: 'att-copy-link',
          icon: Link2,
          label: isFa ? 'کپی لینک فایل' : 'Copy File Link',
          dividerAbove: true,
          onSelect: () => {
            navigator.clipboard?.writeText(window.location.origin + att.url).catch(() => {});
            showToast(isFa ? 'لینک فایل کپی شد' : 'File link copied');
          },
        },
        {
          id: 'att-download',
          icon: Download,
          label: isFa ? 'دانلود فایل' : 'Download File',
          onSelect: () => {
            const a = document.createElement('a');
            a.href = att.url;
            a.download = att.fileName;
            a.click();
          },
        },
      ],
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (message.deletedAt) return;
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: message.author.displayName,
      items: [
        ...(!isThreadView
          ? [
              {
                id: 'reply-thread',
                icon: MessageSquare,
                label: isFa ? 'پاسخ در رشته پیام (Thread)' : 'Reply in Thread',
                onSelect: () => openThread(message.id),
              },
            ]
          : []),
        {
          id: 'quote-reply',
          icon: Quote,
          label: isFa ? 'نقل‌قول در پاسخ' : 'Quote Reply',
          onSelect: () => {
            const firstLine = message.content.split('\n')[0].slice(0, 140);
            setComposerQuoteDraft(`${message.author.displayName}: ${firstLine}`);
          },
        },
        {
          id: 'copy-text',
          icon: Copy,
          label: isFa ? 'کپی متن پیام' : 'Copy Message Text',
          shortcut: 'Ctrl+C',
          onSelect: () => {
            navigator.clipboard?.writeText(message.content).catch(() => {});
            showToast(isFa ? 'متن پیام کپی شد' : 'Message copied');
          },
        },
        {
          id: 'react-like',
          icon: SmilePlus,
          label: isFa ? 'واکنش سریع 👍' : 'Quick React 👍',
          onSelect: () => onReact(message.id, '👍'),
        },
        {
          id: 'convert-task',
          icon: CheckSquare,
          label: isFa ? 'تبدیل پیام به تسک' : 'Convert to Action Item',
          onSelect: () => onConvertTask(message),
        },
        {
          id: 'bookmark',
          icon: Bookmark,
          label: message.isBookmarked
            ? isFa
              ? 'حذف از ذخیره‌شده‌ها'
              : 'Remove Bookmark'
            : isFa
              ? 'ذخیره پیام'
              : 'Save Bookmark',
          onSelect: () => onBookmark(message.id),
        },
        ...(canPin
          ? [
              {
                id: 'pin',
                icon: Pin,
                label: message.isPinned
                  ? isFa
                    ? 'برداشتن سنجاق پیام'
                    : 'Unpin Message'
                  : isFa
                    ? 'سنجاق به کانال'
                    : 'Pin to Channel',
                onSelect: () => onPin(message.id),
              },
            ]
          : []),
        ...(onArchive && (isOwn || canPin)
          ? [
              {
                id: 'archive',
                icon: Archive,
                label: isFa ? 'انتقال به بایگانی' : 'Move to Archive',
                onSelect: () => onArchive(message.id),
              },
            ]
          : []),
        ...(isOwn
          ? [
              {
                id: 'edit',
                icon: Edit3,
                label: isFa ? 'ویرایش پیام' : 'Edit Message',
                onSelect: () => {
                  setEditDraft(message.content);
                  setEditing(true);
                },
              },
            ]
          : []),
        ...(canDelete
          ? [
              {
                id: 'delete',
                icon: Trash2,
                label: isFa ? 'حذف پیام' : 'Delete Message',
                danger: true,
                dividerAbove: true,
                onSelect: () => onDelete(message.id),
              },
            ]
          : []),
      ],
    });
  };

  return (
    <motion.article
      data-testid={`message-item-${message.id}`}
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onContextMenu={handleContextMenu}
      className={`group relative px-4 lg:px-6 py-2.5 transition-colors hover:bg-red-50/35 dark:hover:bg-neutral-800/40 ${
        message.isPinned ? 'bg-red-50/45 dark:bg-red-950/15 border-s-2 border-red-500' : ''
      }`}
    >
      {/* Floating Hover Action Toolbar */}
      {!message.deletedAt && (
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity absolute -top-3 end-6 z-10 flex items-center gap-0.5 p-1 rounded-xl bg-white dark:bg-neutral-900 ios-glass-strong border border-neutral-200/80 dark:border-neutral-700 shadow-sm">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setEmojiMenuOpen((v) => !v);
                setFullEmojiOpen(false);
              }}
              aria-label={isFa ? 'افزودن واکنش' : 'Add reaction'}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-red-600"
            >
              <SmilePlus className="w-3.5 h-3.5" />
            </button>
            {emojiMenuOpen && (
              <div className="absolute top-8 end-0 flex items-center gap-1 p-1.5 rounded-xl bg-white dark:bg-neutral-900 ios-glass-strong border border-neutral-200 dark:border-neutral-700 shadow-md z-20">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      onReact(message.id, em);
                      setEmojiMenuOpen(false);
                    }}
                    className="w-7 h-7 rounded-lg hover:bg-red-50 dark:hover:bg-neutral-800 text-sm flex items-center justify-center"
                  >
                    {em}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setEmojiMenuOpen(false);
                    setFullEmojiOpen(true);
                  }}
                  title={isFa ? 'همه ایموجی‌ها' : 'All emojis'}
                  className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center hover:bg-red-100"
                >
                  +
                </button>
              </div>
            )}
            {fullEmojiOpen && (
              <div className="absolute top-8 end-0 z-40">
                <EmojiPicker
                  align="end"
                  onClose={() => setFullEmojiOpen(false)}
                  onSelect={(em) => {
                    onReact(message.id, em);
                    setFullEmojiOpen(false);
                  }}
                />
              </div>
            )}
          </div>

          {!isThreadView && (
            <button
              type="button"
              onClick={() => openThread(message.id)}
              aria-label="Reply in thread"
              title={isFa ? 'پاسخ در رشته' : 'Reply in thread'}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-red-600"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onConvertTask(message)}
            aria-label="Convert to action item"
            title={isFa ? 'تبدیل به تسک' : 'Convert to task'}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-red-600"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onBookmark(message.id)}
            aria-label={message.isBookmarked ? 'Remove bookmark' : 'Bookmark message'}
            title={isFa ? 'ذخیره پیام' : 'Save for later'}
            className={`p-1.5 rounded hover:bg-red-50 dark:hover:bg-neutral-800 ${
              message.isBookmarked ? 'text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${message.isBookmarked ? 'fill-current' : ''}`} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setForwardOpen((v) => !v)}
              aria-label="Forward message"
              title={isFa ? 'هدایت پیام' : 'Forward message'}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-red-600"
            >
              <CornerUpRight className="w-3.5 h-3.5" />
            </button>
            {forwardOpen && (
              <div className="absolute top-8 end-0 w-48 p-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-md z-20 space-y-0.5">
                <div className="px-2 py-1 text-[11px] font-medium text-neutral-500">
                  {isFa ? 'ارسال به کانال' : 'Forward to channel'}
                </div>
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      onForward(message.id, ch.id);
                      setForwardOpen(false);
                    }}
                    className="w-full text-start px-2 py-1 rounded text-xs text-neutral-700 dark:text-neutral-200 hover:bg-red-50 dark:hover:bg-neutral-800 truncate"
                  >
                    #{ch.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canPin && (
            <button
              type="button"
              onClick={() => onPin(message.id)}
              aria-label={message.isPinned ? 'Unpin message' : 'Pin message'}
              title={isFa ? 'سنجاق به کانال' : 'Pin to channel'}
              className={`p-1.5 rounded hover:bg-red-50 dark:hover:bg-neutral-800 ${
                message.isPinned ? 'text-red-600' : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}

          {onArchive && (isOwn || canPin) && (
            <button
              type="button"
              onClick={() => onArchive(message.id)}
              aria-label="Archive message"
              title={isFa ? 'انتقال به بایگانی' : 'Archive message'}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-red-600"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}

          {isOwn && (
            <button
              type="button"
              onClick={() => {
                setEditDraft(message.content);
                setEditing(true);
              }}
              aria-label="Edit message"
              title={isFa ? 'ویرایش' : 'Edit message'}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-red-600"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              aria-label="Delete message"
              title={isFa ? 'حذف پیام' : 'Delete message'}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/50 text-neutral-500 hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="flex items-start gap-3">
        <UserAvatar
          name={message.author.displayName}
          avatarUrl={message.author.avatarUrl}
          presence={message.author.presence}
          size="md"
          showPresence
        />

        <div className="flex-1 min-w-0">
          {/* Unboxed clean metadata row */}
          <div className="flex flex-wrap items-baseline gap-2 mb-0.5">
            <span className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              {message.author.displayName}
            </span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {message.author.jobTitle}
            </span>
            <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">·</span>
            <time className="text-[11px] font-mono tabular-nums text-neutral-400">
              {formattedTime}
            </time>
            {message.isPinned && (
              <>
                <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">·</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                  <Pin className="w-3 h-3" /> {isFa ? 'سنجاق‌شده' : 'Pinned'}
                </span>
              </>
            )}
            {message.isEdited && (
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <History className="w-3 h-3" />
                <span>{isFa ? 'ویرایش‌شده' : 'Edited'}</span>
              </button>
            )}
          </div>

          {/* Edit History Popover */}
          {historyOpen && message.editHistory && message.editHistory.length > 0 && (
            <div className="my-1.5 p-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs space-y-1">
              <div className="font-semibold text-neutral-600 dark:text-neutral-300">
                {isFa ? 'تاریخچه ویرایش' : 'Edit History'}
              </div>
              {message.editHistory.map((h) => (
                <div key={h.id} className="text-neutral-500 dark:text-neutral-400">
                  <span className="font-mono text-[10px]">
                    {formatAppDate(h.editedAt, { calendarSystem, locale, includeDate: false, includeTime: true })}:
                  </span>{' '}
                  {h.previousContent}
                </div>
              ))}
            </div>
          )}

          {/* Message Body or Inline Editor */}
          {message.deletedAt ? (
            <p className="text-xs italic text-neutral-400">
              {isFa ? 'این پیام حذف شده است.' : 'This message was deleted.'}
            </p>
          ) : editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editDraft.trim()) return;
                onEdit(message.id, editDraft.trim());
                setEditing(false);
              }}
              className="mt-1 space-y-2"
            >
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={2}
                aria-label="Edit message content"
                className="w-full p-2.5 text-sm rounded-lg bg-white dark:bg-neutral-900 border border-red-500 text-neutral-900 dark:text-neutral-100 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-3 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                >
                  {isFa ? 'ذخیره تغییرات' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 rounded-md bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
              </div>
            </form>
          ) : (
            <RichTextRenderer content={message.content} />
          )}

          {/* Inline Poll Visual Chart (Recharts) */}
          {message.poll && !message.deletedAt && (
            <PollResultChart
              poll={message.poll}
              currentUserId={currentUser?.id}
              onVote={onVotePoll}
            />
          )}

          {/* Inline Task Action Card */}
          {message.task && !message.deletedAt && (
            <div className="mt-2.5 max-w-lg p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onToggleTask(message.task!.id, message.task!.status === 'DONE' ? 'TODO' : 'DONE')
                    }
                    aria-label="Toggle task completion"
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      message.task.status === 'DONE'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-neutral-300 dark:border-neutral-600'
                    }`}
                  >
                    {message.task.status === 'DONE' && <CheckCircle2 className="w-3 h-3" />}
                  </button>
                  <span
                    className={`text-xs font-semibold truncate ${
                      message.task.status === 'DONE'
                        ? 'line-through text-neutral-400'
                        : 'text-neutral-900 dark:text-neutral-100'
                    }`}
                  >
                    {message.task.title}
                  </span>
                </div>
                <div className="mt-1 ps-6 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                  <span>{message.task.status.replace('_', ' ')}</span>
                  {message.task.assigneeName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{message.task.assigneeName}</span>
                    </>
                  )}
                  {message.task.dueDate && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatAppDate(message.task.dueDate, { calendarSystem, locale })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Attachments: Voice Player, PDF Review & Converter Cards, Image & File Previews */}
          {message.attachments.length > 0 && !message.deletedAt && (
            <div className="mt-2 flex flex-wrap gap-2.5">
              {message.attachments.map((att) => {
                const isImage = att.mimeType.startsWith('image/');
                const isAudio =
                  att.mimeType.startsWith('audio/') || /\.(webm|ogg|mp3|wav|m4a)$/i.test(att.fileName);
                const isPdf =
                  att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.fileName);

                if (isAudio) {
                  return <VoiceMessagePlayer key={att.id} attachment={att} isFa={isFa} />;
                }

                if (isPdf) {
                  const busy = convertingAttachmentId === att.id;
                  return (
                    <div
                      key={att.id}
                      data-testid={`pdf-attachment-card-${att.id}`}
                      onContextMenu={(e) => handleAttachmentContextMenu(e, att)}
                      className="rounded-2xl ios-glass-card border border-red-200/80 dark:border-red-900/60 p-3 max-w-sm space-y-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewFile(att)}
                        {...tipProps('بررسی صفحات و متن PDF پیش از باز کردن', 'Review PDF pages & text before opening')}
                        className="w-full flex items-center gap-2.5 text-start cursor-pointer group/pdf"
                      >
                        <span className="w-9 h-9 rounded-xl ios-glass-selected-soft text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate group-hover/pdf:text-red-600 transition-colors">
                            {att.fileName}
                          </div>
                          <div className="text-[10px] font-mono tabular-nums text-neutral-500">
                            PDF · {formatBytes(att.sizeBytes)}
                          </div>
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
                        <button
                          type="button"
                          data-testid={`pdf-review-btn-${att.id}`}
                          onClick={() => setPreviewFile(att)}
                          {...tipProps('پیش‌نمایش صفحات و بررسی متن PDF در چت', 'Review PDF pages inside chat')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg ios-glass-selected text-[11px] font-semibold cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>{isFa ? 'بررسی سریع' : 'Review'}</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`pdf-to-png-btn-${att.id}`}
                          disabled={busy}
                          onClick={async () => {
                            setConvertingAttachmentId(att.id);
                            try {
                              const blob = await renderPdfPageToPngBlob(att.url, 1, 2.0);
                              const out = replaceFileExtension(att.fileName, 'png');
                              triggerBlobDownload(blob, out);
                              showToast(isFa ? `تصویر ${out} آماده و دانلود شد` : `Converted & downloaded ${out}`);
                            } catch (err) {
                              showToast((err as Error).message, 'error');
                            } finally {
                              setConvertingAttachmentId(null);
                            }
                          }}
                          {...tipProps('تبدیل صفحه اول PDF به تصویر PNG', 'Convert PDF page 1 to PNG image')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-400 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 cursor-pointer"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileImage className="w-3 h-3 text-red-600" />}
                          <span>{isFa ? 'تبدیل به عکس' : 'To PNG'}</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`pdf-to-word-btn-${att.id}`}
                          disabled={busy}
                          onClick={async () => {
                            setConvertingAttachmentId(att.id);
                            try {
                              const { blob } = await convertPdfSourceToDocxBlob(
                                att.url,
                                att.fileName.replace(/\.pdf$/i, '')
                              );
                              const out = replaceFileExtension(att.fileName, 'docx');
                              triggerBlobDownload(blob, out);
                              showToast(isFa ? `فایل ورد ${out} دانلود شد` : `Converted & downloaded ${out}`);
                            } catch (err) {
                              showToast((err as Error).message, 'error');
                            } finally {
                              setConvertingAttachmentId(null);
                            }
                          }}
                          {...tipProps('تبدیل مستقیم PDF به سند Word (.docx)', 'Convert PDF to Word (.docx)')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-400 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 cursor-pointer"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3 text-red-600" />}
                          <span>{isFa ? 'تبدیل به Word' : 'To Word'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openPdfStudio(att)}
                          {...tipProps('باز کردن در استودیو پیشرفته PDF و ارسال خروجی به چت', 'Open in PDF Studio')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{isFa ? 'استودیو' : 'Studio'}</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setPreviewFile(att)}
                    onContextMenu={(e) => handleAttachmentContextMenu(e, att)}
                    className="group/file text-start rounded-2xl ios-glass-card border border-neutral-200 dark:border-neutral-700 hover:border-red-400 dark:hover:border-red-500 transition-colors overflow-hidden max-w-xs cursor-pointer"
                  >
                    {isImage && (
                      <div className="h-32 w-60 bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <img
                          src={att.url}
                          alt={att.fileName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover/file:scale-[1.02] transition-transform"
                        />
                      </div>
                    )}
                    <div className="px-3 py-2 flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-neutral-800 dark:text-neutral-100 truncate">
                          {att.fileName}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-neutral-400">
                          {formatBytes(att.sizeBytes)} · {isFa ? 'پیش‌نمایش' : 'Click to preview'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Reactions, Thread Summary & Read Receipts */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {message.reactions.map((rx) => {
              const reacted = currentUser ? rx.userIds.includes(currentUser.id) : false;
              return (
                <button
                  key={rx.emoji}
                  type="button"
                  onClick={() => onReact(message.id, rx.emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs transition-colors ${
                    reacted
                      ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                      : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span>{rx.emoji}</span>
                  <span className="font-mono text-[11px] tabular-nums">{rx.count}</span>
                </button>
              );
            })}

            {!isThreadView && message.replyCount > 0 && (
              <button
                type="button"
                onClick={() => openThread(message.id)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  {message.replyCount} {isFa ? 'پاسخ' : message.replyCount === 1 ? 'reply' : 'replies'}
                </span>
              </button>
            )}

            {message.readByUserIds.length > 1 && !isThreadView && (
              <span
                title={`Seen by ${message.readByUserIds.length} members`}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-400 ms-auto tabular-nums"
              >
                <Eye className="w-3 h-3" />
                <span>{message.readByUserIds.length}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
