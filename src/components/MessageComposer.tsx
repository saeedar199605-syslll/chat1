import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AtSign,
  BarChart3,
  Bold,
  Code,
  FileUp,
  Italic,
  Lock,
  Mic,
  Paperclip,
  Plus,
  Send,
  Slash,
  Smile,
  Square,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { getSharedSocket } from '../hooks/useSocket';
import { useAppStore } from '../store/useAppStore';
import { canPerformWithMatrix, formatBytes, parseSlashCommand } from '../utils/chatLogic';
import { EmojiPicker } from './EmojiPicker';
import { tipProps } from './GlassTooltip';
import type { Attachment, Channel, CustomEmoji, User } from '../types/index';

interface MessageComposerProps {
  channel: Channel | undefined;
  directoryUsers: User[];
  customEmojis: CustomEmoji[];
  parentId?: string | null;
  placeholder?: string;
  onSendMessage: (payload: {
    content: string;
    parentId?: string | null;
    attachmentIds?: string[];
    poll?: { question: string; options: string[] };
    task?: { title: string; assigneeHandle?: string };
  }) => Promise<void>;
  onSlashMeet: (topic: string) => void;
  onSlashStatus: (emoji: string, text: string) => void;
}

interface PendingUpload {
  id: string;
  fileName: string;
  progress: number;
  attachment?: Attachment;
  error?: string;
}

const SLASH_HINTS = [
  { cmd: '/poll "سوال نظرسنجی؟" "گزینه اول" "گزینه دوم"', descFa: 'ایجاد نظرسنجی تعاملی با نمودار', descEn: 'Create interactive poll' },
  { cmd: '/task پیگیری سرور اصفهان @marcus', descFa: 'ایجاد و ارجاع فوری تسک', descEn: 'Assign action item' },
  { cmd: '/meet هم‌اندیشی فنی', descFa: 'شروع جلسه ویدیویی فوری', descEn: 'Start Huddle' },
  { cmd: '/status 🚀 در حال استقرار نسخه جدید', descFa: 'تنظیم وضعیت کاری', descEn: 'Update status' },
];

export function MessageComposer({
  channel,
  directoryUsers,
  customEmojis,
  parentId = null,
  placeholder,
  onSendMessage,
  onSlashMeet,
  onSlashStatus,
}: MessageComposerProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const locale = useAppStore((s) => s.locale);
  const composerQuoteDraft = useAppStore((s) => s.composerQuoteDraft);
  const setComposerQuoteDraft = useAppStore((s) => s.setComposerQuoteDraft);
  const setDailyToolsOpen = useAppStore((s) => s.setDailyToolsOpen);
  const showToast = useAppStore((s) => s.showToast);

  const [text, setText] = useState('');
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendJustFired, setSendJustFired] = useState(false);

  // Visual Poll Creator popover state
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Voice Recorder state
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micFallbackOpen, setMicFallbackOpen] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const audioUploadInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (composerQuoteDraft && !parentId) {
      setText((prev) => `> ${composerQuoteDraft}\n${prev}`);
      setComposerQuoteDraft(null);
      textareaRef.current?.focus();
    }
  }, [composerQuoteDraft, parentId, setComposerQuoteDraft]);

  if (!channel) return null;

  const isFa = locale === 'fa';
  const canPost = canPerformWithMatrix(currentUser, 'message:post', channel.type, rbacMatrix);

  const emitTyping = (active: boolean) => {
    const sock = getSharedSocket();
    if (!sock || !channel) return;
    sock.emit(active ? 'typing:start' : 'typing:stop', { channelId: channel.id });
  };

  const handleTextChange = (val: string) => {
    setText(val);
    setSlashMenuOpen(val.startsWith('/'));

    const atMatch = val.match(/@([a-zA-Z0-9._-]*)$/);
    setMentionQuery(atMatch ? atMatch[1].toLowerCase() : null);

    emitTyping(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => emitTyping(false), 1800);
  };

  const handleFilesSelected = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      const tempId = `${Date.now()}_${Math.random()}`;
      setUploads((prev) => [...prev, { id: tempId, fileName: file.name, progress: 5 }]);
      try {
        const attachment = await api.uploadFilePresigned(channel.id, file, file.name, (pct) => {
          setUploads((prev) => prev.map((u) => (u.id === tempId ? { ...u, progress: pct } : u)));
        });
        setUploads((prev) =>
          prev.map((u) => (u.id === tempId ? { ...u, progress: 100, attachment } : u))
        );
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) => (u.id === tempId ? { ...u, error: (err as Error).message } : u))
        );
        showToast(`Failed to upload ${file.name}`, 'error');
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canPost || sending) return;

    const trimmed = text.trim();
    const readyAttachmentIds = uploads.filter((u) => u.attachment).map((u) => u.attachment!.id);

    if (!trimmed && readyAttachmentIds.length === 0) return;

    const slash = parseSlashCommand(trimmed);
    if (slash.kind === 'meet') {
      setText('');
      setSlashMenuOpen(false);
      onSlashMeet(slash.topic);
      return;
    }
    if (slash.kind === 'status') {
      setText('');
      setSlashMenuOpen(false);
      onSlashStatus(slash.emoji, slash.text);
      return;
    }

    setSending(true);
    emitTyping(false);
    try {
      if (slash.kind === 'poll') {
        await onSendMessage({
          content: `Poll: ${slash.question}`,
          parentId,
          poll: { question: slash.question, options: slash.options },
        });
      } else if (slash.kind === 'task') {
        await onSendMessage({
          content: `Action item created: **${slash.title}**${slash.assigneeHandle ? ` (@${slash.assigneeHandle})` : ''}`,
          parentId,
          task: { title: slash.title, assigneeHandle: slash.assigneeHandle },
        });
      } else {
        await onSendMessage({
          content: trimmed,
          parentId,
          attachmentIds: readyAttachmentIds,
        });
      }
      setText('');
      setUploads([]);
      setSlashMenuOpen(false);
      setMentionQuery(null);
      setSendJustFired(true);
      setTimeout(() => setSendJustFired(false), 450);
    } finally {
      setSending(false);
    }
  };

  const handleSubmitPoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = pollQuestion.trim();
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) {
      showToast(isFa ? 'عنوان نظرسنجی و حداقل ۲ گزینه الزامی است' : 'Poll question and at least 2 options required', 'error');
      return;
    }
    setSending(true);
    try {
      await onSendMessage({
        content: isFa ? `نظرسنجی: ${q}` : `Poll: ${q}`,
        parentId,
        poll: { question: q, options: opts },
      });
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollOpen(false);
    } finally {
      setSending(false);
    }
  };

  const cleanupRecorder = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordSeconds(0);
  };

  const startVoiceRecording = async () => {
    if (recording) return;
    setMicFallbackOpen(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setMicFallbackOpen(true);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.start(200);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setMicFallbackOpen(true);
    }
  };

  const sendVoiceRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !channel) return;
    const duration = recordSeconds;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });
    cleanupRecorder();
    if (blob.size < 10) return;

    const fileName = `voice-note-${Date.now()}.webm`;
    setSending(true);
    try {
      const att = await api.uploadFilePresigned(channel.id, new File([blob], fileName, { type: blob.type }), fileName);
      await onSendMessage({
        content: isFa ? `پیام صوتی (${duration || 1} ثانیه)` : `Voice message (${duration || 1}s)`,
        parentId,
        attachmentIds: [att.id],
      });
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleAudioFileFallback = async (file: File) => {
    if (!channel) return;
    setSending(true);
    try {
      const att = await api.uploadFilePresigned(channel.id, file, file.name);
      await onSendMessage({
        content: isFa ? `پیام صوتی: ${file.name}` : `Voice message: ${file.name}`,
        parentId,
        attachmentIds: [att.id],
      });
      setMicFallbackOpen(false);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const insertSnippet = (snippet: string) => {
    setText((prev) => `${prev}${snippet}`);
    textareaRef.current?.focus();
  };

  if (!canPost) {
    return (
      <div className="px-6 pb-4 shrink-0">
        <div className="px-4 py-3 rounded-xl bg-red-50/70 dark:bg-neutral-800/80 border border-red-200 dark:border-neutral-700 flex items-center gap-2.5 text-xs text-neutral-700 dark:text-neutral-300">
          <Lock className="w-4 h-4 text-red-600 shrink-0" />
          <span>
            {isFa
              ? 'کانال اطلاع‌رسانی: فقط مدیران کل و مدیران دپارتمان مجاز به ارسال پیام هستند.'
              : 'Announcement channel: only Super Admins and Department Managers can publish updates here.'}
          </span>
        </div>
      </div>
    );
  }

  const matchedUsers =
    mentionQuery !== null
      ? directoryUsers.filter(
          (u) =>
            u.displayName.toLowerCase().includes(mentionQuery) ||
            u.email.toLowerCase().includes(mentionQuery)
        )
      : [];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
          handleFilesSelected(e.dataTransfer.files);
        }
      }}
      className="relative px-4 lg:px-6 pb-4 pt-1 shrink-0"
    >
      {/* Slash Command Helper */}
      {slashMenuOpen && (
        <div className="mb-2 p-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-lg space-y-1">
          <div className="px-2 py-1 text-[11px] font-semibold text-neutral-500">
            {isFa ? 'دستورات سریع (Slash Commands)' : 'Slash Commands'}
          </div>
          {SLASH_HINTS.map((hint) => (
            <button
              key={hint.cmd}
              type="button"
              onClick={() => {
                setText(hint.cmd);
                setSlashMenuOpen(false);
                textareaRef.current?.focus();
              }}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-start hover:bg-red-50 dark:hover:bg-neutral-800 text-xs"
            >
              <code className="font-mono text-red-600 dark:text-red-400">{hint.cmd}</code>
              <span className="text-neutral-500 dark:text-neutral-400 truncate">
                {isFa ? hint.descFa : hint.descEn}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* @Mention Autocomplete */}
      {mentionQuery !== null && matchedUsers.length > 0 && (
        <div className="mb-2 p-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-lg max-w-sm space-y-0.5">
          {matchedUsers.slice(0, 5).map((u) => {
            const handle = u.displayName.toLowerCase().replace(/\s+/g, '.');
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setText((prev) => prev.replace(/@([a-zA-Z0-9._-]*)$/, `@${handle} `));
                  setMentionQuery(null);
                  textareaRef.current?.focus();
                }}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-neutral-800 text-xs text-start"
              >
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{u.displayName}</span>
                <span className="text-red-600 dark:text-red-400 font-mono">@{handle}</span>
              </button>
            );
          })}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={`rounded-2xl bg-white dark:bg-neutral-900 ios-glass-card border transition-colors shadow-2xs ${
          isDragging
            ? 'border-red-500 ring-2 ring-red-500/20'
            : 'border-neutral-200/80 dark:border-neutral-700 focus-within:border-red-500'
        }`}
      >
        {/* Drag Drop Overlay Banner */}
        {isDragging && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2 rounded-t-xl">
            <FileUp className="w-4 h-4" />
            <span>{isFa ? `فایل را برای بارگذاری در #${channel.name} رها کنید` : `Drop files to upload to #${channel.name}`}</span>
          </div>
        )}

        {/* Pending Uploads Queue */}
        {uploads.length > 0 && (
          <div className="px-3 pt-3 flex flex-wrap gap-2">
            {uploads.map((up) => (
              <div
                key={up.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
              >
                <span className="truncate max-w-[160px] font-medium text-neutral-800 dark:text-neutral-200">
                  {up.fileName}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-red-600 dark:text-red-400">
                  {up.attachment ? formatBytes(up.attachment.sizeBytes) : `${up.progress}%`}
                </span>
                <button
                  type="button"
                  onClick={() => setUploads((prev) => prev.filter((item) => item.id !== up.id))}
                  aria-label="Remove attachment"
                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Visual Poll Creator Popover */}
        <AnimatePresence>
          {pollOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              data-testid="visual-poll-creator"
              className="mx-3 mt-3 p-3.5 rounded-2xl ios-glass-selected-soft space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300">
                  <BarChart3 className="w-4 h-4" />
                  <span>{isFa ? 'ایجاد نظرسنجی تعاملی جدید' : 'Create Interactive Poll'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPollOpen(false)}
                  aria-label="Close poll builder"
                  className="p-1 rounded-lg text-neutral-500 hover:text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                data-testid="poll-question-input"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder={isFa ? 'سوال نظرسنجی را بنویسید...' : 'Ask a poll question...'}
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-900 border border-red-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <input
                      type="text"
                      data-testid={`poll-option-input-${idx}`}
                      value={opt}
                      onChange={(e) =>
                        setPollOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                      }
                      placeholder={isFa ? `گزینه ${idx + 1}` : `Option ${idx + 1}`}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-red-500"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-neutral-400 hover:text-red-600"
                        aria-label="Remove option"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                {pollOptions.length < 6 ? (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => [...prev, ''])}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{isFa ? 'افزودن گزینه' : 'Add Option'}</span>
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  data-testid="poll-submit-btn"
                  disabled={sending}
                  onClick={handleSubmitPoll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ios-glass-selected text-xs font-semibold cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>{isFa ? 'ارسال نظرسنجی' : 'Publish Poll'}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live Voice Recorder Bar or Audio Upload Fallback */}
        <AnimatePresence>
          {(recording || micFallbackOpen) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mx-3 mt-3 p-2.5 rounded-2xl ios-glass-selected-soft flex flex-wrap items-center justify-between gap-2"
            >
              {recording ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                    <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                      {isFa ? 'در حال ضبط صدا...' : 'Recording Voice...'}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-red-600 dark:text-red-300">
                      {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
                      {String(recordSeconds % 60).padStart(2, '0')}
                    </span>
                    <div className="flex items-center gap-0.5 h-5">
                      {[0.4, 0.9, 0.6, 1, 0.7, 0.85, 0.5].map((h, idx) => (
                        <motion.span
                          key={idx}
                          animate={{ scaleY: [h * 0.4, h, h * 0.5] }}
                          transition={{ repeat: Infinity, duration: 0.65, delay: idx * 0.08 }}
                          className="w-1 h-4 rounded-full bg-red-600 dark:bg-red-400 origin-bottom"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={cleanupRecorder}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'لغو' : 'Cancel'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={sendVoiceRecording}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg ios-glass-selected text-xs font-semibold cursor-pointer"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>{isFa ? 'ارسال ویس' : 'Send Voice'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-neutral-700 dark:text-neutral-200">
                    {isFa
                      ? 'دسترسی میکروفون در مرورگر یافت نشد — می‌توانید فایل صوتی آماده ارسال کنید:'
                      : 'Microphone unavailable in this environment — upload an audio note instead:'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => audioUploadInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg ios-glass-selected text-xs font-semibold cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انتخاب فایل صوتی' : 'Choose Audio'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMicFallbackOpen(false)}
                      className="p-1 text-neutral-400 hover:text-neutral-700"
                      aria-label="Dismiss audio prompt"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={audioUploadInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleAudioFileFallback(f);
            e.target.value = '';
          }}
        />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          rows={2}
          placeholder={
            placeholder ||
            (isFa
              ? `پیام در ${channel.type === 'DM' ? channel.name : `#${channel.name}`} — دستورات /poll ، /task ، /meet یا رها کردن فایل`
              : `Message ${channel.type === 'DM' ? channel.name : `#${channel.name}`} — try /poll, /task, /meet, or drop files`)
          }
          aria-label="Message composer"
          className="w-full px-3.5 pt-3 pb-1 text-sm bg-transparent text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 resize-none focus:outline-none"
        />

        {/* Composer Bottom Toolbar */}
        <div className="px-2.5 pb-2 pt-1 flex items-center justify-between gap-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-0.5 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              {...tipProps('پیوست فایل، تصویر، صوت یا PDF', 'Attach Files, Images, Audio or PDF')}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              type="button"
              data-testid="composer-voice-btn"
              onClick={recording ? sendVoiceRecording : startVoiceRecording}
              aria-label={isFa ? 'ضبط و ارسال پیام صوتی (ویس)' : 'Record Voice Message'}
              {...tipProps('ضبط و ارسال پیام صوتی (ویس) با موج‌نما', 'Record & Send Voice Message')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                recording
                  ? 'ios-glass-selected'
                  : 'text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="button"
              data-testid="composer-poll-btn"
              onClick={() => setPollOpen((v) => !v)}
              aria-label={isFa ? 'ایجاد نظرسنجی' : 'Create Poll'}
              {...tipProps('ساخت نظرسنجی گرافیکی با نمودار زنده', 'Create Visual Poll with Live Chart')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                pollOpen
                  ? 'ios-glass-selected'
                  : 'text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
            </button>

            <button
              type="button"
              data-testid="composer-tools-btn"
              onClick={() => setDailyToolsOpen(true, 'pdf')}
              aria-label={isFa ? 'ابزارهای روزانه و مبدل PDF' : 'Daily Tools & PDF Converter'}
              {...tipProps('ابزارهای کاربردی: تبدیل PDF به Word/PNG و تقویم', 'Daily Tools: PDF to Word/PNG & Jalali')}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => insertSnippet('**bold** ')}
              aria-label="Bold text"
              {...tipProps('ضخیم کردن متن (Bold)', 'Format Bold Text')}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('*italic* ')}
              aria-label="Italic text"
              {...tipProps('مورب کردن متن (Italic)', 'Format Italic Text')}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('\n```ts\n// code\n```\n')}
              aria-label="Insert code block"
              {...tipProps('درج بلوک کد با رنگ‌آمیزی نحو', 'Insert Syntax Code Block')}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('@')}
              aria-label="Mention colleague"
              {...tipProps('اشاره به همکار یا کانال (@mention)', 'Mention Colleague (@)')}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <AtSign className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSlashMenuOpen((v) => !v);
                textareaRef.current?.focus();
              }}
              aria-label="Slash commands"
              {...tipProps('دستورات سریع /poll ، /task ، /meet', 'Quick Slash Commands (/poll, /task, /meet)')}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <Slash className="w-3.5 h-3.5" />
            </button>

            <div className="relative">
              <button
                type="button"
                data-testid="composer-emoji-btn"
                onClick={() => setEmojiPickerOpen((v) => !v)}
                aria-label={isFa ? 'افزودن ایموجی' : 'Insert emoji'}
                {...tipProps('باز کردن پنل کامل ایموجی‌ها', 'Open Full Emoji Picker')}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <Smile className="w-4 h-4" />
              </button>
              {emojiPickerOpen && (
                <div className="absolute bottom-10 start-0 z-40">
                  <EmojiPicker
                    customEmojis={customEmojis}
                    onClose={() => setEmojiPickerOpen(false)}
                    onSelect={(em) => {
                      insertSnippet(`${em} `);
                      setEmojiPickerOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.93 }}
            type="submit"
            disabled={sending || (!text.trim() && uploads.every((u) => !u.attachment))}
            aria-label="Send message"
            {...tipProps('ارسال پیام با انیمیشن فوری', 'Send Message')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl ios-glass-selected disabled:opacity-40 text-xs font-semibold transition-all cursor-pointer"
          >
            <motion.span
              animate={sendJustFired ? { x: [0, 6, 0], y: [0, -6, 0], scale: [1, 1.25, 1] } : {}}
              transition={{ duration: 0.35 }}
              className="inline-flex"
            >
              <Send className="w-3.5 h-3.5" />
            </motion.span>
            <span>{isFa ? 'ارسال' : 'Send'}</span>
          </motion.button>
        </div>
      </form>
    </div>
  );
}
