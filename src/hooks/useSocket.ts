import { useEffect, useRef } from 'react';
import { io, type Socket } from '../lib/wsClient';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import type { Message, NotificationItem, TaskItem, WikiDoc } from '../types/index';

let sharedSocket: Socket | null = null;

export function getSharedSocket(): Socket | null {
  return sharedSocket;
}

export function useSocket() {
  const accessToken = useAppStore((s) => s.accessToken);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const setSocketConnected = useAppStore((s) => s.setSocketConnected);
  const setTypingUsers = useAppStore((s) => s.setTypingUsers);
  const setWikiCursor = useAppStore((s) => s.setWikiCursor);
  const setHuddlesSnapshot = useAppStore((s) => s.setHuddlesSnapshot);
  const pushIosPopup = useAppStore((s) => s.pushIosPopup);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      sharedSocket?.disconnect();
      sharedSocket = null;
      setSocketConnected(false);
      return;
    }

    const socket = io({
      auth: { token: accessToken },
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
    });

    sharedSocket = socket;
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      const currChannel = useAppStore.getState().activeChannelId;
      if (currChannel) socket.emit('channel:join', currChannel);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('message:new', ({ channelId, message }: { channelId: string; message: Message }) => {
      if (message.parentId) {
        // Update thread cache idempotently
        queryClient.setQueryData<{ parent: Message; replies: Message[] }>(
          ['thread', message.parentId],
          (old) => {
            if (!old) return old;
            if (old.replies.some((r) => r.id === message.id)) return old;
            return {
              ...old,
              parent: { ...old.parent, replyCount: old.parent.replyCount + 1, lastReplyAt: message.createdAt },
              replies: [...old.replies, message],
            };
          }
        );
        // Update reply count on parent message in channel feed
        queryClient.setQueryData<{ messages: Message[] }>(['messages', channelId], (old) => {
          if (!old) return old;
          return {
            messages: old.messages.map((m) =>
              m.id === message.parentId
                ? { ...m, replyCount: m.replyCount + 1, lastReplyAt: message.createdAt }
                : m
            ),
          };
        });
      } else {
        queryClient.setQueryData<{ messages: Message[] }>(['messages', channelId], (old) => {
          if (!old) return { messages: [message] };
          if (old.messages.some((m) => m.id === message.id)) return old;
          return { messages: [...old.messages, message] };
        });
      }
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    });

    socket.on('message:updated', ({ channelId, message }: { channelId: string; message: Message }) => {
      queryClient.setQueryData<{ messages: Message[] }>(['messages', channelId], (old) => {
        if (!old) return old;
        return { messages: old.messages.map((m) => (m.id === message.id ? message : m)) };
      });
      if (message.parentId) {
        queryClient.invalidateQueries({ queryKey: ['thread', message.parentId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['thread', message.id] });
      }
    });

    socket.on('typing:update', ({ channelId, users }: { channelId: string; users: Array<{ userId: string; displayName: string }> }) => {
      setTypingUsers(channelId, users);
    });

    socket.on('channel:read-receipt', ({ channelId }: { channelId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    });

    socket.on('channel:created', () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    });

    socket.on('channel:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    });

    socket.on('channel:archived', () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['archive'] });
    });

    socket.on('message:archived', ({ channelId }: { channelId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
      queryClient.invalidateQueries({ queryKey: ['archive'] });
    });

    socket.on('task:updated', ({ channelId }: { channelId: string; task?: TaskItem }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', channelId] });
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['archive'] });
    });

    socket.on('tasks:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['archive'] });
    });

    socket.on('wiki:updated', (wiki: WikiDoc) => {
      queryClient.setQueryData(['wiki', wiki.channelId], { wiki });
    });

    socket.on('wiki:cursor', ({ channelId, userId, displayName, offset }: { channelId: string; userId: string; displayName: string; offset: number }) => {
      setWikiCursor(channelId, { userId, displayName, offset, updatedAt: Date.now() });
    });

    socket.on(
      'notification:new',
      (payload?: {
        notification?: NotificationItem;
        senderName?: string;
        avatarUrl?: string | null;
        inviteId?: string;
      }) => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        if (payload?.notification?.type === 'GROUP_INVITE') {
          queryClient.invalidateQueries({ queryKey: ['group-invites'] });
        }
        if (payload?.notification) {
          pushIosPopup({
            id: payload.notification.id,
            title: payload.notification.title,
            body: payload.notification.body,
            senderName: payload.senderName,
            avatarUrl: payload.avatarUrl ?? null,
            channelId: payload.notification.channelId,
            inviteId: payload.inviteId,
            type: payload.notification.type,
            createdAt: payload.notification.createdAt,
          });
        }
      }
    );

    socket.on('group:invite', () => {
      queryClient.invalidateQueries({ queryKey: ['group-invites'] });
    });

    socket.on('group:invite-responded', () => {
      queryClient.invalidateQueries({ queryKey: ['group-invites'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    });

    socket.on('directory:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['directory'] });
    });

    socket.on('rbac:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['rbac-matrix'] });
    });

    socket.on('approvals:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    });

    socket.on('standups:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['standups'] });
    });

    socket.on('backup:restored', () => {
      queryClient.invalidateQueries();
    });

    socket.on('workspace:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    });

    socket.on('system:broadcast', () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-broadcasts'] });
    });

    socket.on('audit:new', () => {
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    });

    socket.on('huddles:snapshot', (snapshot) => {
      setHuddlesSnapshot(snapshot || {});
    });

    return () => {
      socket.disconnect();
      if (sharedSocket === socket) sharedSocket = null;
    };
  }, [accessToken, pushIosPopup, queryClient, setHuddlesSnapshot, setSocketConnected, setTypingUsers, setWikiCursor]);

  useEffect(() => {
    if (sharedSocket && activeChannelId) {
      sharedSocket.emit('channel:join', activeChannelId);
    }
  }, [activeChannelId]);

  return socketRef.current;
}
