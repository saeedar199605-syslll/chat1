// Accurate bidirectional Jalali (Shamsi) <-> Gregorian calendar & organizational VAT utilities

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export interface GregorianDate {
  gy: number;
  gm: number;
  gd: number;
}

export const JALALI_MONTHS_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - div(a, b) * b;
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): GregorianDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function jalCal(jy: number) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;

  for (let i = 1; i < breaks.length; i++) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ += 1;
  }
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  return { gy, march };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31);
      const jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    } else {
      k -= 186;
    }
  } else {
    jy -= 1;
    k += 179;
    const prev = jalCal(jy);
    const prevLeap = g2d(jy + 621, 3, prev.march);
    const isLeap = jdn1f - prevLeap === 366;
    if (isLeap) k += 1;
  }
  const jm = 7 + div(k, 30);
  const jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  return d2j(g2d(gy, gm, gd));
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): GregorianDate {
  return d2g(j2d(jy, jm, jd));
}

export const JALALI_WEEKDAYS_FA = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
] as const;

export const JALALI_WEEKDAYS_SHORT_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

export function isJalaliLeapYear(jy: number): boolean {
  const currMarch = jalCal(jy).march;
  const nextMarch = jalCal(jy + 1).march;
  const days = g2d(jy + 622, 3, nextMarch) - g2d(jy + 621, 3, currMarch);
  return days === 366;
}

export function getJalaliMonthDays(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

export interface JalaliCalendarCell {
  day: number | null;
  jalali: JalaliDate | null;
  gregorian: GregorianDate | null;
}

export function getJalaliMonthCalendarGrid(jy: number, jm: number): {
  year: number;
  month: number;
  monthName: string;
  daysInMonth: number;
  startWeekdaySat: number;
  cells: JalaliCalendarCell[];
} {
  const safeMonth = Math.max(1, Math.min(12, Math.floor(jm)));
  const daysInMonth = getJalaliMonthDays(jy, safeMonth);
  const firstGreg = jalaliToGregorian(jy, safeMonth, 1);
  const jsDay = new Date(Date.UTC(firstGreg.gy, firstGreg.gm - 1, firstGreg.gd)).getUTCDay();
  // Convert JS Sun=0..Sat=6 to Sat=0..Fri=6
  const startWeekdaySat = (jsDay + 1) % 7;

  const cells: JalaliCalendarCell[] = [];
  for (let i = 0; i < startWeekdaySat; i++) {
    cells.push({ day: null, jalali: null, gregorian: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const jalali = { jy, jm: safeMonth, jd: d };
    const gregorian = jalaliToGregorian(jy, safeMonth, d);
    cells.push({ day: d, jalali, gregorian });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, jalali: null, gregorian: null });
  }

  return {
    year: jy,
    month: safeMonth,
    monthName: JALALI_MONTHS_FA[safeMonth - 1] || String(safeMonth),
    daysInMonth,
    startWeekdaySat,
    cells,
  };
}

export function diffDaysBetweenDates(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round(Math.abs(utcB - utcA) / 86_400_000);
}

export function formatAppDate(
  input: string | Date | null | undefined,
  options?: {
    calendarSystem?: 'jalali' | 'gregorian';
    locale?: 'fa' | 'en';
    includeTime?: boolean;
    includeDate?: boolean;
    withMonthName?: boolean;
  }
): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);

  const cal = options?.calendarSystem ?? 'jalali';
  const locale = options?.locale ?? 'fa';
  const includeTime = options?.includeTime ?? false;
  const includeDate = options?.includeDate ?? true;

  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const timePart = `${hh}:${min}`;

  let datePart = '';
  if (includeDate) {
    if (cal === 'jalali') {
      const j = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
      const mm = String(j.jm).padStart(2, '0');
      const dd = String(j.jd).padStart(2, '0');
      if (options?.withMonthName) {
        datePart = `${j.jd} ${JALALI_MONTHS_FA[j.jm - 1]} ${j.jy}`;
      } else {
        datePart = `${j.jy}/${mm}/${dd}`;
      }
    } else {
      datePart = new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR-u-ca-gregory' : 'en-US', {
        year: 'numeric',
        month: options?.withMonthName ? 'short' : '2-digit',
        day: '2-digit',
      }).format(date);
    }
  }

  if (includeDate && includeTime) return `${datePart} · ${timePart}`;
  return includeDate ? datePart : timePart;
}

export function formatJalaliString(j: JalaliDate, withMonthName = true): string {
  const mm = String(j.jm).padStart(2, '0');
  const dd = String(j.jd).padStart(2, '0');
  if (withMonthName) {
    const monthName = JALALI_MONTHS_FA[j.jm - 1] || mm;
    return `${j.jy}/${mm}/${dd} (${monthName})`;
  }
  return `${j.jy}/${mm}/${dd}`;
}

export function calculateVatBreakdown(
  unitPrice: number,
  quantity = 1,
  vatRatePct = 10
): { subtotal: number; vatAmount: number; total: number } {
  const safePrice = Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0;
  const safeQty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const safeRate = Number.isFinite(vatRatePct) ? Math.max(0, vatRatePct) : 0;
  const subtotal = Math.round(safePrice * safeQty * 100) / 100;
  const vatAmount = Math.round(subtotal * (safeRate / 100) * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  return { subtotal, vatAmount, total };
}

export function calculateFinancialSuite(params: {
  unitPrice: number;
  quantity?: number;
  discountPct?: number;
  vatRatePct?: number;
}): {
  gross: number;
  discountAmount: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  totalRial: number;
} {
  const safePrice = Number.isFinite(params.unitPrice) ? Math.max(0, params.unitPrice) : 0;
  const safeQty = Number.isFinite(params.quantity) ? Math.max(0, params.quantity ?? 1) : 1;
  const safeDiscount = Number.isFinite(params.discountPct) ? Math.max(0, Math.min(100, params.discountPct ?? 0)) : 0;
  const safeVat = Number.isFinite(params.vatRatePct) ? Math.max(0, params.vatRatePct ?? 10) : 10;

  const gross = Math.round(safePrice * safeQty * 100) / 100;
  const discountAmount = Math.round(gross * (safeDiscount / 100) * 100) / 100;
  const subtotal = Math.round((gross - discountAmount) * 100) / 100;
  const vatAmount = Math.round(subtotal * (safeVat / 100) * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  const totalRial = Math.round(total * 10);
  return { gross, discountAmount, subtotal, vatAmount, total, totalRial };
}

