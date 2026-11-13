import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface TooltipPayload {
  fa: string;
  en: string;
  descFa?: string;
  descEn?: string;
  rect: DOMRect;
}

const BILINGUAL_MAP: Record<string, { fa: string; en: string }> = {
  'Channels': { fa: 'کانال‌ها و گفتگوهای بلادرنگ', en: 'Channels & Real-Time Chat' },
  'گفتگوها و کانال‌ها': { fa: 'کانال‌ها و گفتگوهای بلادرنگ', en: 'Channels & Real-Time Chat' },
  'Activity': { fa: 'مرکز اعلان‌ها و دعوت‌نامه‌ها', en: 'Activity & Group Invites' },
  'اعلان‌ها و رویدادها': { fa: 'مرکز اعلان‌ها و دعوت‌نامه‌ها', en: 'Activity & Group Invites' },
  'Tasks': { fa: 'مدیریت و ارجاع وظایف تیمی', en: 'Tasks & Team Assignments' },
  'مدیریت و ارجاع وظایف': { fa: 'مدیریت و ارجاع وظایف تیمی', en: 'Tasks & Team Assignments' },
  'Workflows': { fa: 'درخواست‌های تأیید و استندآپ', en: 'Approvals & Daily Standups' },
  'درخواست‌ها و گزارش روزانه': { fa: 'درخواست‌های تأیید و استندآپ', en: 'Approvals & Daily Standups' },
  'Org Chart': { fa: 'ساختار و چارت سازمانی', en: 'Organization Chart & Hierarchy' },
  'ساختار و چارت سازمانی': { fa: 'ساختار و چارت سازمانی', en: 'Organization Chart & Hierarchy' },
  'Users & RBAC': { fa: 'کاربران و ماتریس سطوح دسترسی', en: 'Users & RBAC Access Matrix' },
  'کاربران و سطح دسترسی': { fa: 'کاربران و ماتریس سطوح دسترسی', en: 'Users & RBAC Access Matrix' },
  'Files Hub': { fa: 'مرکز اسناد، پیش‌نمایش و فایل‌ها', en: 'Files Hub & Document Center' },
  'مرکز اسناد و فایل‌ها': { fa: 'مرکز اسناد، پیش‌نمایش و فایل‌ها', en: 'Files Hub & Document Center' },
  'Saved': { fa: 'پیام‌های ذخیره‌شده و نشانه‌گذاری', en: 'Saved & Bookmarked Messages' },
  'پیام‌های ذخیره‌شده': { fa: 'پیام‌های ذخیره‌شده و نشانه‌گذاری', en: 'Saved & Bookmarked Messages' },
  'Archive': { fa: 'بایگانی کانال‌ها و تسک‌ها', en: 'Organizational Archive' },
  'بایگانی سازمانی': { fa: 'بایگانی کانال‌ها و تسک‌ها', en: 'Organizational Archive' },
  'Backup': { fa: 'پشتیبان‌گیری و بازیابی SHA-256', en: 'Verified Backup & Recovery' },
  'پشتیبان‌گیری و بازیابی': { fa: 'پشتیبان‌گیری و بازیابی SHA-256', en: 'Verified Backup & Recovery' },
  'Super Admin & Audit Logs': { fa: 'پنل سوپر ادمین و لاگ کامل رویدادها', en: 'Super Admin & Audit Logs' },
  'پنل سوپر ادمین و لاگ‌ها': { fa: 'پنل سوپر ادمین و لاگ کامل رویدادها', en: 'Super Admin & Audit Logs' },
  'Attach files': { fa: 'پیوست فایل، تصویر یا PDF', en: 'Attach Files, Images or PDF' },
  'پیوست فایل': { fa: 'پیوست فایل، تصویر یا PDF', en: 'Attach Files, Images or PDF' },
  'Bold text': { fa: 'متن ضخیم (Bold)', en: 'Format Text Bold' },
  'Italic text': { fa: 'متن مورب (Italic)', en: 'Format Text Italic' },
  'Insert code block': { fa: 'درج بلوک کد برنامه‌نویسی', en: 'Insert Syntax Code Block' },
  'Mention colleague': { fa: 'منشن همکار یا کانال (@)', en: 'Mention Colleague or @channel' },
  'Slash commands': { fa: 'دستورات سریع (/poll, /task, /meet)', en: 'Slash Commands Menu' },
  'Send message': { fa: 'ارسال پیام به کانال', en: 'Send Message' },
  'Start Huddle': { fa: 'شروع جلسه صوتی و تصویری زنده', en: 'Start Live WebRTC Huddle' },
  'شروع جلسه': { fa: 'شروع جلسه صوتی و تصویری زنده', en: 'Start Live WebRTC Huddle' },
};

export function tipProps(fa: string, en: string, descFa?: string, descEn?: string) {
  return {
    'data-tip-fa': fa,
    'data-tip-en': en,
    ...(descFa ? { 'data-tip-desc-fa': descFa } : {}),
    ...(descEn ? { 'data-tip-desc-en': descEn } : {}),
  };
}

function resolveTooltipFromElement(el: HTMLElement): TooltipPayload | null {
  const target = el.closest(
    '[data-tip-fa], [data-tip-en], [title], [data-stashed-title], button[aria-label], a[aria-label]'
  ) as HTMLElement | null;
  if (!target) return null;

  const tipFa = target.getAttribute('data-tip-fa');
  const tipEn = target.getAttribute('data-tip-en');
  const descFa = target.getAttribute('data-tip-desc-fa') || undefined;
  const descEn = target.getAttribute('data-tip-desc-en') || undefined;

  if (tipFa || tipEn) {
    return {
      fa: tipFa || tipEn || '',
      en: tipEn || tipFa || '',
      descFa,
      descEn,
      rect: target.getBoundingClientRect(),
    };
  }

  const rawTitle = target.getAttribute('data-stashed-title') || target.getAttribute('title');
  const aria = target.getAttribute('aria-label');
  const candidate = (rawTitle || aria || '').trim();
  if (!candidate || candidate.length < 2) return null;

  if (rawTitle) {
    target.setAttribute('data-stashed-title', rawTitle);
    target.removeAttribute('title');
  }

  const mapped = BILINGUAL_MAP[candidate];
  if (mapped) {
    return {
      fa: mapped.fa,
      en: mapped.en,
      rect: target.getBoundingClientRect(),
    };
  }

  const hasPersian = /[\u0600-\u06FF]/.test(candidate);
  return {
    fa: hasPersian ? candidate : `ابزار: ${candidate}`,
    en: hasPersian ? `Action: ${candidate}` : candidate,
    rect: target.getBoundingClientRect(),
  };
}

export function GlobalGlassTooltipLayer() {
  const [tip, setTip] = useState<TooltipPayload | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clearStashedTitle = (el: HTMLElement | null) => {
      if (!el) return;
      const stashed = el.getAttribute('data-stashed-title');
      if (stashed) {
        el.setAttribute('title', stashed);
        el.removeAttribute('data-stashed-title');
      }
    };

    const handlePointerOver = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const trigger = el.closest(
        '[data-tip-fa], [data-tip-en], [title], [data-stashed-title], button[aria-label], a[aria-label]'
      ) as HTMLElement | null;
      if (!trigger) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        activeElRef.current = null;
        setTip(null);
        return;
      }
      if (activeElRef.current === trigger) return;

      clearStashedTitle(activeElRef.current);
      activeElRef.current = trigger;
      if (timerRef.current) window.clearTimeout(timerRef.current);

      const resolved = resolveTooltipFromElement(trigger);
      if (!resolved) {
        setTip(null);
        return;
      }

      timerRef.current = window.setTimeout(() => {
        if (activeElRef.current === trigger && document.body.contains(trigger)) {
          setTip({ ...resolved, rect: trigger.getBoundingClientRect() });
        }
      }, 220);
    };

    const handlePointerOut = (e: PointerEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (activeElRef.current && related && activeElRef.current.contains(related)) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      clearStashedTitle(activeElRef.current);
      activeElRef.current = null;
      setTip(null);
    };

    const handleDismiss = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      clearStashedTitle(activeElRef.current);
      activeElRef.current = null;
      setTip(null);
    };

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('mousedown', handleDismiss, true);
    window.addEventListener('keydown', handleDismiss, true);
    return () => {
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('mousedown', handleDismiss, true);
      window.removeEventListener('keydown', handleDismiss, true);
    };
  }, []);

  if (!tip) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const estWidth = 248;
  const estHeight = tip.descFa || tip.descEn ? 78 : 54;

  // Prefer placing below or above, or to the side for narrow rail elements
  let left = tip.rect.left + tip.rect.width / 2 - estWidth / 2;
  let top = tip.rect.bottom + 8;

  if (tip.rect.width < 64 && tip.rect.left < 90) {
    // Left rail in LTR
    left = tip.rect.right + 10;
    top = tip.rect.top + tip.rect.height / 2 - estHeight / 2;
  } else if (tip.rect.width < 64 && tip.rect.right > vw - 90) {
    // Right rail in RTL
    left = tip.rect.left - estWidth - 10;
    top = tip.rect.top + tip.rect.height / 2 - estHeight / 2;
  } else if (top + estHeight > vh - 12) {
    top = tip.rect.top - estHeight - 8;
  }

  left = Math.max(10, Math.min(left, vw - estWidth - 10));
  top = Math.max(10, Math.min(top, vh - estHeight - 10));

  return (
    <AnimatePresence>
      <motion.div
        key={`${tip.fa}-${tip.en}`}
        data-testid="global-bilingual-tooltip"
        role="tooltip"
        initial={{ opacity: 0, scale: 0.94, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 480, damping: 32 }}
        style={{ top, left, width: estWidth }}
        className="fixed z-[90] pointer-events-none rounded-2xl ios-glass-strong bg-white/95 dark:bg-neutral-900/95 border border-red-200/70 dark:border-red-900/50 shadow-2xl px-3 py-2 text-start"
      >
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200/80 dark:border-red-800/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-3 h-3" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div dir="rtl" className="text-[11px] font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">
              {tip.fa}
            </div>
            <div dir="ltr" className="text-[10px] font-medium text-red-600 dark:text-red-400 leading-snug">
              {tip.en}
            </div>
            {(tip.descFa || tip.descEn) && (
              <div className="pt-0.5 border-t border-neutral-200/60 dark:border-neutral-800/80 text-[10px] text-neutral-500 dark:text-neutral-400 leading-snug">
                {tip.descFa && <div dir="rtl">{tip.descFa}</div>}
                {tip.descEn && <div dir="ltr">{tip.descEn}</div>}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
