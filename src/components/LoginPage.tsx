import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  UserPlus,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { useServerInfo } from '../lib/serverInfo';

const DEMO_PERSONAS = [
  {
    id: 'usr_elena',
    nameFa: 'النا روستوا',
    nameEn: 'Elena Rostova',
    roleFa: 'سوپر ادمین / مدیرعامل',
    roleEn: 'Super Admin / CEO',
    deptFa: 'مدیریت ارشد',
    email: 'elena.rostova@acme.io',
  },
  {
    id: 'usr_marcus',
    nameFa: 'مارکوس ونس',
    nameEn: 'Marcus Vance',
    roleFa: 'مدیر واحد فنی',
    roleEn: 'Dept Manager',
    deptFa: 'فنی و مهندسی',
    email: 'marcus.vance@acme.io',
  },
  {
    id: 'usr_dariush',
    nameFa: 'داریوش فراهانی',
    nameEn: 'Dariush Farahani',
    roleFa: 'کارمند ارشد سیستم',
    roleEn: 'Member',
    deptFa: 'زیرساخت و عملیات',
    email: 'dariush.farahani@acme.io',
  },
  {
    id: 'usr_lucas',
    nameFa: 'لوکاس کیم',
    nameEn: 'Lucas Kim',
    roleFa: 'مهمان / مشاور پروژه',
    roleEn: 'Guest',
    deptFa: 'مشاوره برون‌سازمانی',
    email: 'lucas.kim@acme.io',
  },
];

export function LoginPage() {
  const setAuth = useAppStore((s) => s.setAuth);
  const showToast = useAppStore((s) => s.showToast);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const glassMode = useAppStore((s) => s.glassMode);
  const setGlassMode = useAppStore((s) => s.setGlassMode);

  const isFa = locale === 'fa';
  const info = useServerInfo();
  const demo = Boolean(info?.demo);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('فنی و مهندسی');
  const [jobTitle, setJobTitle] = useState('کارشناس ارشد');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      setErrorMsg((err as Error).message);
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
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="login-page"
      className="min-h-screen w-full ios-mesh-bg flex flex-col justify-between p-4 sm:p-8 overflow-y-auto relative"
    >
      {/* Ambient Liquid Glass Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -start-24 w-96 h-96 rounded-full bg-red-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -end-24 w-[28rem] h-[28rem] rounded-full bg-red-600/10 blur-3xl" />
      </div>

      {/* Top Controls Bar */}
      <header className="relative z-10 w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-[240px] flex-1">
          <div className="w-11 h-11 rounded-2xl ios-glass-card border border-red-200/80 dark:border-red-900/50 p-1.5 flex items-center justify-center shrink-0">
            <img src="/assets/esfahan-chalak-logo.png" alt="اصفهان چالاک" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-base sm:text-lg text-neutral-900 dark:text-white">
              {isFa ? 'پلتفرم ارتباطات سازمانی اصفهان چالاک' : 'Esfahan Chalak Enterprise Suite'}
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {isFa ? 'سامانه یکپارچه گفتگو، وظایف، جلسات و ممیزی امنیتی' : 'Unified Messaging, Tasks, Meetings & Governance'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setGlassMode(!glassMode)}
            className="px-3 py-1.5 rounded-xl ios-glass-card border border-neutral-200/80 dark:border-neutral-700/80 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-red-600" />
            <span>{isFa ? (glassMode ? 'شیشه‌ای iOS' : 'حالت ساده') : glassMode ? 'iOS Glass' : 'Flat'}</span>
          </button>
          <button
            type="button"
            onClick={() => setLocale(locale === 'fa' ? 'en' : 'fa')}
            className="px-3 py-1.5 rounded-xl ios-glass-card border border-neutral-200/80 dark:border-neutral-700/80 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Languages className="w-3.5 h-3.5 text-red-600" />
            <span>{locale === 'fa' ? 'FA' : 'EN'}</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            className="p-2 rounded-xl ios-glass-card border border-neutral-200/80 dark:border-neutral-700/80 text-neutral-700 dark:text-neutral-200 hover:border-red-400 transition-colors"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Auth Grid */}
      <main className={`relative z-10 w-full max-w-5xl mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch ${demo ? '' : 'max-w-xl'}`}>
        {/* Left / Auth Form Card */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className={`${demo ? 'lg:col-span-7' : 'lg:col-span-12'} rounded-3xl ios-glass-strong border border-neutral-200/80 dark:border-neutral-800 p-6 sm:p-8 flex flex-col justify-between`}
        >
          <div>
            {/* Mode Switch Tabs */}
            <div className="inline-flex p-1 rounded-2xl bg-neutral-100/90 dark:bg-neutral-800/90 border border-neutral-200/70 dark:border-neutral-700/60 mb-6">
              <button
                type="button"
                data-testid="login-mode-signin"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  mode === 'login'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isFa ? 'ورود به حساب سازمانی' : 'Sign In'}</span>
              </button>
              {info?.registration && <button
                type="button"
                data-testid="login-mode-register"
                onClick={() => {
                  setMode('register');
                  setErrorMsg(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  mode === 'register'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isFa ? 'ثبت‌نام همکار جدید' : 'Create Account'}</span>
              </button>}
            </div>

            <h2 className="font-display font-bold text-xl sm:text-2xl text-neutral-900 dark:text-white mb-1.5">
              {mode === 'login'
                ? isFa
                  ? 'ورود امن به میز کار اصفهان چالاک'
                  : 'Sign in to Esfahan Chalak'
                : isFa
                  ? 'ایجاد حساب کاربری در سازمان'
                  : 'Create Organizational Account'}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              {mode === 'login'
                ? isFa
                  ? (demo ? 'ایمیل سازمانی و رمز عبور خود را وارد کنید یا از پنل دسترسی سریع استفاده نمایید.' : 'ایمیل سازمانی و رمز عبور خود را وارد کنید.')
                  : 'Enter your corporate email and password to access your workspaces.'
                : isFa
                  ? 'مشخصات فردی و واحد سازمانی خود را برای عضویت در شرکت اصفهان چالاک ثبت کنید.'
                  : 'Register your corporate profile and department membership.'}
            </p>

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-300"
              >
                {errorMsg}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'نام و نام خانوادگی' : 'Full Name'}
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={isFa ? 'مثلاً سارا محمدی' : 'Sara Mohammadi'}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isFa ? 'واحد سازمانی' : 'Department / Unit'}
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder={isFa ? 'فنی و مهندسی' : 'Engineering'}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'عنوان شغلی' : 'Job Title'}
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={isFa ? 'کارشناس ارشد توسعه سیستم' : 'Senior Engineer'}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'ایمیل سازمانی' : 'Corporate Email'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    data-testid="login-email-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@esfahan-chalak.ir"
                    dir="ltr"
                    className="w-full ps-10 pe-3.5 py-2.5 text-sm rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'رمز عبور' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    data-testid="login-password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="w-full ps-10 pe-10 py-2.5 text-sm rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={isFa ? 'نمایش یا مخفی‌سازی رمز' : 'Toggle password visibility'}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={loading}
                data-testid="login-submit-btn"
                className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-colors cursor-pointer"
              >
                <span>
                  {loading
                    ? isFa
                      ? 'در حال احراز هویت...'
                      : 'Authenticating...'
                    : mode === 'login'
                      ? isFa
                        ? 'ورود به سامانه'
                        : 'Sign In'
                      : isFa
                        ? 'ثبت‌نام و ورود'
                        : 'Register & Enter'}
                </span>
                <ArrowRight className={`w-4 h-4 ${isFa ? 'rotate-180' : ''}`} />
              </motion.button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-red-600" />
              {isFa ? 'رمزنگاری JWT و ثبت کامل لاگ ممیزی' : 'JWT Auth & Complete Audit Logging'}
            </span>
            {demo && <span className="font-mono">Workstream!2026</span>}
          </div>
        </motion.section>

        {/* Right / Quick Access Personas (demo servers only) */}
        {demo && <motion.aside
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.06 }}
          className="lg:col-span-5 rounded-3xl ios-glass-card border border-neutral-200/80 dark:border-neutral-800 p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-semibold mb-2">
              <Building2 className="w-4 h-4" />
              <span>{isFa ? 'ورود سریع بر اساس نقش سازمانی' : 'Quick Role Access'}</span>
            </div>
            <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white mb-1">
              {isFa ? 'آزمایش فوری سطوح دسترسی' : 'Instant Role Switcher'}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
              {isFa
                ? 'برای بررسی بخش سوپر ادمین، مدیریت واحد، کارمند یا کاربر مهمان، روی هر حساب کلیک کنید.'
                : 'Select an organizational role below to inspect Super Admin, Manager, Member, or Guest views.'}
            </p>

            <div className="space-y-2.5">
              {DEMO_PERSONAS.map((p) => (
                <motion.button
                  key={p.id}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  type="button"
                  disabled={loading}
                  data-testid={`quick-login-${p.id}`}
                  onClick={() => handleDemoLogin(p.id)}
                  className="w-full text-start p-3 rounded-2xl bg-white/75 dark:bg-neutral-800/75 border border-neutral-200/80 dark:border-neutral-700/80 hover:border-red-400 dark:hover:border-red-700 transition-all flex items-center justify-between gap-3 group cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                      {isFa ? p.nameFa : p.nameEn}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                      {isFa ? `${p.roleFa} · ${p.deptFa}` : `${p.roleEn} · ${p.email}`}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 text-[11px] font-semibold group-hover:bg-red-600 group-hover:text-white transition-colors whitespace-nowrap shrink-0">
                    {isFa ? 'ورود' : 'Enter'}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="mt-6 p-3.5 rounded-2xl bg-red-50/70 dark:bg-red-950/25 border border-red-200/70 dark:border-red-900/40 text-[11px] text-neutral-700 dark:text-neutral-300 leading-relaxed">
            {isFa
              ? 'تمامی نشست‌ها با توکن امضاشده JWT برقرار شده و در جدول لاگ‌های امنیتی سوپر ادمین ثبت می‌شوند.'
              : 'All sign-ins issue signed JWT tokens and are recorded in the Super Admin audit log.'}
          </div>
        </motion.aside>}
      </main>

      <footer className="relative z-10 w-full max-w-5xl mx-auto text-center text-[11px] text-neutral-400">
        {isFa ? '© شرکت اصفهان چالاک — پلتفرم یکپارچه همکاری و مدیریت سازمان' : '© Esfahan Chalak Co. — Enterprise Collaboration Platform'}
      </footer>
    </div>
  );
}
