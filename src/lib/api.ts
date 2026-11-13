import { useAppStore } from '../store/useAppStore';
import type {
  AdminOverview,
  ApprovalCategory,
  ApprovalRequest,
  ApprovalStatus,
  Attachment,
  AuditCategory,
  AuditLogEntry,
  AuditSeverity,
  BackupBundle,
  BackupSnapshotSummary,
  BroadcastLevel,
  Channel,
  CustomEmoji,
  GroupAddPolicy,
  GroupJoinRequest,
  Message,
  NotificationItem,
  NotificationType,
  Role,
  SearchResult,
  StandupCheckin,
  StandupMood,
  SystemBroadcast,
  TaskItem,
  TaskPriority,
  TaskStatus,
  User,
  WikiDoc,
  Workspace,
} from '../types/index';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// One refresh at a time: parallel 401s (a page fires ~10 requests) must not each spend a refresh call.
let refreshing: Promise<'ok' | 'invalid' | 'error'> | null = null;

function refreshSession(): Promise<'ok' | 'invalid' | 'error'> {
  refreshing ??= (async () => {
    const { refreshToken, setAuth } = useAppStore.getState();
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        setAuth(data.accessToken, refreshToken!, data.user);
        return 'ok' as const;
      }
      // Only a rejected token means "signed out"; 5xx/429/network blips must not log the user out.
      return res.status === 401 || res.status === 400 ? ('invalid' as const) : ('error' as const);
    } catch {
      return 'error' as const;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken, refreshToken, clearAuth } = useAppStore.getState();
  const headers = new Headers(init.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (!(init.body instanceof FormData) && !(init.body instanceof Blob) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });

  if (res.status === 401 && retry && refreshToken) {
    const outcome = await refreshSession();
    if (outcome === 'ok') return request<T>(path, init, false);
    if (outcome === 'invalid') clearAuth();
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(errBody.error || `Request failed (${res.status})`, res.status);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (payload: { email: string; password: string; fullName: string; jobTitle?: string; department?: string }) =>
    request<{ accessToken: string; refreshToken: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  demoSwitch: (userId = 'usr_elena') =>
    request<{ accessToken: string; refreshToken: string; user: User }>('/api/auth/demo-switch', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  me: () => request<{ user: User }>('/api/auth/me'),

  // Workspaces
  getWorkspaces: () => request<{ workspaces: Workspace[] }>('/api/workspaces'),
  createWorkspace: (name: string, domain?: string) =>
    request<{ workspace: Workspace }>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, domain }),
    }),
  updateWorkspace: (
    workspaceId: string,
    payload: { name?: string; domain?: string; logoText?: string; logoUrl?: string | null }
  ) =>
    request<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  uploadWorkspaceLogo: async (workspaceId: string, file: File): Promise<{ workspace: Workspace; logoUrl: string }> => {
    const form = new FormData();
    form.append('logo', file);
    return request<{ workspace: Workspace; logoUrl: string }>(`/api/workspaces/${workspaceId}/logo`, {
      method: 'POST',
      body: form,
    });
  },
  updateMemberRole: (workspaceId: string, userId: string, role: Role) =>
    request<{ user: User }>(`/api/workspaces/${workspaceId}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  // Channels
  getChannels: (workspaceId: string) => request<{ channels: Channel[] }>(`/api/workspaces/${workspaceId}/channels`),
  createChannel: (workspaceId: string, payload: { name: string; description?: string; type: 'PUBLIC' | 'PRIVATE' | 'ANNOUNCEMENT' }) =>
    request<{ channel: Channel }>(`/api/workspaces/${workspaceId}/channels`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createGroup: (workspaceId: string, payload: { name: string; description?: string; memberIds: string[] }) =>
    request<{ channel: Channel; addedUserIds: string[]; requestedUserIds: string[] }>(
      `/api/workspaces/${workspaceId}/groups`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  addChannelMembers: (channelId: string, userIds: string[]) =>
    request<{ addedUserIds: string[]; requestedUserIds: string[] }>(`/api/channels/${channelId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    }),
  getGroupInvites: () => request<{ invites: GroupJoinRequest[] }>('/api/group-invites'),
  respondGroupInvite: (inviteId: string, action: 'ACCEPT' | 'DECLINE') =>
    request<{ ok: boolean; status: string; channelId: string }>(`/api/group-invites/${inviteId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  openDm: (workspaceId: string, targetUserId: string) =>
    request<{ channel: Channel }>(`/api/workspaces/${workspaceId}/dm`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),
  starChannel: (channelId: string, isStarred: boolean) =>
    request<{ ok: boolean }>(`/api/channels/${channelId}/star`, {
      method: 'PATCH',
      body: JSON.stringify({ isStarred }),
    }),
  muteChannel: (channelId: string, isMuted: boolean) =>
    request<{ ok: boolean }>(`/api/channels/${channelId}/mute`, {
      method: 'PATCH',
      body: JSON.stringify({ isMuted }),
    }),
  markChannelRead: (channelId: string) =>
    request<{ ok: boolean }>(`/api/channels/${channelId}/read`, { method: 'POST' }),
  getChannelMembers: (channelId: string) => request<{ members: User[] }>(`/api/channels/${channelId}/members`),
  updateChannelTopic: (channelId: string, topic: string) =>
    request<{ ok: boolean; topic: string | null }>(`/api/channels/${channelId}/topic`, {
      method: 'PATCH',
      body: JSON.stringify({ topic }),
    }),
  archiveChannel: (channelId: string) =>
    request<{ ok: boolean }>(`/api/channels/${channelId}/archive`, { method: 'POST' }),
  unarchiveChannel: (channelId: string) =>
    request<{ ok: boolean }>(`/api/channels/${channelId}/unarchive`, { method: 'POST' }),

  // Messages
  getMessages: (channelId: string) => request<{ messages: Message[] }>(`/api/channels/${channelId}/messages`),
  postMessage: (
    channelId: string,
    payload: {
      content: string;
      parentId?: string | null;
      attachmentIds?: string[];
      poll?: { question: string; options: string[] };
      task?: { title: string; assigneeHandle?: string; dueDate?: string };
    }
  ) =>
    request<{ message: Message }>(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  editMessage: (messageId: string, content: string) =>
    request<{ message: Message }>(`/api/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  deleteMessage: (messageId: string) =>
    request<{ message: Message }>(`/api/messages/${messageId}`, { method: 'DELETE' }),
  pinMessage: (messageId: string) =>
    request<{ message: Message }>(`/api/messages/${messageId}/pin`, { method: 'POST' }),
  archiveMessage: (messageId: string) =>
    request<{ ok: boolean }>(`/api/messages/${messageId}/archive`, { method: 'POST' }),
  unarchiveMessage: (messageId: string) =>
    request<{ ok: boolean; message: Message | null }>(`/api/messages/${messageId}/unarchive`, { method: 'POST' }),
  bookmarkMessage: (messageId: string) =>
    request<{ message: Message; isBookmarked: boolean }>(`/api/messages/${messageId}/bookmark`, { method: 'POST' }),
  getBookmarks: () => request<{ messages: Message[] }>('/api/bookmarks'),
  forwardMessage: (messageId: string, targetChannelId: string) =>
    request<{ message: Message }>(`/api/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ targetChannelId }),
    }),
  toggleReaction: (messageId: string, emoji: string) =>
    request<{ message: Message }>(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),
  getThread: (parentId: string) => request<{ parent: Message; replies: Message[] }>(`/api/messages/${parentId}/thread`),

  // Polls, Tasks & Wiki
  votePoll: (pollId: string, optionId: string) =>
    request<{ message: Message }>(`/api/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    }),
  getAllTasks: (params?: { workspaceId?: string; status?: string; priority?: string; assigneeId?: string; channelId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.workspaceId) qs.set('workspaceId', params.workspaceId);
    if (params?.status) qs.set('status', params.status);
    if (params?.priority) qs.set('priority', params.priority);
    if (params?.assigneeId) qs.set('assigneeId', params.assigneeId);
    if (params?.channelId) qs.set('channelId', params.channelId);
    return request<{ tasks: TaskItem[] }>(`/api/tasks?${qs.toString()}`);
  },
  getTasks: (channelId: string) => request<{ tasks: TaskItem[] }>(`/api/channels/${channelId}/tasks`),
  createTask: (
    channelId: string,
    payload: {
      title: string;
      description?: string;
      assigneeId?: string | null;
      dueDate?: string | null;
      priority?: TaskPriority;
      status?: TaskStatus;
      sourceMessageId?: string | null;
    }
  ) =>
    request<{ task: TaskItem }>(`/api/channels/${channelId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateTask: (
    taskId: string,
    payload: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeId?: string | null;
      dueDate?: string | null;
    }
  ) =>
    request<{ task: TaskItem }>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteTask: (taskId: string) => request<{ ok: boolean }>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
  getWiki: (channelId: string) => request<{ wiki: WikiDoc | null }>(`/api/channels/${channelId}/wiki`),
  saveWiki: (channelId: string, title: string, content: string) =>
    request<{ wiki: WikiDoc }>(`/api/channels/${channelId}/wiki`, {
      method: 'PUT',
      body: JSON.stringify({ title, content }),
    }),

  // S3-compatible Presigned Uploads with progress callback
  uploadFilePresigned: async (
    channelId: string,
    file: File | Blob,
    fileName: string,
    onProgress?: (pct: number) => void
  ): Promise<Attachment> => {
    const mimeType = file.type || 'application/octet-stream';
    onProgress?.(10);
    const presign = await request<{ uploadUrl: string }>('/api/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({
        channelId,
        fileName,
        mimeType,
        sizeBytes: file.size || 1,
      }),
    });

    onProgress?.(40);
    const { accessToken } = useAppStore.getState();
    const putRes = await new Promise<{ attachment: Attachment }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presign.uploadUrl);
      if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress?.(40 + Math.round((ev.loaded / ev.total) * 55));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during presigned upload'));
      xhr.send(file);
    });
    return putRes.attachment;
  },
  getFiles: (params: { workspaceId?: string; channelId?: string; type?: string }) => {
    const qs = new URLSearchParams();
    if (params.workspaceId) qs.set('workspaceId', params.workspaceId);
    if (params.channelId) qs.set('channelId', params.channelId);
    if (params.type && params.type !== 'all') qs.set('type', params.type);
    return request<{ files: Array<Attachment & { channelName?: string }> }>(`/api/files?${qs.toString()}`);
  },
  deleteFile: (fileId: string) => request<{ ok: boolean }>(`/api/files/${fileId}`, { method: 'DELETE' }),

  // Search, Directory, Status, Notifications, Custom Emojis
  search: (q: string, workspaceId: string) =>
    request<SearchResult>(`/api/search?q=${encodeURIComponent(q)}&workspaceId=${encodeURIComponent(workspaceId)}`),
  getDirectory: () => request<{ users: User[] }>('/api/directory'),
  createMember: (payload: {
    fullName: string;
    email: string;
    jobTitle: string;
    department: string;
    timezone?: string;
    role?: Role;
    managerId?: string | null;
  }) =>
    request<{ user: User }>('/api/directory', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMember: (
    userId: string,
    payload: {
      fullName?: string;
      jobTitle?: string;
      department?: string;
      timezone?: string;
      role?: Role;
      managerId?: string | null;
    }
  ) =>
    request<{ user: User }>(`/api/directory/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateMyStatus: (payload: { presence?: User['presence']; customStatus?: string | null; customEmoji?: string | null }) =>
    request<{ user: User }>('/api/users/me/status', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateMyDnd: (payload: { dndEnabled: boolean; dndStartHour?: number; dndEndHour?: number }) =>
    request<{ user: User }>('/api/users/me/dnd', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateMyGroupPolicy: (groupAddPolicy: GroupAddPolicy) =>
    request<{ user: User }>('/api/users/me/group-policy', {
      method: 'PATCH',
      body: JSON.stringify({ groupAddPolicy }),
    }),
  getNotifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  triggerTestNotification: (payload?: { title?: string; body?: string; channelId?: string; type?: NotificationType }) =>
    request<{ notification: NotificationItem }>('/api/notifications/test', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  readAllNotifications: () => request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),
  readNotification: (id: string) => request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),
  getCustomEmojis: (workspaceId: string) =>
    request<{ emojis: CustomEmoji[] }>(`/api/custom-emojis?workspaceId=${workspaceId}`),

  // Archive & Backup
  getArchive: (workspaceId: string) =>
    request<{ channels: Channel[]; messages: Message[]; tasks: TaskItem[] }>(
      `/api/archive?workspaceId=${encodeURIComponent(workspaceId)}`
    ),
  getBackupSnapshots: () =>
    request<{ snapshots: BackupSnapshotSummary[]; liveCounts: Record<string, number> }>('/api/backup/snapshots'),
  createBackupSnapshot: (label?: string) =>
    request<{ snapshot: BackupSnapshotSummary; liveCounts: Record<string, number> }>('/api/backup/snapshots', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  verifyBackup: (payload: { snapshotId?: string; bundle?: BackupBundle | unknown }) =>
    request<{
      valid: boolean;
      checksumMatch: boolean;
      expectedSha256?: string | null;
      computedSha256?: string;
      errors: string[];
      counts: Record<string, number>;
    }>('/api/backup/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  restoreBackup: (payload: { snapshotId?: string; bundle?: BackupBundle | unknown }) =>
    request<{ ok: boolean; restoredCounts: Record<string, number>; sha256: string }>('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Granular RBAC & Full User Governance
  getRbacMatrix: () => request<{ matrix: Record<Role, Record<string, boolean>> }>('/api/rbac/matrix'),
  updateRbacMatrix: (matrix: Record<string, Record<string, boolean>>) =>
    request<{ matrix: Record<Role, Record<string, boolean>> }>('/api/rbac/matrix', {
      method: 'PUT',
      body: JSON.stringify({ matrix }),
    }),
  adminCreateUser: (payload: {
    fullName: string;
    email: string;
    password: string;
    jobTitle: string;
    department: string;
    timezone?: string;
    role: Role;
    managerId?: string | null;
    isActive?: boolean;
    customPermissions?: Record<string, boolean>;
  }) =>
    request<{ user: User }>('/api/users/admin/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminUpdateUser: (
    userId: string,
    payload: {
      fullName?: string;
      jobTitle?: string;
      department?: string;
      timezone?: string;
      role?: Role;
      managerId?: string | null;
      isActive?: boolean;
      customPermissions?: Record<string, boolean>;
      newPassword?: string;
    }
  ) =>
    request<{ user: User }>(`/api/users/admin/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateMyProfile: (payload: {
    fullName?: string;
    jobTitle?: string;
    department?: string;
    timezone?: string;
    newPassword?: string;
  }) =>
    request<{ user: User }>('/api/users/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  uploadMyAvatar: async (file: File): Promise<{ user: User; avatarUrl: string }> => {
    const token = useAppStore.getState().accessToken;
    const fd = new FormData();
    fd.append('avatar', file);
    const res = await fetch('/api/users/me/avatar', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Avatar upload failed');
    return data;
  },
  changeMyPassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean; accessToken: string; refreshToken: string; user: User | null }>('/api/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getSecuritySessions: () =>
    request<{
      activeRefreshTokens: Array<{ id: string; expiresAt: string; createdAt: string }>;
      recentSecurityEvents: Array<{ id: string; action: string; severity: string; targetLabel: string | null; createdAt: string }>;
    }>('/api/auth/sessions'),
  revokeAllSessions: () =>
    request<{ ok: boolean; accessToken: string; refreshToken: string; user: User }>('/api/auth/revoke-sessions', {
      method: 'POST',
    }),

  // Enterprise Workflows: Approvals & Daily Standup Check-ins
  getApprovals: () => request<{ approvals: ApprovalRequest[] }>('/api/approvals'),
  createApproval: (payload: {
    category: ApprovalCategory;
    title: string;
    details: string;
    metricLabel?: string;
    approverId?: string | null;
  }) =>
    request<{ approval: ApprovalRequest }>('/api/approvals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reviewApproval: (id: string, payload: { status: Exclude<ApprovalStatus, 'PENDING'>; reviewerNote?: string }) =>
    request<{ approval: ApprovalRequest }>(`/api/approvals/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getStandups: () => request<{ standups: StandupCheckin[] }>('/api/standups'),
  createStandup: (payload: {
    yesterday: string;
    today: string;
    blockers?: string | null;
    mood: StandupMood;
  }) =>
    request<{ standup: StandupCheckin }>('/api/standups', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Super Admin Command Center, Complete Audit Logs & Global Broadcasts
  getAdminOverview: () => request<{ overview: AdminOverview }>('/api/admin/overview'),
  getAuditLogs: (params?: { category?: AuditCategory | 'ALL'; severity?: AuditSeverity | 'ALL'; q?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category && params.category !== 'ALL') qs.set('category', params.category);
    if (params?.severity && params.severity !== 'ALL') qs.set('severity', params.severity);
    if (params?.q) qs.set('q', params.q);
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<{ logs: AuditLogEntry[] }>(`/api/admin/audit-logs?${qs.toString()}`);
  },
  getActiveBroadcasts: () => request<{ broadcasts: SystemBroadcast[] }>('/api/broadcasts/active'),
  getAdminBroadcasts: () => request<{ broadcasts: SystemBroadcast[] }>('/api/admin/broadcasts'),
  createBroadcast: (payload: { title: string; message: string; level: BroadcastLevel }) =>
    request<{ broadcast: SystemBroadcast }>('/api/admin/broadcasts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deactivateBroadcast: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/broadcasts/${id}`, {
      method: 'DELETE',
    }),
};


