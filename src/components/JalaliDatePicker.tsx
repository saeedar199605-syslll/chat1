import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  JALALI_MONTHS_FA,
  JALALI_WEEKDAYS_SHORT_FA,
  getJalaliMonthCalendarGrid,
  gregorianToJalali,
  jalaliToGregorian,
} from '../utils/jalali';

const faDigits = (v: number | string) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const pad = (n: number) => String(n).padStart(2, '0');

function parseIso(v: string): { gy: number; gm: number; gd: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? { gy: Number(m[1]), gm: Number(m[2]), gd: Number(m[3]) } : null;
}

function todayJalali() {
  const d = new Date();
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

interface DateFieldProps {
  /** ISO date `yyyy-mm-dd` (the API format), or ''. */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Date input that follows the app's calendar setting: Jalali (Shamsi) picker, or the browser's native Gregorian picker.
 * The value is always the Gregorian ISO string, so nothing downstream changes.
 */
export function DateField({ value, onChange, className = '', ariaLabel }: DateFieldProps) {
  const calendarSystem = useAppStore((s) => s.calendarSystem);

  if (calendarSystem !== 'jalali') {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={className}
      />
    );
  }
  return <JalaliField value={value} onChange={onChange} className={className} ariaLabel={ariaLabel} />;
}

function JalaliField({ value, onChange, className, ariaLabel }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selectedG = parseIso(value);
  const selected = selectedG ? gregorianToJalali(selectedG.gy, selectedG.gm, selectedG.gd) : null;
  const today = todayJalali();
  const [view, setView] = useState<{ jy: number; jm: number }>(() => ({
    jy: (selected ?? today).jy,
    jm: (selected ?? today).jm,
  }));

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 296;
    const h = 380;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
    const below = r.bottom + 8;
    const top = below + h > window.innerHeight ? Math.max(8, r.top - h - 8) : below;
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  const openPicker = () => {
    const base = selected ?? today;
    setView({ jy: base.jy, jm: base.jm });
    setOpen((v) => !v);
  };

  const shift = (months: number) =>
    setView((v) => {
      const idx = v.jy * 12 + (v.jm - 1) + months;
      return { jy: Math.floor(idx / 12), jm: (idx % 12) + 1 };
    });

  const pick = (jy: number, jm: number, jd: number) => {
    const g = jalaliToGregorian(jy, jm, jd);
    onChange(`${g.gy}-${pad(g.gm)}-${pad(g.gd)}`);
    setOpen(false);
  };

  const grid = getJalaliMonthCalendarGrid(view.jy, view.jm);
  const label = selected ? `${faDigits(selected.jy)}/${faDigits(pad(selected.jm))}/${faDigits(pad(selected.jd))}` : '';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPicker}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${className} flex items-center justify-between gap-2 text-start cursor-pointer`}
      >
        <span className={label ? '' : 'text-neutral-400'}>{label || 'انتخاب تاریخ'}</span>
        <CalendarDays className="w-4 h-4 text-red-500 shrink-0" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label="تقویم شمسی"
            dir="rtl"
            style={{ top: coords.top, left: coords.left, width: 296 }}
            className="fixed z-[10000] rounded-3xl bg-white dark:bg-[#181012] text-neutral-900 dark:text-neutral-100 p-3.5 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:ring-white/10 font-[inherit]"
          >
            <div className="flex items-center justify-between gap-1 mb-3">
              <div className="flex items-center gap-0.5">
                <NavBtn label="سال قبل" onClick={() => shift(-12)} icon={<ChevronsRight className="w-4 h-4" />} />
                <NavBtn label="ماه قبل" onClick={() => shift(-1)} icon={<ChevronRight className="w-4 h-4" />} />
              </div>
              <div className="text-sm font-extrabold tabular-nums">
                {JALALI_MONTHS_FA[view.jm - 1]} {faDigits(view.jy)}
              </div>
              <div className="flex items-center gap-0.5">
                <NavBtn label="ماه بعد" onClick={() => shift(1)} icon={<ChevronLeft className="w-4 h-4" />} />
                <NavBtn label="سال بعد" onClick={() => shift(12)} icon={<ChevronsLeft className="w-4 h-4" />} />
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {JALALI_WEEKDAYS_SHORT_FA.map((w, i) => (
                <div
                  key={w}
                  className={`h-7 flex items-center justify-center text-[11px] font-bold ${
                    i === 6 ? 'text-red-500' : 'text-neutral-400'
                  }`}
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.cells.map((cell, i) => {
                if (!cell.jalali) return <span key={i} />;
                const { jy, jm, jd } = cell.jalali;
                const isSel = selected && selected.jy === jy && selected.jm === jm && selected.jd === jd;
                const isToday = today.jy === jy && today.jm === jm && today.jd === jd;
                const isFri = i % 7 === 6;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(jy, jm, jd)}
                    aria-label={`${faDigits(jd)} ${JALALI_MONTHS_FA[jm - 1]} ${faDigits(jy)}`}
                    aria-pressed={Boolean(isSel)}
                    className={`h-9 rounded-xl text-[13px] font-semibold tabular-nums transition-all cursor-pointer ${
                      isSel
                        ? 'ios-glass-selected scale-105'
                        : isToday
                          ? 'ring-2 ring-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-white/10'
                          : isFri
                            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-white/10'
                            : 'hover:bg-red-50 dark:hover:bg-white/10'
                    }`}
                  >
                    {faDigits(jd)}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={() => pick(today.jy, today.jm, today.jd)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/25 transition-colors cursor-pointer"
              >
                امروز
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-500 hover:text-red-600 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                پاک کردن
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function NavBtn({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-white/10 transition-colors cursor-pointer"
    >
      {icon}
    </button>
  );
}
