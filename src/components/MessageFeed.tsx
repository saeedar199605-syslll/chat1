import { useEffect, useRef } from 'react';
import { Hash } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { buildChatBackgroundStyle } from '../utils/chatLogic';
import { MessageItem } from './MessageItem';
import type { Channel, Message, TaskStatus } from '../types/index';

interface MessageFeedProps {
  channel: Channel | undefined;
  channels: Channel[];
  messages: Message[];
  isLoading: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onVotePoll: (pollId: string, optionId: string) => void;
  onToggleTask: (taskId: string, status: TaskStatus) => void;
  onConvertTask: (message: Message) => void;
  onPin: (messageId: string) => void;
  onArchive?: (messageId: string) => void;
  onBookmark: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onForward: (messageId: string, targetChannelId: string) => void;
}

export function MessageFeed({
  channel,
  channels,
  messages,
  isLoading,
  onReact,
  onVotePoll,
  onToggleTask,
  onConvertTask,
  onPin,
  onArchive,
  onBookmark,
  onEdit,
  onDelete,
  onForward,
}: MessageFeedProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const locale = useAppStore((s) => s.locale);
  const theme = useAppStore((s) => s.theme);
  const chatBgPreset = useAppStore((s) => s.chatBgPreset);
  const chatBgCustomColor = useAppStore((s) => s.chatBgCustomColor);
  const chatBgPattern = useAppStore((s) => s.chatBgPattern);
  const chatBgOpacity = useAppStore((s) => s.chatBgOpacity);
  const typingByChannel = useAppStore((s) => s.typingByChannel);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isFa = locale === 'fa';

  const bgStyle = buildChatBackgroundStyle({
    preset: chatBgPreset,
    customColor: chatBgCustomColor,
    pattern: chatBgPattern,
    opacity: chatBgOpacity,
    isDark: theme === 'dark',
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channel?.id, messages.length]);

  const typingUsers = (channel ? typingByChannel[channel.id] || [] : []).filter(
    (u) => u.userId !== currentUser?.id
  );

  if (isLoading) {
    return (
      <div
        data-testid="message-feed-canvas"
        style={bgStyle}
        className="relative z-0 flex-1 overflow-y-auto p-6 space-y-5"
      >
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-start gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-lg bg-neutral-200 dark:bg-neutral-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="message-feed-canvas"
      style={bgStyle}
      className="relative z-0 flex-1 overflow-y-auto flex flex-col transition-[background] duration-300"
    >
      {/* Channel Welcome Hero */}
      {channel && (
        <div className="px-6 pt-7 pb-5 border-b border-neutral-200/80 dark:border-neutral-800/80">
          <div className="w-10 h-10 rounded-xl bg-red-50/90 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 flex items-center justify-center text-red-600 dark:text-red-400 mb-3">
            <Hash className="w-5 h-5" />
          </div>
          <h2 className="font-display font-bold text-xl text-neutral-900 dark:text-neutral-100">
            {channel.type === 'DM' ? channel.name : `#${channel.name}`}
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
            {channel.description ||
              (isFa
                ? `این آغاز گفتگوهای کانال ${channel.type === 'DM' ? channel.name : `#${channel.name}`} در فضای کاری است.`
                : `This is the beginning of the ${channel.name} workspace channel.`)}
          </p>
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 py-3 divide-y divide-transparent">
        {messages.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {isFa ? (
              <>
                هنوز پیامی ثبت نشده است. گفتگو را شروع کنید یا از دستورات{' '}
                <code className="font-mono text-red-600">/poll</code> یا{' '}
                <code className="font-mono text-red-600">/task</code> استفاده کنید.
              </>
            ) : (
              <>
                No messages yet. Start the conversation or type <code className="font-mono text-red-600">/poll</code> or{' '}
                <code className="font-mono text-red-600">/task</code> below.
              </>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              channels={channels}
              onReact={onReact}
              onVotePoll={onVotePoll}
              onToggleTask={onToggleTask}
              onConvertTask={onConvertTask}
              onPin={onPin}
              onArchive={onArchive}
              onBookmark={onBookmark}
              onEdit={onEdit}
              onDelete={onDelete}
              onForward={onForward}
            />
          ))
        )}
      </div>

      {/* Live Typing Indicator Bar */}
      <div className="h-6 px-6 flex items-center shrink-0">
        {typingUsers.length > 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-medium text-red-600 dark:text-red-400">
              {typingUsers.map((u) => u.displayName).join('، ')}
            </span>{' '}
            {isFa
              ? typingUsers.length === 1
                ? 'در حال تایپ است...'
                : 'در حال تایپ هستند...'
              : `${typingUsers.length === 1 ? 'is' : 'are'} typing...`}
          </p>
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
