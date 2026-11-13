import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Pause, Play, RotateCcw, Timer, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatTimerClock } from '../utils/chatLogic';

export function FocusTimerWidget() {
  const locale = useAppStore((s) => s.locale);
  const showToast = useAppStore((s) => s.showToast);
  const isFa = locale === 'fa';

  const [open, setOpen] = useState(false);
  const [presetMins, setPresetMins] = useState<25 | 15 | 5>(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 64, left: 16 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const width = 264;
    const estHeight = 250;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    const top = Math.max(8, Math.min(window.innerHeight - estHeight - 8, rect.bottom + 8));
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onResizeOrScroll = () => updatePosition();
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          showToast(isFa ? 'زمان تمرکز به پایان رسید!' : 'Focus session complete!');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, isFa, showToast]);

  const selectPreset = (mins: 25 | 15 | 5) => {
    setRunning(false);
    setPresetMins(mins);
    setSecondsLeft(mins * 60);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="focus-timer-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={isFa ? 'تایمر تمرکز' : 'Focus timer'}
        title={isFa ? 'تایمر تمرکز پومودورو' : 'Focus Timer'}
        className={`h-8 px-2.5 rounded-lg border text-xs font-mono font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
          running
            ? 'border-red-500 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-red-300 hover:text-red-600'
        }`}
      >
        <Timer className={`w-3.5 h-3.5 ${running ? 'animate-pulse text-red-600' : ''}`} />
        <span className="tabular-nums">{formatTimerClock(secondsLeft)}</span>
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={popoverRef}
                data-testid="focus-timer-popover"
                initial={{ opacity: 0, scale: 0.94, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                style={{ top: coords.top, left: coords.left }}
                className="fixed w-[264px] rounded-2xl ios-glass-strong bg-white/96 dark:bg-neutral-900/96 border border-neutral-200/90 dark:border-neutral-700 p-4 shadow-2xl z-[9990] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">
                    {isFa ? 'تایمر تمرکز کاری' : 'Pomodoro Focus Timer'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={isFa ? 'بستن تایمر' : 'Close timer'}
                    className="p-1 rounded-lg text-neutral-400 hover:text-red-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-center py-2">
                  <div className="font-mono text-3xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {formatTimerClock(secondsLeft)}
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {running
                      ? isFa
                        ? 'در حال تمرکز عمیق...'
                        : 'Deep focus active'
                      : isFa
                        ? 'آماده شروع'
                        : 'Ready to start'}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {([25, 15, 5] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => selectPreset(m)}
                      className={`py-1.5 rounded-lg text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                        presetMins === m
                          ? 'bg-red-600 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-red-50'
                      }`}
                    >
                      {m} {isFa ? 'دقیقه' : 'm'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRunning((v) => !v)}
                    className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{running ? (isFa ? 'توقف' : 'Pause') : isFa ? 'شروع' : 'Start'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPreset(presetMins)}
                    aria-label={isFa ? 'بازنشانی' : 'Reset'}
                    className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-red-400 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

