import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Esfahan Chalak Enterprise Communication API',
    version: '1.1.0',
    description:
      'REST + Real-Time Signaling API for Esfahan Chalak Co. (اصفهان چالاک): Multi-tenant Workspaces, Granular 12x4 RBAC Governance, Channels, Threaded Messaging, Polls, Manager Task Delegation, Approvals, Daily Standups, Collaborative Wikis, Presigned File Uploads, Global Search, SHA-256 Backup & Restore, and WebRTC Huddles.',
  },
  servers: [{ url: '/api', description: 'Esfahan Chalak API Gateway' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'JWT authentication, registration, refresh tokens & RBAC demo switching' },
    { name: 'Workspaces', description: 'Multi-tenant organization switching, RBAC governance, and SHA-256 backups' },
    { name: 'Users & Governance', description: 'User provisioning, suspension, password reset, custom permissions, and self-service profile' },
    { name: 'Channels', description: 'Public, private, announcement, and direct message channels' },
    { name: 'Messages', description: 'Real-time messages, threads, reactions, pins, bookmarks, and read receipts' },
    { name: 'Collaboration', description: 'Inline polls, assignable tasks, approvals, daily standups, and live channel wikis' },
    { name: 'Files', description: 'Presigned S3-compatible uploads, previews, and channel repositories' },
    { name: 'Search & Directory', description: 'Omnibox search with operators and organizational hierarchy' },
    { name: 'Notifications', description: 'Smart notification center and iOS popup banners' },
  ],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate with email & password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'elena.rostova@acme.io' },
                  password: { type: 'string', example: 'Workstream!2026' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Access & Refresh JWT tokens with user profile' } },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new enterprise member account',
        responses: { 201: { description: 'User created and joined to default workspace' } },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate JWT access token using refresh token',
        responses: { 200: { description: 'New access token issued' } },
      },
    },
    '/auth/demo-switch': {
      post: {
        tags: ['Auth'],
        summary: 'Switch active demo persona to test RBAC permissions',
        responses: { 200: { description: 'Switched session tokens returned' } },
      },
    },
    '/rbac/matrix': {
      get: {
        tags: ['Users & Governance'],
        summary: 'Fetch workspace 12x4 RBAC role permission matrix',
        responses: { 200: { description: 'Role permission matrix' } },
      },
      put: {
        tags: ['Users & Governance'],
        summary: 'Update role permission matrix (Super Admin only)',
        responses: { 200: { description: 'Updated RBAC matrix' } },
      },
    },
    '/users/admin': {
      post: {
        tags: ['Users & Governance'],
        summary: 'Create a new corporate user account with role, department, manager, and permissions',
        responses: { 201: { description: 'User created' } },
      },
    },
    '/users/admin/{userId}': {
      patch: {
        tags: ['Users & Governance'],
        summary: 'Update user role, suspension status, custom permissions, or reset password',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated user profile' } },
      },
    },
    '/users/me/profile': {
      patch: {
        tags: ['Users & Governance'],
        summary: 'Self-service update for displayName, jobTitle, timezone, and optional password',
        responses: { 200: { description: 'Updated current user' } },
      },
    },
    '/workspaces': {
      get: {
        tags: ['Workspaces'],
        summary: 'List workspaces the authenticated user belongs to',
        responses: { 200: { description: 'Array of workspaces with role & member counts' } },
      },
      post: {
        tags: ['Workspaces'],
        summary: 'Create a new organization workspace',
        responses: { 201: { description: 'Workspace created' } },
      },
    },
    '/workspaces/{workspaceId}/channels': {
      get: {
        tags: ['Channels'],
        summary: 'List accessible channels & DMs in workspace',
        parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Channel tree with unread counts' } },
      },
      post: {
        tags: ['Channels'],
        summary: 'Create public, private, or announcement channel',
        parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Channel created' } },
      },
    },
    '/channels/{channelId}/messages': {
      get: {
        tags: ['Messages'],
        summary: 'Fetch paginated channel messages with reactions, polls, tasks & attachments',
        parameters: [{ name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Ordered message feed' } },
      },
      post: {
        tags: ['Messages'],
        summary: 'Post message, slash command (/poll, /task, /meet), or threaded reply',
        parameters: [{ name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Persisted message broadcast over Socket.io' } },
      },
    },
    '/messages/{id}/reactions': {
      post: {
        tags: ['Messages'],
        summary: 'Toggle emoji reaction on a message',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated reaction groups' } },
      },
    },
    '/polls/{pollId}/vote': {
      post: {
        tags: ['Collaboration'],
        summary: 'Cast or update vote on an inline channel poll',
        parameters: [{ name: 'pollId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated poll tallies' } },
      },
    },
    '/channels/{channelId}/tasks': {
      get: {
        tags: ['Collaboration'],
        summary: 'List action items / tasks for channel',
        parameters: [{ name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Channel tasks' } },
      },
      post: {
        tags: ['Collaboration'],
        summary: 'Create task directly or convert a chat message into an action item',
        parameters: [{ name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Task created' } },
      },
    },
    '/approvals': {
      get: {
        tags: ['Collaboration'],
        summary: 'List enterprise leave, purchase, access, and deployment approval requests',
        responses: { 200: { description: 'Approval requests list' } },
      },
      post: {
        tags: ['Collaboration'],
        summary: 'Submit a new approval request assigned to an approver',
        responses: { 201: { description: 'Approval request created' } },
      },
    },
    '/approvals/{id}/review': {
      patch: {
        tags: ['Collaboration'],
        summary: 'Approve or reject an approval request with optional comment',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Reviewed approval request' } },
      },
    },
    '/standups': {
      get: {
        tags: ['Collaboration'],
        summary: 'List daily asynchronous team standup check-ins',
        responses: { 200: { description: 'Standup reports list' } },
      },
      post: {
        tags: ['Collaboration'],
        summary: 'Submit daily standup check-in (yesterday, today, blockers, mood)',
        responses: { 201: { description: 'Standup submitted' } },
      },
    },
    '/channels/{channelId}/wiki': {
      get: {
        tags: ['Collaboration'],
        summary: 'Fetch channel collaborative live wiki document',
        parameters: [{ name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Wiki document state' } },
      },
      put: {
        tags: ['Collaboration'],
        summary: 'Update channel collaborative wiki with version increment',
        parameters: [{ name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated wiki document' } },
      },
    },
    '/uploads/presign': {
      post: {
        tags: ['Files'],
        summary: 'Generate an S3-compatible presigned upload URL and storage key',
        responses: { 200: { description: 'Presigned URL & attachment metadata' } },
      },
    },
    '/search': {
      get: {
        tags: ['Search & Directory'],
        summary: 'Omnibox fuzzy search across messages, files, channels & people with filters',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', example: 'in:#engineering-core has:file' } },
          { name: 'workspaceId', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Grouped search hits' } },
      },
    },
    '/directory': {
      get: {
        tags: ['Search & Directory'],
        summary: 'Retrieve organizational employee directory and manager hierarchy',
        responses: { 200: { description: 'Directory users list' } },
      },
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Fetch user smart notifications (mentions, replies, missed calls)',
        responses: { 200: { description: 'Notifications list' } },
      },
    },
    '/notifications/test': {
      post: {
        tags: ['Notifications'],
        summary: 'Trigger a live iOS popup notification event for the current user',
        responses: { 201: { description: 'Notification persisted and emitted via Socket.io' } },
      },
    },
    '/tasks': {
      get: {
        tags: ['Collaboration'],
        summary: 'List all workspace tasks with priority, status, assignee & channel filters',
        responses: { 200: { description: 'Tasks list' } },
      },
    },
    '/directory/{userId}': {
      patch: {
        tags: ['Search & Directory'],
        summary: 'Update employee title, department, role, or reporting manager (cycle-checked)',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated employee profile' } },
      },
    },
    '/archive': {
      get: {
        tags: ['Channels'],
        summary: 'Retrieve archived channels, archived messages, and completed tasks',
        responses: { 200: { description: 'Archive collections' } },
      },
    },
    '/backup/snapshots': {
      get: {
        tags: ['Workspaces'],
        summary: 'List SHA-256 verified backup snapshots and live table counts',
        responses: { 200: { description: 'Snapshots and live counts' } },
      },
      post: {
        tags: ['Workspaces'],
        summary: 'Create a full relational JSON snapshot with SHA-256 verification digest',
        responses: { 201: { description: 'Created snapshot metadata' } },
      },
    },
    '/backup/restore': {
      post: {
        tags: ['Workspaces'],
        summary: 'Transactionally restore workspace data from a verified snapshot or JSON bundle',
        responses: { 200: { description: 'Database restored' } },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Esfahan Chalak API Documentation',
  }));
}
