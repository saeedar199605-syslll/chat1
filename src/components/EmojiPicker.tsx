import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { EMOJI_CATEGORIES, filterEmojis, type EmojiCategory } from '../utils/emojis';
import type { CustomEmoji } from '../types/index';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  customEmojis?: CustomEmoji[];
  align?: 'start' | 'end';
}

export function EmojiPicker({ onSelect, onClose, customEmojis = [], align = 'start' }: EmojiPickerProps) {
  const locale = useAppStore((s) => s.locale);
  const isFa = locale === 'fa';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EmojiCategory>('all');

  const filtered = useMemo(() => filterEmojis(query, category), [query, category]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 6 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      data-testid="emoji-picker-popover"
      className={`w-[350px] max-w-[92vw] rounded-2xl border border-neutral-200/90 dark:border-neutral-700/80 bg-white/95 dark:bg-neutral-900/95 ios-glass-strong shadow-2xl overflow-hidden z-50 ${
        align === 'end' ? 'end-0' : 'start-0'
      }`}
    >
      {/* Search Bar */}
      <div className="p-2.5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isFa ? 'جستجوی ایموجی (مثلاً لبخند، تایید، موشک)...' : 'Search emojis...'}
            aria-label={isFa ? 'جستجوی ایموجی' : 'Search emojis'}
            autoFocus
            className="w-full ps-8 pe-2.5 py-1.5 text-xs rounded-xl bg-neutral-100/90 dark:bg-neutral-800/90 text-neutral-900 dark:text-neutral-100 border border-transparent focus:border-red-500 focus:outline-none"
          />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={isFa ? 'بستن' : 'Close'}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="px-2 py-1.5 border-b border-neutral-200/70 dark:border-neutral-800 flex flex-wrap items-center gap-1">
        {EMOJI_CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              title={isFa ? cat.labelFa : cat.labelEn}
              className={`px-2 py-1 rounded-lg text-[10.5px] font-medium whitespace-nowrap flex items-center gap-1 transition-colors ${
                active
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-red-50 dark:hover:bg-neutral-800'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{isFa ? cat.labelFa : cat.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* Company Custom Emojis */}
      {customEmojis.length > 0 && !query.trim() && category === 'all' && (
        <div className="px-2.5 pt-2 pb-1 border-b border-neutral-100 dark:border-neutral-800">
          <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-1">
            {isFa ? 'ایموجی‌های اختصاصی اصفهان چالاک' : 'Esfahan Chalak Custom'}
          </div>
          <div className="flex flex-wrap gap-1">
            {customEmojis.map((ce) => (
              <motion.button
                key={ce.id}
                type="button"
                whileHover={{ scale: 1.18 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onSelect(ce.glyph)}
                title={`:${ce.shortcode}:`}
                className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-neutral-800 flex items-center justify-center text-base"
              >
                {ce.glyph}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Main Scrollable Emoji Grid */}
      <div className="p-2 max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400">
            {isFa ? 'ایموجی مطابقی یافت نشد.' : 'No matching emojis found.'}
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {filtered.map((item, idx) => (
              <motion.button
                key={`${item.glyph}-${idx}`}
                type="button"
                whileHover={{ scale: 1.22 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onSelect(item.glyph)}
                title={isFa ? item.nameFa : item.nameEn}
                aria-label={isFa ? item.nameFa : item.nameEn}
                className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-neutral-800 flex items-center justify-center text-lg transition-colors"
              >
                {item.glyph}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Footer Count */}
      <div className="px-3 py-1.5 bg-neutral-50/80 dark:bg-neutral-950/60 border-t border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-[10px] text-neutral-400 tabular-nums">
        <span>{isFa ? 'مجموع ایموجی‌های نمایش‌داده‌شده' : 'Showing emojis'}</span>
        <span className="font-mono font-semibold text-red-600 dark:text-red-400">{filtered.length}</span>
      </div>
    </motion.div>
  );
}
