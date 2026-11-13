import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Maximize2, Minimize2, RotateCw, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { computeAvatarCropDrawParams } from '../utils/chatLogic';

interface AvatarCropModalProps {
  open: boolean;
  file: File | null;
  isFa: boolean;
  onClose: () => void;
  onConfirm: (croppedFile: File) => Promise<void> | void;
}

const CANVAS_SIZE = 320;
const EXPORT_SIZE = 512;

const BG_SWATCHES = [
  { id: '#ffffff', labelFa: 'سفید', labelEn: 'White' },
  { id: '#fef2f2', labelFa: 'یاقوتی ملایم', labelEn: 'Soft Red' },
  { id: '#f1f5f9', labelFa: 'طوسی روشن', labelEn: 'Slate' },
  { id: '#18181b', labelFa: 'مشکی', labelEn: 'Dark' },
  { id: 'transparent', labelFa: 'شفاف', labelEn: 'Transparent' },
];

export function AvatarCropModal({ open, file, isFa, onClose, onConfirm }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('cover');
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [saving, setSaving] = useState(false);

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  useEffect(() => {
    if (!open || !file) {
      setImgEl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      setZoom(1);
      setRotationDeg(0);
      setOffsetX(0);
      setOffsetY(0);
      setFitMode(Math.abs(img.width - img.height) > Math.min(img.width, img.height) * 0.25 ? 'contain' : 'cover');
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    const rotatedQuarter = ((rotationDeg / 90) % 2 + 2) % 2 === 1;
    const effW = rotatedQuarter ? imgEl.height : imgEl.width;
    const effH = rotatedQuarter ? imgEl.width : imgEl.height;

    const { drawW, drawH, centerX, centerY } = computeAvatarCropDrawParams({
      imgWidth: effW,
      imgHeight: effH,
      canvasSize: CANVAS_SIZE,
      zoom,
      offsetX,
      offsetY,
      fitMode,
    });

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    const finalDrawW = rotatedQuarter ? drawH : drawW;
    const finalDrawH = rotatedQuarter ? drawW : drawH;
    ctx.drawImage(imgEl, -finalDrawW / 2, -finalDrawH / 2, finalDrawW, finalDrawH);
    ctx.restore();

    // Subtle circular guide overlay outside avatar ring
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.44, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, [imgEl, zoom, rotationDeg, offsetX, offsetY, fitMode, bgColor]);

  const handleConfirm = async () => {
    if (!imgEl || !file) return;
    setSaving(true);
    try {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = EXPORT_SIZE;
      outCanvas.height = EXPORT_SIZE;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;

      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
      }

      const ratio = EXPORT_SIZE / CANVAS_SIZE;
      const rotatedQuarter = ((rotationDeg / 90) % 2 + 2) % 2 === 1;
      const effW = rotatedQuarter ? imgEl.height : imgEl.width;
      const effH = rotatedQuarter ? imgEl.width : imgEl.height;

      const { drawW, drawH, centerX, centerY } = computeAvatarCropDrawParams({
        imgWidth: effW,
        imgHeight: effH,
        canvasSize: EXPORT_SIZE,
        zoom,
        offsetX: offsetX * ratio,
        offsetY: offsetY * ratio,
        fitMode,
      });

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      const finalDrawW = rotatedQuarter ? drawH : drawW;
      const finalDrawH = rotatedQuarter ? drawW : drawH;
      ctx.drawImage(imgEl, -finalDrawW / 2, -finalDrawH / 2, finalDrawW, finalDrawH);
      ctx.restore();

      const blob = await new Promise<Blob | null>((resolve) => outCanvas.toBlob(resolve, 'image/png', 0.95));
      if (!blob) return;
      const outFile = new File([blob], `avatar-${Date.now()}.png`, { type: 'image/png' });
      await onConfirm(outFile);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          data-testid="avatar-crop-modal"
          aria-label={isFa ? 'ویرایش و تنظیم ابعاد عکس پروفایل' : 'Crop & Resize Profile Photo'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="w-full max-w-lg rounded-3xl ios-glass-strong bg-white/95 dark:bg-neutral-900/95 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden"
          >
            <div className="h-13 px-5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-neutral-900 dark:text-neutral-100">
                {isFa ? 'تنظیم کادر، زوم و ابعاد تصویر پروفایل' : 'Edit, Zoom & Fit Profile Photo'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label={isFa ? 'بستن ویرایشگر' : 'Close cropper'}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-inner bg-[conic-gradient(#e5e7eb_90deg,#fff_90deg_180deg,#e5e7eb_180deg_270deg,#fff_270deg)] bg-[length:16px_16px]">
                  <canvas
                    ref={canvasRef}
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    onPointerDown={(e) => {
                      dragRef.current = {
                        active: true,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: offsetX,
                        origY: offsetY,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (!dragRef.current.active) return;
                      setOffsetX(dragRef.current.origX + (e.clientX - dragRef.current.startX));
                      setOffsetY(dragRef.current.origY + (e.clientY - dragRef.current.startY));
                    }}
                    onPointerUp={() => {
                      dragRef.current.active = false;
                    }}
                    className="w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] touch-none cursor-grab active:cursor-grabbing block"
                  />
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {isFa
                    ? 'تصویر را بکشید تا در دایره مرکزی تنظیم شود؛ در صورت بزرگ بودن گزینه «جای‌گیری کامل» را بزنید.'
                    : 'Drag image to center it; use Fit Whole Image if edges are cropped.'}
                </p>
              </div>

              {/* Zoom Slider */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}
                  aria-label="Zoom out"
                  className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min={0.25}
                  max={3.5}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  aria-label={isFa ? 'بزرگ‌نمایی تصویر' : 'Zoom level'}
                  className="flex-1 accent-red-600"
                />
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3.5, +(z + 0.1).toFixed(2)))}
                  aria-label="Zoom in"
                  className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono tabular-nums w-12 text-end text-neutral-600 dark:text-neutral-300">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              {/* Fit / Fill / Rotate / Reset controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setFitMode('contain');
                      setZoom(1);
                      setOffsetX(0);
                      setOffsetY(0);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                      fitMode === 'contain' ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    <Minimize2 className="w-3 h-3" />
                    <span>{isFa ? 'جای‌گیری کامل' : 'Fit Whole'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFitMode('cover');
                      setZoom(1);
                      setOffsetX(0);
                      setOffsetY(0);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                      fitMode === 'cover' ? 'ios-glass-selected' : 'text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>{isFa ? 'پر کردن کادر' : 'Fill Frame'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRotationDeg((d) => (d + 90) % 360)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{isFa ? 'چرخش ۹۰°' : 'Rotate 90°'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1);
                      setRotationDeg(0);
                      setOffsetX(0);
                      setOffsetY(0);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-red-400 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isFa ? 'بازنشانی' : 'Reset'}</span>
                  </button>
                </div>
              </div>

              {/* Background fill color when image is zoomed out / contained */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                  {isFa ? 'رنگ پس‌زمینه حاشیه:' : 'Padding fill:'}
                </span>
                <div className="flex items-center gap-1.5">
                  {BG_SWATCHES.map((sw) => (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() => setBgColor(sw.id)}
                      title={isFa ? sw.labelFa : sw.labelEn}
                      aria-label={isFa ? sw.labelFa : sw.labelEn}
                      style={{
                        background:
                          sw.id === 'transparent'
                            ? 'conic-gradient(#d4d4d8 90deg,#fff 90deg 180deg,#d4d4d8 180deg 270deg,#fff 270deg)'
                            : sw.id,
                      }}
                      className={`w-6 h-6 rounded-full border cursor-pointer ${
                        bgColor === sw.id
                          ? 'ring-2 ring-red-600 border-white scale-110'
                          : 'border-neutral-300 dark:border-neutral-600'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="button"
                  data-testid="avatar-crop-save-btn"
                  disabled={saving || !imgEl}
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ios-glass-selected text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{saving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'برش و ذخیره پروفایل' : 'Crop & Save Avatar'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
