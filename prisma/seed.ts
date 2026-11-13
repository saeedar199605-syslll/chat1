/**
 * Standalone Prisma Seed Script for PostgreSQL Production Deployment
 * Run with: npx tsx prisma/seed.ts
 */
import bcrypt from 'bcryptjs';

async function main() {
  // Dynamically import PrismaClient only when running against PostgreSQL
  const { PrismaClient } = await import('@prisma/client' as string);
  const prisma = new PrismaClient();

  const passwordHash = await bcrypt.hash('Workstream!2026', 10);

  const elena = await prisma.user.upsert({
    where: { email: 'elena.rostova@acme.io' },
    update: {},
    create: {
      email: 'elena.rostova@acme.io',
      passwordHash,
      fullName: 'Elena Rostova',
      displayName: 'Elena Rostova',
      jobTitle: 'VP of Engineering',
      department: 'Executive & Engineering',
      timezone: 'America/Los_Angeles',
      role: 'SUPER_ADMIN',
      presence: 'ONLINE',
      customStatus: 'Q4 architecture reviews',
      customEmoji: '🧭',
    },
  });

  const marcus = await prisma.user.upsert({
    where: { email: 'marcus.vance@acme.io' },
    update: {},
    create: {
      email: 'marcus.vance@acme.io',
      passwordHash,
      fullName: 'Marcus Vance',
      displayName: 'Marcus Vance',
      jobTitle: 'Staff Systems Architect',
      department: 'Core Platform',
      timezone: 'America/New_York',
      role: 'DEPT_MANAGER',
      presence: 'ONLINE',
      managerId: elena.id,
      customStatus: 'Deep work on WebRTC mesh',
      customEmoji: '⚡',
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'acme-global' },
    update: {},
    create: {
      name: 'Acme Global',
      slug: 'acme-global',
      domain: 'acme.io',
      logoText: 'AG',
    },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: elena.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: elena.id, role: 'SUPER_ADMIN' },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: marcus.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: marcus.id, role: 'DEPT_MANAGER' },
  });

  console.log('Seeded PostgreSQL workspace:', workspace.name);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
