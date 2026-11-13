import { motion } from 'motion/react';
import { Keyboard, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function ShortcutsModal() {
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const locale = useAppStore((s) => s.locale);
  const isFa = locale === 'fa';

  if (!shortcutsOpen) return null;

  const items = [
    { keys: 'Ctrl / ⌘ + K', labelFa: 'باز کردن جستجوی سراسری پیام‌ها و اعضا', labelEn: 'Open Global Search' },
    { keys: '?', labelFa: 'نمایش راهنمای میانبرهای صفحه‌کلید', labelEn: 'Open Keyboard Shortcuts' },
    { keys: 'Enter', labelFa: 'ارسال فوری پیام یا اجرای دستور اسلش', labelEn: 'Send Message or Run Slash Command' },
    { keys: 'Shift + Enter', labelFa: 'رفتن به خط جدید در کادر پیام', labelEn: 'Insert New Line in Composer' },
    { keys: '/poll | /task | /meet', labelFa: 'ایجاد نظرسنجی، تسک یا شروع جلسه فوری', labelEn: 'Quick Poll, Task, or Instant Huddle' },
    { keys: 'Right Click', labelFa: 'منوی هوشمند راست‌کلیک روی کانال، پیام یا محیط', labelEn: 'Open Smart Context Menu' },
    { keys: 'Esc', labelFa: 'بستن پنجره‌ها و منوهای باز', labelEn: 'Close Active Modal or Menu' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => setShortcutsOpen(false)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl ios-glass-strong border border-neutral-200/90 dark:border-neutral-700 p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-200/70 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-sm text-neutral-900 dark:text-white">
                {isFa ? 'میانبرهای هوشمند صفحه‌کلید' : 'Keyboard Shortcuts'}
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {isFa ? 'دسترسی سریع در پلتفرم اصفهان چالاک' : 'Speed up your daily workflow'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShortcutsOpen(false)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.keys}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/70 dark:bg-neutral-800/70 border border-neutral-200/70 dark:border-neutral-700/70"
            >
              <span className="text-xs text-neutral-700 dark:text-neutral-200">
                {isFa ? item.labelFa : item.labelEn}
              </span>
              <kbd className="px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-[11px] font-mono font-semibold text-red-700 dark:text-red-400 whitespace-nowrap shrink-0">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
