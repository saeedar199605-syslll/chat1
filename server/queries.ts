import { db } from './db';
import type {
  Attachment,
  Channel,
  Message,
  MessageEditEntry,
  Poll,
  ReactionGroup,
  TaskItem,
  TaskPriority,
  User,
  WikiDoc,
} from '../src/types/index';

// Prepared statements are compiled once and reused (hydrateMessage runs ~8 queries per message).
const stmtCache = new Map<string, ReturnType<typeof db.prepare>>();
function q(sql: string) {
  let st = stmtCache.get(sql);
  if (!st) {
    st = db.prepare(sql);
    stmtCache.set(sql, st);
  }
  return st;
}

function mapUser(row: Record<string, unknown>): User {
  let customPermissions: Record<string, boolean> = {};
  try {
    customPermissions = JSON.parse(String(row.customPermissionsJson || '{}'));
  } catch {
    customPermissions = {};
  }
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.fullName),
    displayName: String(row.displayName),
    avatarUrl: (row.avatarUrl as string | null) ?? null,
    jobTitle: String(row.jobTitle),
    department: String(row.department),
    timezone: String(row.timezone),
    role: row.role as User['role'],
    presence: row.presence as User['presence'],
    customStatus: (row.customStatus as string | null) ?? null,
    customEmoji: (row.customEmoji as string | null) ?? null,
    dndEnabled: Boolean(row.dndEnabled),
    dndStartHour: Number(row.dndStartHour ?? 19),
    dndEndHour: Number(row.dndEndHour ?? 8),
    managerId: (row.managerId as string | null) ?? null,
    isActive: row.isActive === undefined ? true : Boolean(row.isActive),
    groupAddPolicy: row.groupAddPolicy === 'REQUEST' ? 'REQUEST' : 'DIRECT',
    customPermissions,
  };
}

export function getAllUsers(): User[] {
  const rows = q(
      `SELECT id, email, fullName, displayName, avatarUrl, jobTitle, department, timezone, role, presence, customStatus, customEmoji, dndEnabled, dndStartHour, dndEndHour, managerId, COALESCE(isActive, 1) as isActive, COALESCE(customPermissionsJson, '{}') as customPermissionsJson, COALESCE(groupAddPolicy, 'DIRECT') as groupAddPolicy
       FROM users ORDER BY fullName ASC`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapUser);
}

export function hydrateMessage(messageId: string, viewerUserId: string): Message | null {
  const row = q(
      `SELECT m.*, c.name as channelName, u.id as u_id, u.email as u_email, u.fullName as u_fullName, u.displayName as u_displayName,
              u.avatarUrl as u_avatarUrl, u.jobTitle as u_jobTitle, u.department as u_department,
              u.timezone as u_timezone, u.role as u_role, u.presence as u_presence,
              u.customStatus as u_customStatus, u.customEmoji as u_customEmoji,
              u.dndEnabled as u_dndEnabled, u.dndStartHour as u_dndStartHour, u.dndEndHour as u_dndEndHour,
              u.managerId as u_managerId, COALESCE(u.groupAddPolicy, 'DIRECT') as u_groupAddPolicy
       FROM messages m
       JOIN users u ON u.id = m.authorId
       LEFT JOIN channels c ON c.id = m.channelId
       WHERE m.id = ?`
    )
    .get(messageId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const author: User = {
    id: String(row.u_id),
    email: String(row.u_email),
    fullName: String(row.u_fullName),
    displayName: String(row.u_displayName),
    avatarUrl: (row.u_avatarUrl as string | null) ?? null,
    jobTitle: String(row.u_jobTitle),
    department: String(row.u_department),
    timezone: String(row.u_timezone),
    role: row.u_role as User['role'],
    presence: row.u_presence as User['presence'],
    customStatus: (row.u_customStatus as string | null) ?? null,
    customEmoji: (row.u_customEmoji as string | null) ?? null,
    dndEnabled: Boolean(row.u_dndEnabled),
    dndStartHour: Number(row.u_dndStartHour ?? 19),
    dndEndHour: Number(row.u_dndEndHour ?? 8),
    managerId: (row.u_managerId as string | null) ?? null,
    groupAddPolicy: row.u_groupAddPolicy === 'REQUEST' ? 'REQUEST' : 'DIRECT',
  };

  const attachments = q(
      `SELECT a.*, u.displayName as uploaderName
       FROM attachments a
       JOIN users u ON u.id = a.uploaderId
       WHERE a.messageId = ? ORDER BY a.createdAt ASC`
    )
    .all(messageId) as unknown as Attachment[];

  const rawReactions = q(`SELECT emoji, userId FROM reactions WHERE messageId = ? ORDER BY createdAt ASC`)
    .all(messageId) as Array<{ emoji: string; userId: string }>;

  const rxMap = new Map<string, string[]>();
  for (const r of rawReactions) {
    const arr = rxMap.get(r.emoji) ?? [];
    arr.push(r.userId);
    rxMap.set(r.emoji, arr);
  }
  const reactions: ReactionGroup[] = Array.from(rxMap.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));

  const bookmarkRow = q(`SELECT id FROM bookmarks WHERE messageId = ? AND userId = ?`)
    .get(messageId, viewerUserId);

  const replyStats = q(
      `SELECT COUNT(*) as cnt, MAX(createdAt) as lastAt FROM messages WHERE parentId = ? AND deletedAt IS NULL`
    )
    .get(messageId) as { cnt: number; lastAt: string | null };

  const editHistory = q(`SELECT id, previousContent, editedAt FROM message_edit_history WHERE messageId = ? ORDER BY editedAt DESC`)
    .all(messageId) as unknown as MessageEditEntry[];

  let poll: Poll | null = null;
  const pollRow = q(`SELECT id, question FROM polls WHERE messageId = ?`)
    .get(messageId) as { id: string; question: string } | undefined;
  if (pollRow) {
    const optionsRows = q(`SELECT id, label FROM poll_options WHERE pollId = ? ORDER BY sortOrder ASC`)
      .all(pollRow.id) as Array<{ id: string; label: string }>;
    poll = {
      id: pollRow.id,
      question: pollRow.question,
      options: optionsRows.map((opt) => {
        const votes = q(`SELECT userId FROM poll_votes WHERE optionId = ?`)
          .all(opt.id) as Array<{ userId: string }>;
        return {
          id: opt.id,
          label: opt.label,
          votes: votes.map((v) => v.userId),
        };
      }),
    };
  }

  let task: TaskItem | null = null;
  const taskRow = q(
      `SELECT t.*, c.displayName as creatorName, a.displayName as assigneeName
       FROM tasks t
       JOIN users c ON c.id = t.creatorId
       LEFT JOIN users a ON a.id = t.assigneeId
       WHERE t.messageId = ?`
    )
    .get(messageId) as unknown as (TaskItem & { priority?: TaskPriority }) | undefined;
  if (taskRow) {
    task = { ...taskRow, priority: (taskRow.priority as TaskPriority) || 'MEDIUM' };
  }

  let readByUserIds: string[] = [];
  try {
    readByUserIds = JSON.parse(String(row.readByJson || '[]'));
  } catch {
    readByUserIds = [];
  }

  return {
    id: String(row.id),
    channelId: String(row.channelId),
    channelName: (row.channelName as string | undefined) ?? undefined,
    authorId: String(row.authorId),
    author,
    parentId: (row.parentId as string | null) ?? null,
    type: row.type as Message['type'],
    content: row.deletedAt ? 'This message was deleted.' : String(row.content),
    isPinned: Boolean(row.isPinned),
    isEdited: Boolean(row.isEdited),
    isBookmarked: Boolean(bookmarkRow),
    isArchived: Boolean(row.isArchived),
    archivedAt: (row.archivedAt as string | null) ?? null,
    deletedAt: (row.deletedAt as string | null) ?? null,
    readByUserIds,
    replyCount: Number(replyStats.cnt ?? 0),
    lastReplyAt: replyStats.lastAt ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    attachments,
    reactions,
    poll,
    task,
    editHistory,
  };
}

export function getChannelMessages(channelId: string, viewerUserId: string, limit = 100): Message[] {
  const rows = q(
      `SELECT id FROM messages WHERE channelId = ? AND parentId IS NULL AND COALESCE(isArchived, 0) = 0 ORDER BY createdAt ASC LIMIT ?`
    )
    .all(channelId, limit) as Array<{ id: string }>;

  return rows
    .map((r) => hydrateMessage(r.id, viewerUserId))
    .filter((m): m is Message => m !== null);
}

export function getThreadMessages(parentId: string, viewerUserId: string): { parent: Message | null; replies: Message[] } {
  const parent = hydrateMessage(parentId, viewerUserId);
  const rows = q(`SELECT id FROM messages WHERE parentId = ? ORDER BY createdAt ASC`)
    .all(parentId) as Array<{ id: string }>;
  const replies = rows
    .map((r) => hydrateMessage(r.id, viewerUserId))
    .filter((m): m is Message => m !== null);
  return { parent, replies };
}

export function getWorkspaceChannels(workspaceId: string, userId: string, includeArchived = false): Channel[] {
  const rows = q(
      `SELECT c.*, cm.isStarred, cm.isMuted, cm.lastReadAt,
              (SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channelId = c.id) as memberCount
       FROM channels c
       JOIN channel_members cm ON cm.channelId = c.id AND cm.userId = ?
       WHERE c.workspaceId = ? ${includeArchived ? '' : 'AND COALESCE(c.isArchived, 0) = 0'}
       ORDER BY c.type ASC, c.name ASC`
    )
    .all(userId, workspaceId) as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const channelId = String(r.id);
    const lastReadAt = String(r.lastReadAt);
    const unreadRow = q(
        `SELECT COUNT(*) as cnt FROM messages WHERE channelId = ? AND parentId IS NULL AND createdAt > ? AND authorId != ? AND deletedAt IS NULL AND COALESCE(isArchived, 0) = 0`
      )
      .get(channelId, lastReadAt, userId) as { cnt: number };

    let dmPeerUser: User | null = null;
    if (r.type === 'DM') {
      const peerRow = q(
          `SELECT u.* FROM channel_members cm
           JOIN users u ON u.id = cm.userId
           WHERE cm.channelId = ? AND cm.userId != ? LIMIT 1`
        )
        .get(channelId, userId) as Record<string, unknown> | undefined;
      if (peerRow) dmPeerUser = mapUser(peerRow);
    }

    return {
      id: channelId,
      workspaceId: String(r.workspaceId),
      name: dmPeerUser ? dmPeerUser.displayName : String(r.name),
      slug: String(r.slug),
      description: (r.description as string | null) ?? null,
      topic: (r.topic as string | null) ?? null,
      type: r.type as Channel['type'],
      isStarred: Boolean(r.isStarred),
      isMuted: Boolean(r.isMuted),
      isArchived: Boolean(r.isArchived),
      archivedAt: (r.archivedAt as string | null) ?? null,
      unreadCount: Number(unreadRow.cnt ?? 0),
      memberCount: Number(r.memberCount ?? 1),
      activeCallId: null,
      dmPeerUser,
    };
  });
}

export function getChannelWiki(channelId: string): WikiDoc | null {
  const row = q(
      `SELECT w.*, u.displayName as updatedByName
       FROM wiki_docs w
       LEFT JOIN users u ON u.id = w.updatedById
       WHERE w.channelId = ?`
    )
    .get(channelId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    id: String(row.id),
    channelId: String(row.channelId),
    title: String(row.title),
    content: String(row.content),
    version: Number(row.version),
    updatedById: String(row.updatedById),
    updatedByName: (row.updatedByName as string | undefined) ?? 'Team Member',
    updatedAt: String(row.updatedAt),
  };
}
