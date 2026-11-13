import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function ContextMenu() {
  const contextMenu = useAppStore((s) => s.contextMenu);
  const closeContextMenu = useAppStore((s) => s.closeContextMenu);
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    setHoveredId(null);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const openedAt = Date.now();

    const handlePointerDown = (e: MouseEvent) => {
      if (e.button === 2) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    const handleScroll = () => {
      if (Date.now() - openedAt > 150) {
        closeContextMenu();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu, closeContextMenu]);

  const estimatedWidth = 264;
  const estimatedHeight = contextMenu ? Math.min(460, contextMenu.items.length * 38 + 48) : 220;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const left = contextMenu ? Math.max(8, Math.min(contextMenu.x, vw - estimatedWidth - 8)) : 0;
  const top = contextMenu ? Math.max(8, Math.min(contextMenu.y, vh - estimatedHeight - 8)) : 0;

  return (
    <AnimatePresence>
      {contextMenu && (
        <motion.div
          key={`${contextMenu.x}-${contextMenu.y}-${contextMenu.title ?? 'menu'}`}
          ref={menuRef}
          data-testid="app-context-menu"
          role="menu"
          initial={{ opacity: 0, scale: 0.9, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: -4 }}
          transition={{ type: 'spring', stiffness: 460, damping: 30 }}
          style={{ top, left }}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-[80] w-[264px] rounded-2xl ios-glass-strong bg-white/88 dark:bg-neutral-900/88 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl p-1.5 overflow-hidden"
        >
          {contextMenu.title && (
            <div className="px-3 py-2 mb-1 rounded-xl bg-red-50/75 dark:bg-red-950/40 border border-red-200/60 dark:border-red-900/40 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-red-700 dark:text-red-300 truncate">
                {contextMenu.title}
              </span>
              <Sparkles className="w-3 h-3 text-red-500 shrink-0" />
            </div>
          )}
          <div className="space-y-0.5 max-h-[380px] overflow-y-auto">
            {contextMenu.items.map((item, idx) => {
              const Icon = item.icon;
              const isHovered = hoveredId === item.id;
              return (
                <div key={item.id}>
                  {item.dividerAbove && (
                    <div className="my-1.5 mx-2 border-t border-neutral-200/70 dark:border-neutral-800" />
                  )}
                  <motion.button
                    type="button"
                    role="menuitem"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.14), duration: 0.14 }}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
                    onClick={() => {
                      item.onSelect();
                      closeContextMenu();
                    }}
                    className={`relative w-full px-2.5 py-2 rounded-xl text-start text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      item.danger
                        ? 'text-red-600 dark:text-red-400'
                        : isHovered
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-neutral-700 dark:text-neutral-200'
                    }`}
                  >
                    {isHovered && (
                      <motion.span
                        layoutId="ctx-hover-glass"
                        transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                        className={`absolute inset-0 rounded-xl ${
                          item.danger
                            ? 'bg-red-100/80 dark:bg-red-950/60 border border-red-200/70 dark:border-red-800/50'
                            : 'ios-glass-selected-soft'
                        }`}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2 min-w-0">
                      {Icon && (
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            item.danger
                              ? 'text-red-600 dark:text-red-400'
                              : isHovered
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-neutral-400 dark:text-neutral-500'
                          }`}
                        />
                      )}
                      <span className="truncate font-medium">{item.label}</span>
                    </span>
                    {item.shortcut && (
                      <span className="relative z-10 text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-neutral-800/80 border border-neutral-200/70 dark:border-neutral-700 text-neutral-500 shrink-0">
                        {item.shortcut}
                      </span>
                    )}
                  </motion.button>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
