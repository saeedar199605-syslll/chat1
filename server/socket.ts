import { Hub, type Conn as Socket } from './realtime';
import { canPerformAction } from '../src/utils/chatLogic';
import { channelAccess, getUserById, verifyAccessToken } from './auth';
import { db } from './db';
import type { AnnotationStroke, HuddleParticipant } from '../src/types/index';

interface ActiveHuddleRoom {
  channelId: string;
  topic: string;
  isRecording: boolean;
  participants: Map<string, HuddleParticipant>;
  strokes: AnnotationStroke[];
}

const activeHuddles = new Map<string, ActiveHuddleRoom>();
const typingByChannel = new Map<string, Map<string, { userId: string; displayName: string }>>();

let ioInstance: Hub | null = null;

export function getIO(): Hub | null {
  return ioInstance;
}

export function getActiveHuddlesSummary(): Record<string, { participantCount: number; topic: string; participants: HuddleParticipant[] }> {
  const result: Record<string, { participantCount: number; topic: string; participants: HuddleParticipant[] }> = {};
  for (const [channelId, room] of activeHuddles.entries()) {
    if (room.participants.size > 0) {
      result[channelId] = {
        participantCount: room.participants.size,
        topic: room.topic,
        participants: Array.from(room.participants.values()),
      };
    }
  }
  return result;
}

export function initSocketServer(): Hub {
  const io = new Hub();

  ioInstance = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Unauthorized'));
      return;
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      next(new Error('Invalid token'));
      return;
    }
    const user = getUserById(payload.userId);
    if (!user || user.isActive === false) {
      next(new Error('User not found'));
      return;
    }
    const rev = db.prepare(`SELECT COALESCE(tokenRevokedBefore, 0) as t FROM users WHERE id = ?`).get(user.id) as { t: number };
    if (rev.t > 0 && (payload.iat || 0) * 1000 < rev.t) {
      next(new Error('Session revoked'));
      return;
    }
    socket.data.userId = user.id;
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const user = getUserById(userId);
    if (!user) return;

    socket.join(`user:${userId}`);
    socket.join(`role:${user.role}`);

    // Join all workspace & channel rooms the user belongs to
    const memberships = db
      .prepare(`SELECT channelId FROM channel_members WHERE userId = ?`)
      .all(userId) as Array<{ channelId: string }>;
    for (const m of memberships) {
      socket.join(`channel:${m.channelId}`);
    }

    const wsMemberships = db
      .prepare(`SELECT workspaceId FROM workspace_members WHERE userId = ?`)
      .all(userId) as Array<{ workspaceId: string }>;
    for (const w of wsMemberships) {
      socket.join(`workspace:${w.workspaceId}`);
    }

    // Send initial active huddles snapshot
    socket.emit('huddles:snapshot', visibleHuddles(socket));

    const canAccess = (channelId: unknown): channelId is string =>
      typeof channelId === 'string' && channelAccess(userId, channelId) === 'ok';

    socket.on('channel:join', (channelId: string) => {
      if (canAccess(channelId)) socket.join(`channel:${channelId}`);
    });

    // Typing indicators
    socket.on('typing:start', ({ channelId }: { channelId: string }) => {
      if (!canAccess(channelId)) return;
      const freshUser = getUserById(userId);
      if (!freshUser) return;
      let map = typingByChannel.get(channelId);
      if (!map) {
        map = new Map();
        typingByChannel.set(channelId, map);
      }
      map.set(userId, { userId, displayName: freshUser.displayName });
      socket.to(`channel:${channelId}`).emit('typing:update', {
        channelId,
        users: Array.from(map.values()),
      });
    });

    socket.on('typing:stop', ({ channelId }: { channelId: string }) => {
      const map = typingByChannel.get(channelId);
      if (map) {
        map.delete(userId);
        socket.to(`channel:${channelId}`).emit('typing:update', {
          channelId,
          users: Array.from(map.values()),
        });
      }
    });

    // Collaborative Live Wiki editing & multi-cursor awareness
    socket.on('wiki:edit', ({ channelId, title, content }: { channelId: string; title: string; content: string }) => {
      const freshUser = getUserById(userId);
      if (!freshUser || !canAccess(channelId) || !canPerformAction(freshUser.role, 'message:pin')) return;
      if (typeof title !== 'string' || typeof content !== 'string' || title.length > 200 || content.length > 200_000) return;
      const now = new Date().toISOString();
      const existing = db.prepare(`SELECT id, version FROM wiki_docs WHERE channelId = ?`).get(channelId) as
        | { id: string; version: number }
        | undefined;
      let version = 1;
      if (existing) {
        version = existing.version + 1;
        db.prepare(`UPDATE wiki_docs SET title = ?, content = ?, version = ?, updatedById = ?, updatedAt = ? WHERE id = ?`).run(
          title,
          content,
          version,
          userId,
          now,
          existing.id
        );
      } else {
        db.prepare(`INSERT INTO wiki_docs (id, channelId, title, content, version, updatedById, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
          `wiki_${Date.now()}`,
          channelId,
          title,
          content,
          1,
          userId,
          now
        );
      }

      socket.to(`channel:${channelId}`).emit('wiki:updated', {
        channelId,
        title,
        content,
        version,
        updatedById: userId,
        updatedByName: freshUser.displayName,
        updatedAt: now,
      });
    });

    socket.on('wiki:cursor', ({ channelId, offset }: { channelId: string; offset: number }) => {
      const freshUser = getUserById(userId);
      if (!freshUser || !canAccess(channelId)) return;
      socket.to(`channel:${channelId}`).emit('wiki:cursor', {
        channelId,
        userId,
        displayName: freshUser.displayName,
        offset,
      });
    });

    // WebRTC Huddle & Meeting Signaling
    socket.on('huddle:join', ({ channelId, topic }: { channelId: string; topic?: string }) => {
      const freshUser = getUserById(userId);
      if (!freshUser || !canAccess(channelId)) return;

      let room = activeHuddles.get(channelId);
      if (!room) {
        room = {
          channelId,
          topic: typeof topic === 'string' ? topic.slice(0, 120) : 'Instant Huddle',
          isRecording: false,
          participants: new Map(),
          strokes: [],
        };
        activeHuddles.set(channelId, room);
      }

      const participant: HuddleParticipant = {
        userId,
        user: freshUser,
        socketId: socket.id,
        isMuted: false,
        isCameraOn: false,
        isScreenOn: false,
        handRaised: false,
      };

      room.participants.set(userId, participant);
      socket.join(`huddle:${channelId}`);

      // Notify existing peers so they can initiate WebRTC offers
      socket.to(`huddle:${channelId}`).emit('huddle:peer-joined', {
        channelId,
        participant,
      });

      // Send current room state to joiner
      socket.emit('huddle:room-state', {
        channelId,
        topic: room.topic,
        isRecording: room.isRecording,
        participants: Array.from(room.participants.values()),
        strokes: room.strokes,
      });

      broadcastHuddles(io);
    });

    socket.on('huddle:leave', ({ channelId }: { channelId: string }) => {
      leaveHuddleRoom(io, socket, channelId, userId);
    });

    socket.on(
      'huddle:media-state',
      ({
        channelId,
        isMuted,
        isCameraOn,
        isScreenOn,
        handRaised,
      }: {
        channelId: string;
        isMuted?: boolean;
        isCameraOn?: boolean;
        isScreenOn?: boolean;
        handRaised?: boolean;
      }) => {
        const room = activeHuddles.get(channelId);
        const participant = room?.participants.get(userId);
        if (!room || !participant) return;

        if (typeof isMuted === 'boolean') participant.isMuted = isMuted;
        if (typeof isCameraOn === 'boolean') participant.isCameraOn = isCameraOn;
        if (typeof isScreenOn === 'boolean') participant.isScreenOn = isScreenOn;
        if (typeof handRaised === 'boolean') participant.handRaised = handRaised;

        io.to(`huddle:${channelId}`).emit('huddle:participant-updated', {
          channelId,
          participant,
        });
        broadcastHuddles(io);
      }
    );

    socket.on('huddle:recording-state', ({ channelId, isRecording }: { channelId: string; isRecording: boolean }) => {
      const room = activeHuddles.get(channelId);
      if (!room || !room.participants.has(userId)) return;
      room.isRecording = isRecording;
      io.to(`huddle:${channelId}`).emit('huddle:recording-updated', { channelId, isRecording });
    });

    // Live Screen Annotation & Laser Pointer Overlay
    socket.on('huddle:annotation', ({ channelId, stroke }: { channelId: string; stroke: AnnotationStroke }) => {
      const room = activeHuddles.get(channelId);
      if (!room || !room.participants.has(userId) || !stroke || typeof stroke !== 'object') return;
      if (!stroke.isLaser) {
        room.strokes.push(stroke);
        if (room.strokes.length > 100) room.strokes.shift();
      }
      socket.to(`huddle:${channelId}`).emit('huddle:annotation', { channelId, stroke });
    });

    socket.on('huddle:annotation-clear', ({ channelId }: { channelId: string }) => {
      const room = activeHuddles.get(channelId);
      if (!room || !room.participants.has(userId)) return;
      room.strokes = [];
      io.to(`huddle:${channelId}`).emit('huddle:annotation-clear', { channelId });
    });

    // WebRTC Peer-to-Peer Offer / Answer / ICE Relay
    socket.on('webrtc:offer', ({ channelId, targetUserId, sdp }: { channelId: string; targetUserId: string; sdp: unknown }) => {
      if (!sameHuddle(channelId, userId, targetUserId)) return;
      io.to(`user:${targetUserId}`).emit('webrtc:offer', {
        channelId,
        fromUserId: userId,
        sdp,
      });
    });

    socket.on('webrtc:answer', ({ channelId, targetUserId, sdp }: { channelId: string; targetUserId: string; sdp: unknown }) => {
      if (!sameHuddle(channelId, userId, targetUserId)) return;
      io.to(`user:${targetUserId}`).emit('webrtc:answer', {
        channelId,
        fromUserId: userId,
        sdp,
      });
    });

    socket.on('webrtc:ice-candidate', ({ channelId, targetUserId, candidate }: { channelId: string; targetUserId: string; candidate: unknown }) => {
      if (!sameHuddle(channelId, userId, targetUserId)) return;
      io.to(`user:${targetUserId}`).emit('webrtc:ice-candidate', {
        channelId,
        fromUserId: userId,
        candidate,
      });
    });

    socket.on('disconnect', () => {
      // Remove from typing indicators
      for (const [channelId, map] of typingByChannel.entries()) {
        if (map.delete(userId)) {
          io.to(`channel:${channelId}`).emit('typing:update', {
            channelId,
            users: Array.from(map.values()),
          });
        }
      }
      // Remove from any active huddles
      for (const [channelId, room] of activeHuddles.entries()) {
        if (room.participants.has(userId)) {
          leaveHuddleRoom(io, socket, channelId, userId);
        }
      }
    });
  });

  return io;
}

function leaveHuddleRoom(io: Hub, socket: Socket, channelId: string, userId: string): void {
  const room = activeHuddles.get(channelId);
  if (!room) return;
  room.participants.delete(userId);
  socket.leave(`huddle:${channelId}`);
  io.to(`huddle:${channelId}`).emit('huddle:peer-left', { channelId, userId });
  if (room.participants.size === 0) {
    activeHuddles.delete(channelId);
  }
  broadcastHuddles(io);
}

function sameHuddle(channelId: string, a: string, b: string): boolean {
  const room = typeof channelId === 'string' ? activeHuddles.get(channelId) : undefined;
  return Boolean(room?.participants.has(a) && room.participants.has(b));
}

/** Only huddles in channels the socket belongs to (private channel huddles must not leak). */
function visibleHuddles(socket: Socket) {
  const all = getActiveHuddlesSummary();
  return Object.fromEntries(Object.entries(all).filter(([channelId]) => socket.rooms.has(`channel:${channelId}`)));
}

function broadcastHuddles(io: Hub): void {
  for (const socket of io.sockets.sockets.values()) socket.emit('huddles:snapshot', visibleHuddles(socket));
}
