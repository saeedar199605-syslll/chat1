export type Role = 'SUPER_ADMIN' | 'DEPT_MANAGER' | 'MEMBER' | 'GUEST';

export type PresenceStatus =
  | 'ONLINE'
  | 'IN_MEETING'
  | 'FOCUS_MODE'
  | 'AWAY'
  | 'OFFLINE';

export type ChannelType =
  | 'PUBLIC'
  | 'PRIVATE'
  | 'ANNOUNCEMENT'
  | 'DM'
  | 'GROUP_DM';

export type MessageType =
  | 'TEXT'
  | 'POLL'
  | 'TASK'
  | 'SYSTEM'
  | 'CALL_SUMMARY';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type NotificationType =
  | 'MENTION'
  | 'THREAD_REPLY'
  | 'REACTION'
  | 'MISSED_CALL'
  | 'TASK_ASSIGNED'
  | 'GROUP_INVITE'
  | 'SYSTEM';

export type GroupAddPolicy = 'DIRECT' | 'REQUEST';

export type UserAccountStatus = 'ACTIVE' | 'SUSPENDED';

export type ApprovalCategory = 'LEAVE' | 'PURCHASE' | 'ACCESS' | 'EXPENSE';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type StandupMood = 'ENERGIZED' | 'FOCUSED' | 'BLOCKED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  displayName: string;
  avatarUrl: string | null;
  jobTitle: string;
  department: string;
  timezone: string;
  role: Role;
  presence: PresenceStatus;
  customStatus: string | null;
  customEmoji: string | null;
  dndEnabled: boolean;
  dndStartHour: number;
  dndEndHour: number;
  managerId: string | null;
  isActive?: boolean;
  groupAddPolicy?: GroupAddPolicy;
  customPermissions?: Record<string, boolean>;
}

export interface GroupJoinRequest {
  id: string;
  channelId: string;
  workspaceId: string;
  inviterId: string;
  inviteeId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  respondedAt: string | null;
  channelName?: string;
  channelDescription?: string | null;
  inviterName?: string;
  inviterAvatarUrl?: string | null;
  memberCount?: number;
}

export interface ApprovalRequest {
  id: string;
  requesterId: string;
  requesterName?: string;
  approverId: string | null;
  approverName?: string | null;
  category: ApprovalCategory;
  title: string;
  details: string;
  metricLabel: string | null;
  status: ApprovalStatus;
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface StandupCheckin {
  id: string;
  userId: string;
  userName?: string;
  userAvatarUrl?: string | null;
  department?: string;
  yesterday: string;
  today: string;
  blockers: string | null;
  mood: StandupMood;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logoText: string;
  logoUrl?: string | null;
  role: Role;
  memberCount: number;
}

export type AuditCategory =
  | 'AUTH'
  | 'SECURITY'
  | 'WORKSPACE'
  | 'USER'
  | 'RBAC'
  | 'CHANNEL'
  | 'MESSAGE'
  | 'TASK'
  | 'WORKFLOW'
  | 'BACKUP'
  | 'SYSTEM';

export type AuditSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string | null;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  detailsJson: string | null;
  createdAt: string;
}

export type BroadcastLevel = 'INFO' | 'WARN' | 'URGENT';

export interface SystemBroadcast {
  id: string;
  title: string;
  message: string;
  level: BroadcastLevel;
  createdById: string;
  createdByName: string;
  isActive: boolean;
  createdAt: string;
}

export interface AdminOverview {
  workspaces: number;
  usersTotal: number;
  usersActive: number;
  usersSuspended: number;
  channelsTotal: number;
  messagesTotal: number;
  tasksOpen: number;
  approvalsPending: number;
  backupSnapshots: number;
  auditLogsTotal: number;
  activeBroadcasts: number;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  topic: string | null;
  type: ChannelType;
  isStarred: boolean;
  isMuted: boolean;
  isArchived?: boolean;
  archivedAt?: string | null;
  unreadCount: number;
  memberCount: number;
  activeCallId: string | null;
  dmPeerUser?: User | null;
}

export interface Attachment {
  id: string;
  messageId: string | null;
  channelId: string;
  uploaderId: string;
  uploaderName?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  url: string;
  createdAt: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface PollOption {
  id: string;
  label: string;
  votes: string[];
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
}

export interface TaskItem {
  id: string;
  channelId: string;
  channelName?: string;
  messageId: string | null;
  creatorId: string;
  creatorName?: string;
  assigneeId: string | null;
  assigneeName?: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
}

export interface MessageEditEntry {
  id: string;
  previousContent: string;
  editedAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  channelName?: string;
  authorId: string;
  author: User;
  parentId: string | null;
  type: MessageType;
  content: string;
  isPinned: boolean;
  isEdited: boolean;
  isBookmarked: boolean;
  isArchived?: boolean;
  archivedAt?: string | null;
  deletedAt: string | null;
  readByUserIds: string[];
  replyCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  reactions: ReactionGroup[];
  poll: Poll | null;
  task: TaskItem | null;
  editHistory?: MessageEditEntry[];
}

export interface WikiDoc {
  id: string;
  channelId: string;
  title: string;
  content: string;
  version: number;
  updatedById: string;
  updatedByName?: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  channelId: string | null;
  messageId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface IosPopupNotification {
  id: string;
  title: string;
  body: string;
  subtitle?: string;
  avatarUrl?: string | null;
  senderName?: string;
  channelId?: string | null;
  inviteId?: string;
  type: NotificationType;
  createdAt: string;
}

export interface BackupSnapshotSummary {
  id: string;
  label: string;
  createdById: string;
  createdByName?: string;
  sha256: string;
  sizeBytes: number;
  counts: Record<string, number>;
  createdAt: string;
}

export interface BackupBundle {
  schemaVersion: string;
  exportedAt: string;
  sha256: string;
  counts: Record<string, number>;
  tables: Record<string, Array<Record<string, unknown>>>;
}

export interface CustomEmoji {
  id: string;
  shortcode: string;
  glyph: string;
}

export interface HuddleParticipant {
  userId: string;
  user: User;
  socketId: string;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenOn: boolean;
  handRaised: boolean;
  isSpeaking?: boolean;
}

export interface AnnotationStroke {
  id: string;
  userId: string;
  userName: string;
  color: string;
  points: Array<{ x: number; y: number }>;
  isLaser?: boolean;
}

export interface SearchResult {
  messages: Array<Message & { channelName: string }>;
  files: Array<Attachment & { channelName: string }>;
  channels: Channel[];
  people: User[];
}
