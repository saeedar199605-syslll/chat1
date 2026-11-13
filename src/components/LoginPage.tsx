import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserPlus,
  User as UserIcon,
  Zap,
  Radio,
  ScrollText,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { useServerInfo } from '../lib/serverInfo';
import { JALALI_MONTHS_FA, gregorianToJalali } from '../utils/jalali';

const DEMO_PERSONAS = [
  { id: 'usr_elena', nameFa: 'النا روستوا', nameEn: 'Elena Rostova', roleFa: 'سوپر ادمین / مدیرعامل', roleEn: 'Super Admin / CEO', email: 'elena.rostova@acme.io' },
  { id: 'usr_marcus', nameFa: 'مارکوس ونس', nameEn: 'Marcus Vance', roleFa: 'مدیر واحد فنی', roleEn: 'Dept Manager', email: 'marcus.vance@acme.io' },
  { id: 'usr_dariush', nameFa: 'داریوش فراهانی', nameEn: 'Dariush Farahani', roleFa: 'کارمند ارشد سیستم', roleEn: 'Member', email: 'dariush.farahani@acme.io' },
  { id: 'usr_lucas', nameFa: 'لوکاس کیم', nameEn: 'Lucas Kim', roleFa: 'مهمان / مشاور پروژه', roleEn: 'Guest', email: 'lucas.kim@acme.io' },
];

const faDigits = (v: number | string) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** Embers that rise, drift, flee the cursor and burst on click. Pauses when the tab is hidden. */
function EmberField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let raf = 0;
    const mouse = { x: -9999, y: -9999 };

    interface P { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; hue: number }
    const make = (x?: number, y?: number, burst = false): P => ({
      x: x ?? Math.random() * w,
      y: y ?? (burst ? 0 : Math.random() * h),
      vx: (Math.random() - 0.5) * (burst ? 5 : 0.35),
      vy: burst ? -(Math.random() * 3.5 + 0.8) : -(Math.random() * 0.8 + 0.2),
      r: Math.random() * 2.3 + 0.6,
      life: burst ? 0 : Math.random() * 300,
      max: burst ? 50 + Math.random() * 50 : 320 + Math.random() * 420,
      hue: Math.random() * 32,
    });

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const count = Math.round(Math.min(140, (w * h) / 14000));
    const ps: P[] = Array.from({ length: count }, () => make());

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22500) {
          const d = Math.sqrt(d2) || 1;
          const f = (150 - d) / 150;
          p.vx += (dx / d) * f * 0.35;
          p.vy += (dy / d) * f * 0.35;
        }
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + (-0.012);
        p.x += p.vx + Math.sin((p.y + p.life) * 0.012) * 0.22;
        p.y += p.vy;
        p.life++;
        const a = Math.sin(Math.PI * Math.min(1, p.life / p.max));
        if (p.life >= p.max || p.y < -20) {
          ps[i] = make(undefined, h + 10);
          ps[i].life = 0;
          continue;
        }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
        g.addColorStop(0, `hsla(${p.hue},100%,62%,${a * 0.85})`);
        g.addColorStop(0.35, `hsla(${p.hue},100%,50%,${a * 0.28})`);
        g.addColorStop(1, `hsla(${p.hue},100%,45%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onLeave = () => {
      mouse.x = mouse.y = -9999;
    };
    const onClick = (e: MouseEvent) => {
      for (let i = 0; i < 34; i++) {
        const s = make(e.clientX, e.clientY, true);
        s.vy = (Math.random() - 0.5) * 6;
        ps.push(s);
      }
      if (ps.length > 420) ps.splice(0, ps.length - 420);
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('click', onClick);
    if (reduce) {
      frame();
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('click', onClick);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0" />;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Field(props: {
  id: string;
  label: string;
  icon: React.ReactNode;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  trailing?: React.ReactNode;
  dir?: 'ltr' | 'rtl';
  testId?: string;
}) {
  return (
    <div className="relative group">
      <span className="absolute start-4 top-1/2 -translate-y-1/2 text-white/35 group-focus-within:text-red-400 transition-colors">
        {props.icon}
      </span>
      <input
        id={props.id}
        data-testid={props.testId}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder=" "
        autoComplete={props.autoComplete}
        minLength={props.minLength}
        required={props.required ?? true}
        dir={props.dir}
        className="peer w-full h-14 ps-11 pe-12 pt-5 rounded-2xl bg-white/[0.045] text-white text-sm ring-1 ring-white/10 hover:ring-white/20 focus:ring-2 focus:ring-red-500/80 focus:bg-white/[0.07] outline-none transition placeholder-transparent"
      />
      <label
        htmlFor={props.id}
        className="pointer-events-none absolute start-11 top-2 text-[11px] font-medium text-white/45 transition-all peer-placeholder-shown:top-[18px] peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-[11px] peer-focus:text-red-300"
      >
        {props.label}
      </label>
      {props.trailing && <span className="absolute end-3 top-1/2 -translate-y-1/2">{props.trailing}</span>}
    </div>
  );
}

export function LoginPage() {
  const setAuth = useAppStore((s) => s.setAuth);
  const showToast = useAppStore((s) => s.showToast);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);

  const isFa = locale === 'fa';
  const info = useServerInfo();
  const demo = Boolean(info?.demo);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const now = useNow();

  const words = isFa ? ['سرعت', 'هماهنگی', 'امنیت', 'شفافیت'] : ['Speed', 'Alignment', 'Security', 'Clarity'];
  useEffect(() => {
    const t = setInterval(() => setWordIdx((i) => (i + 1) % 4), 2600);
    return () => clearInterval(t);
  }, []);

  const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const clock = isFa
    ? `${faDigits(j.jd)} ${JALALI_MONTHS_FA[j.jm - 1]} ${faDigits(j.jy)} · ${faDigits(now.toTimeString().slice(0, 8))}`
    : `${now.toDateString().slice(4)} · ${now.toTimeString().slice(0, 8)}`;

  const fail = (msg: string) => {
    setErrorMsg(msg);
    setShake((n) => n + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.login(email.trim(), password);
        setAuth(res.accessToken, res.refreshToken, res.user);
        showToast(isFa ? `خوش آمدید، ${res.user.displayName}` : `Welcome, ${res.user.displayName}`);
      } else {
        const res = await api.register({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          department: department.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
        });
        setAuth(res.accessToken, res.refreshToken, res.user);
        showToast(isFa ? `حساب کاربری ${res.user.displayName} ساخته شد` : `Account created for ${res.user.displayName}`);
      }
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (userId: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await api.demoSwitch(userId);
      setAuth(res.accessToken, res.refreshToken, res.user);
      showToast(isFa ? `ورود موفق به حساب ${res.user.displayName}` : `Signed in as ${res.user.displayName}`);
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Gentle 3D tilt toward the cursor
  const onTilt = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1100px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
    el.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  };
  const resetTilt = () => {
    if (cardRef.current) cardRef.current.style.transform = '';
  };

  const features = [
    { icon: Zap, fa: 'گفتگوی لحظه‌ای بدون تأخیر', en: 'Zero-lag realtime chat' },
    { icon: Radio, fa: 'جلسه و تماس گروهی', en: 'Huddles & group calls' },
    { icon: ShieldCheck, fa: 'امنیت و کنترل دسترسی', en: 'Secure role-based access' },
    { icon: ScrollText, fa: 'ممیزی کامل فعالیت‌ها', en: 'Complete audit trail' },
  ];

  return (
    <div
      data-testid="login-page"
      className="relative min-h-screen w-full overflow-x-hidden overflow-y-auto bg-[#080406] text-white"
    >
      {/* Atmosphere */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="login-aurora absolute -top-1/3 -start-1/4 w-[70vw] h-[70vw] rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.5),transparent_62%)] blur-2xl" />
        <div className="login-aurora-slow absolute -bottom-1/3 -end-1/4 w-[65vw] h-[65vw] rounded-full bg-[radial-gradient(circle,rgba(190,18,60,0.55),transparent_62%)] blur-2xl" />
        <div className="absolute inset-0 login-grid" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.65)_100%)]" />
      </div>
      <EmberField />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-10 pt-5">
        <div className="flex items-center gap-2 text-[11px] sm:text-xs text-white/55 tabular-nums">
          <span className="ember-pulse w-2 h-2 rounded-full bg-emerald-400" />
          <span>{clock}</span>
        </div>
        <button
          type="button"
          onClick={() => setLocale(locale === 'fa' ? 'en' : 'fa')}
          className="h-9 px-3.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/10 hover:ring-red-400/50 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
        >
          <Languages className="w-3.5 h-3.5 text-red-400" />
          <span>{locale === 'fa' ? 'FA · English' : 'EN · فارسی'}</span>
        </button>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 sm:px-10 py-8 lg:py-12 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-center min-h-[calc(100vh-72px)]">
        {/* Brand / hero */}
        <section className="flex flex-col items-center lg:items-start text-center lg:text-start">
          <div className="relative w-40 h-40 sm:w-44 sm:h-44 mb-8">
            <span aria-hidden className="login-spin absolute -inset-5 rounded-full bg-[conic-gradient(from_0deg,#ef4444,#fb923c,#ef4444,#7f1d1d,#ef4444)] opacity-80 blur-xl" />
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden
                className="absolute inset-0 rounded-[2.4rem] border border-red-400/40 animate-ping"
                style={{ animationDelay: `${i * 0.9}s`, animationDuration: '3.2s' }}
              />
            ))}
            <div className="brand-tile relative w-full h-full rounded-[2.4rem] p-7 flex items-center justify-center">
              <img
                src="/assets/esfahan-chalak-logo.png"
                alt="اصفهان چالاک"
                className="max-w-full max-h-full object-contain drop-shadow-[0_6px_14px_rgba(220,38,38,0.35)]"
              />
            </div>
          </div>

          <p className="text-red-300/90 text-xs sm:text-sm font-semibold mb-3">
            {isFa ? 'پلتفرم ارتباطات سازمانی اصفهان چالاک' : 'Esfahan Chalak Enterprise Suite'}
          </p>
          <h1 className="font-display font-extrabold text-4xl sm:text-5xl xl:text-6xl leading-[1.15]">
            <span className="block text-white/95">{isFa ? 'کار تیمی با' : 'Teamwork with'}</span>
            <span className="block h-[1.25em] relative overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={`${locale}-${wordIdx}`}
                  initial={{ y: '90%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '-90%', opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-x-0 lg:inset-x-auto bg-gradient-to-r from-red-400 via-orange-300 to-red-500 bg-clip-text text-transparent"
                >
                  {words[wordIdx]}
                </motion.span>
              </AnimatePresence>
            </span>
          </h1>
          <p className="mt-5 max-w-md text-sm sm:text-base text-white/60 leading-relaxed">
            {isFa
              ? 'گفتگو، وظایف، جلسه، تأییدیه و ممیزی امنیتی؛ همه در یک میزکار یکپارچه، سریع و امن.'
              : 'Chat, tasks, meetings, approvals and security audit in one fast, secure workspace.'}
          </p>

          <ul className="mt-8 hidden sm:grid grid-cols-2 gap-2.5 w-full max-w-lg">
            {features.map((f) => (
              <li
                key={f.en}
                className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 px-3.5 py-2.5 text-xs text-white/75"
              >
                <span className="w-8 h-8 rounded-xl bg-red-500/15 ring-1 ring-red-400/25 flex items-center justify-center shrink-0">
                  <f.icon className="w-4 h-4 text-red-300" />
                </span>
                <span>{isFa ? f.fa : f.en}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Auth card */}
        <section className="w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end" onPointerMove={onTilt} onPointerLeave={resetTilt}>
          <div ref={cardRef} className="login-card relative rounded-[2rem] p-[1.5px] transition-transform duration-200 ease-out will-change-transform">
            <span aria-hidden className="login-border absolute inset-0 rounded-[2rem]" />
            <div className="relative rounded-[calc(2rem-1.5px)] bg-[#12090c]/95 p-6 sm:p-8 overflow-hidden">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: 'radial-gradient(420px circle at var(--mx,50%) var(--my,0%), rgba(239,68,68,0.16), transparent 60%)' }}
              />

              <div className="relative flex items-center gap-1 p-1 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 mb-6">
                <button
                  type="button"
                  data-testid="login-mode-signin"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    mode === 'login' ? 'ios-glass-selected' : 'text-white/55 hover:text-white'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ورود' : 'Sign in'}</span>
                </button>
                {info?.registration && (
                  <button
                    type="button"
                    data-testid="login-mode-register"
                    onClick={() => {
                      setMode('register');
                      setErrorMsg(null);
                    }}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      mode === 'register' ? 'ios-glass-selected' : 'text-white/55 hover:text-white'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isFa ? 'ثبت‌نام' : 'Create account'}</span>
                  </button>
                )}
              </div>

              {mode === 'register' && (
                <h2 className="relative font-display font-extrabold text-2xl mb-1.5">{isFa ? 'یک حساب بساز' : 'Create your account'}</h2>
              )}
              <p className="relative text-xs sm:text-sm text-white/50 mb-6">
                {mode === 'login'
                  ? isFa
                    ? demo
                      ? 'ایمیل و رمز عبور سازمانی را وارد کن، یا از حساب‌های نمونه پایین استفاده کن.'
                      : 'با ایمیل و رمز عبور سازمانی وارد میزکار شو.'
                    : demo
                      ? 'Enter your work email and password, or pick a demo account below.'
                      : 'Sign in to your workspace with your work email.'
                  : isFa
                    ? 'چند ثانیه و آماده‌ای.'
                    : 'It only takes a few seconds.'}
              </p>

              <motion.form
                key={shake}
                animate={shake ? { x: [0, -9, 9, -6, 6, 0] } : undefined}
                transition={{ duration: 0.4 }}
                onSubmit={handleSubmit}
                className="relative space-y-3"
              >
                {mode === 'register' && (
                  <Field id="lg-name" label={isFa ? 'نام و نام خانوادگی' : 'Full name'} icon={<UserIcon className="w-4 h-4" />} value={fullName} onChange={setFullName} autoComplete="name" />
                )}
                <Field
                  id="lg-email"
                  testId="login-email"
                  label={isFa ? 'ایمیل سازمانی' : 'Work email'}
                  icon={<Mail className="w-4 h-4" />}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="username"
                  dir="ltr"
                />
                <Field
                  id="lg-pass"
                  testId="login-password"
                  label={isFa ? 'رمز عبور' : 'Password'}
                  icon={<Lock className="w-4 h-4" />}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? 8 : undefined}
                  dir="ltr"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? (isFa ? 'پنهان‌کردن رمز' : 'Hide password') : isFa ? 'نمایش رمز' : 'Show password'}
                      className="w-8 h-8 rounded-lg text-white/45 hover:text-white hover:bg-white/10 flex items-center justify-center transition cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
                {mode === 'register' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="lg-dept" label={isFa ? 'واحد سازمانی' : 'Department'} icon={<Building2 className="w-4 h-4" />} value={department} onChange={setDepartment} required={false} />
                    <Field id="lg-job" label={isFa ? 'عنوان شغلی' : 'Job title'} icon={<UserIcon className="w-4 h-4" />} value={jobTitle} onChange={setJobTitle} required={false} />
                  </div>
                )}

                <AnimatePresence>
                  {(capsOn || errorMsg) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {errorMsg ? (
                        <p role="alert" className="rounded-xl bg-red-500/15 ring-1 ring-red-400/40 px-3.5 py-2.5 text-xs text-red-200">
                          {errorMsg}
                        </p>
                      ) : (
                        <p className="rounded-xl bg-amber-400/10 ring-1 ring-amber-300/30 px-3.5 py-2 text-xs text-amber-200">
                          {isFa ? 'Caps Lock روشن است' : 'Caps Lock is on'}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading}
                  data-testid="login-submit"
                  className="login-cta group relative w-full h-14 mt-2 rounded-2xl font-extrabold text-sm text-white overflow-hidden flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <span aria-hidden className="login-shine absolute inset-y-0 -start-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent skew-x-[-20deg]" />
                  {loading ? (
                    <Loader2 className="relative w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span className="relative">
                        {mode === 'login' ? (isFa ? 'ورود به میزکار' : 'Enter workspace') : isFa ? 'ساخت حساب و ورود' : 'Create account'}
                      </span>
                      <ArrowRight className="relative w-4 h-4 transition-transform rtl:rotate-180 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                    </>
                  )}
                </button>
              </motion.form>

              {demo && (
                <div className="relative mt-6 pt-5 border-t border-white/10">
                  <p className="text-[11px] font-semibold text-white/45 mb-2.5">
                    {isFa ? 'حساب‌های نمونه (فقط محیط آزمایشی)' : 'Demo accounts (test environment only)'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {DEMO_PERSONAS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={loading}
                        data-testid={`quick-login-${p.id}`}
                        onClick={() => handleDemoLogin(p.id)}
                        className="text-start rounded-xl bg-white/[0.04] ring-1 ring-white/10 hover:ring-red-400/60 hover:bg-white/[0.08] px-3 py-2 transition cursor-pointer"
                      >
                        <div className="text-xs font-bold truncate">{isFa ? p.nameFa : p.nameEn}</div>
                        <div className="text-[10px] text-white/45 truncate">{isFa ? p.roleFa : p.roleEn}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-white/40">
            <ShieldCheck className="w-3.5 h-3.5 text-red-400/80" />
            {isFa ? 'نشست‌ها رمزنگاری‌شده‌اند و همهٔ ورودها در لاگ ممیزی ثبت می‌شود' : 'Sessions are encrypted and every sign-in is audit-logged'}
          </p>
        </section>
      </main>

      <footer className="relative z-10 text-center text-[11px] text-white/30 pb-5">
        © {isFa ? 'شرکت اصفهان چالاک' : 'Esfahan Chalak Co.'}
      </footer>

      {/* Caps lock detection must live on the password input; attach via capture on the page */}
      <CapsLockWatcher onChange={setCapsOn} />
    </div>
  );
}

/** Reports Caps Lock state from any keyboard event while the login page is open. */
function CapsLockWatcher({ onChange }: { onChange: (on: boolean) => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') onChange(e.getModifierState('CapsLock'));
    };
    window.addEventListener('keydown', h);
    window.addEventListener('keyup', h);
    return () => {
      window.removeEventListener('keydown', h);
      window.removeEventListener('keyup', h);
    };
  }, [onChange]);
  return null;
}
