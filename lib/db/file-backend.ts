import fs from "node:fs/promises";
import path from "node:path";
import { uid, sleep } from "@/lib/utils";
import type {
  AssetRecord,
  AuditEventRecord,
  ConnectSessionRecord,
  CreateAssetInput,
  CreateAuditEventInput,
  CreateConnectSessionInput,
  CreateJobInput,
  CreateMembershipInput,
  CreateOrgInput,
  CreateProjectInput,
  CreateProjectVideoInput,
  CreateUserInput,
  DbBackend,
  JobRecord,
  MembershipRecord,
  OrgRecord,
  ProjectRecord,
  ProjectVideoRecord,
  UserRecord,
} from "@/lib/db/types";
import { firstStatusForType } from "@/lib/db/types";
import { ACTIVE_JOB_STATUSES, isActiveJobStatus } from "@/lib/workflow/job-status";

const DB_DIR = path.join(process.cwd(), "storage", "db");
const LOCK_FILE = path.join(DB_DIR, ".lock");

type Collection =
  | "projects"
  | "jobs"
  | "assets"
  | "videos"
  | "orgs"
  | "users"
  | "memberships"
  | "audit"
  | "connect_sessions";

async function ensureDir() {
  await fs.mkdir(DB_DIR, { recursive: true });
}

async function readCollection<T>(name: Collection): Promise<T[]> {
  await ensureDir();
  const file = path.join(DB_DIR, `${name}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw, (key, value) => {
      if (
        (key === "createdAt" ||
          key === "updatedAt" ||
          key === "startedAt" ||
          key === "completedAt" ||
          key === "expiresAt" ||
          key === "capturedAt" ||
          key === "storageStateSavedAt") &&
        typeof value === "string"
      ) {
        return new Date(value);
      }
      return value;
    });
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeCollection<T>(name: Collection, rows: T[]): Promise<void> {
  await ensureDir();
  const file = path.join(DB_DIR, `${name}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function acquireLock(): Promise<() => Promise<void>> {
  await ensureDir();
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const handle = await fs.open(LOCK_FILE, "wx");
      await handle.close();
      return async () => {
        try {
          await fs.unlink(LOCK_FILE);
        } catch {
          /* ignore */
        }
      };
    } catch {
      try {
        const stat = await fs.stat(LOCK_FILE);
        if (Date.now() - stat.mtimeMs > 30_000) {
          await fs.unlink(LOCK_FILE).catch(() => {});
        }
      } catch {
        /* ignore */
      }
      await sleep(50);
    }
  }
  return async () => {};
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock();
  try {
    return await fn();
  } finally {
    await release();
  }
}

export class FileBackend implements DbBackend {
  /* ----------------------------- Organizations ---------------------------- */

  async createOrg(input: CreateOrgInput): Promise<OrgRecord> {
    return withLock(async () => {
      const orgs = await readCollection<OrgRecord>("orgs");
      const record: OrgRecord = {
        id: uid("org"),
        name: input.name,
        slug: input.slug,
        wrappedDek: input.wrappedDek,
        kekId: input.kekId,
        dekId: input.dekId,
        createdAt: new Date(),
      };
      orgs.push(record);
      await writeCollection("orgs", orgs);
      return record;
    });
  }

  async getOrg(id: string): Promise<OrgRecord | null> {
    const orgs = await readCollection<OrgRecord>("orgs");
    return orgs.find((o) => o.id === id) ?? null;
  }

  async getOrgBySlug(slug: string): Promise<OrgRecord | null> {
    const orgs = await readCollection<OrgRecord>("orgs");
    return orgs.find((o) => o.slug === slug) ?? null;
  }

  async listOrgs(): Promise<OrgRecord[]> {
    return readCollection<OrgRecord>("orgs");
  }

  async updateOrg(
    id: string,
    patch: Partial<Omit<OrgRecord, "id" | "createdAt">>,
  ): Promise<OrgRecord | null> {
    return withLock(async () => {
      const orgs = await readCollection<OrgRecord>("orgs");
      const idx = orgs.findIndex((o) => o.id === id);
      if (idx === -1) return null;
      orgs[idx] = { ...orgs[idx], ...patch };
      await writeCollection("orgs", orgs);
      return orgs[idx];
    });
  }

  /* --------------------------------- Users -------------------------------- */

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    return withLock(async () => {
      const users = await readCollection<UserRecord>("users");
      const record: UserRecord = {
        id: uid("usr"),
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        name: input.name,
        createdAt: new Date(),
      };
      users.push(record);
      await writeCollection("users", users);
      return record;
    });
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const users = await readCollection<UserRecord>("users");
    return users.find((u) => u.id === id) ?? null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const users = await readCollection<UserRecord>("users");
    const lower = email.toLowerCase();
    return users.find((u) => u.email === lower) ?? null;
  }

  async countUsers(): Promise<number> {
    return (await readCollection<UserRecord>("users")).length;
  }

  /* ------------------------------ Memberships ----------------------------- */

  async createMembership(
    input: CreateMembershipInput,
  ): Promise<MembershipRecord> {
    return withLock(async () => {
      const rows = await readCollection<MembershipRecord>("memberships");
      const record: MembershipRecord = {
        id: uid("mem"),
        orgId: input.orgId,
        userId: input.userId,
        role: input.role,
        createdAt: new Date(),
      };
      rows.push(record);
      await writeCollection("memberships", rows);
      return record;
    });
  }

  async getMembership(
    orgId: string,
    userId: string,
  ): Promise<MembershipRecord | null> {
    const rows = await readCollection<MembershipRecord>("memberships");
    return rows.find((m) => m.orgId === orgId && m.userId === userId) ?? null;
  }

  async listMembershipsByUser(userId: string): Promise<MembershipRecord[]> {
    const rows = await readCollection<MembershipRecord>("memberships");
    return rows.filter((m) => m.userId === userId);
  }

  async listMembershipsByOrg(orgId: string): Promise<MembershipRecord[]> {
    const rows = await readCollection<MembershipRecord>("memberships");
    return rows.filter((m) => m.orgId === orgId);
  }

  async updateMembership(
    id: string,
    patch: Partial<Pick<MembershipRecord, "role">>,
  ): Promise<MembershipRecord | null> {
    return withLock(async () => {
      const rows = await readCollection<MembershipRecord>("memberships");
      const idx = rows.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      rows[idx] = { ...rows[idx], ...patch };
      await writeCollection("memberships", rows);
      return rows[idx];
    });
  }

  async deleteMembership(id: string): Promise<boolean> {
    return withLock(async () => {
      const rows = await readCollection<MembershipRecord>("memberships");
      const next = rows.filter((m) => m.id !== id);
      const changed = next.length !== rows.length;
      if (changed) await writeCollection("memberships", next);
      return changed;
    });
  }

  /* ------------------------------- Audit log ------------------------------ */

  async createAuditEvent(
    input: CreateAuditEventInput,
  ): Promise<AuditEventRecord> {
    return withLock(async () => {
      const rows = await readCollection<AuditEventRecord>("audit");
      const record: AuditEventRecord = {
        id: uid("aud"),
        ...input,
        createdAt: new Date(),
      };
      rows.push(record);
      // Keep the local dev log bounded.
      const trimmed = rows.slice(-5000);
      await writeCollection("audit", trimmed);
      return record;
    });
  }

  async listAuditEvents(
    orgId: string,
    limit = 200,
  ): Promise<AuditEventRecord[]> {
    const rows = await readCollection<AuditEventRecord>("audit");
    return rows
      .filter((e) => e.orgId === orgId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, limit);
  }

  /* --------------------------- Connect sessions --------------------------- */

  async createConnectSession(
    input: CreateConnectSessionInput,
  ): Promise<ConnectSessionRecord> {
    return withLock(async () => {
      const rows = await readCollection<ConnectSessionRecord>("connect_sessions");
      const record: ConnectSessionRecord = {
        id: uid("cs"),
        ...input,
        status: "pending",
        createdAt: new Date(),
      };
      rows.push(record);
      await writeCollection("connect_sessions", rows);
      return record;
    });
  }

  async getConnectSession(id: string): Promise<ConnectSessionRecord | null> {
    const rows = await readCollection<ConnectSessionRecord>("connect_sessions");
    return rows.find((s) => s.id === id) ?? null;
  }

  async getConnectSessionByTokenHash(
    tokenHash: string,
  ): Promise<ConnectSessionRecord | null> {
    const rows = await readCollection<ConnectSessionRecord>("connect_sessions");
    return rows.find((s) => s.tokenHash === tokenHash) ?? null;
  }

  async updateConnectSession(
    id: string,
    patch: Partial<Omit<ConnectSessionRecord, "id" | "orgId" | "createdAt">>,
  ): Promise<ConnectSessionRecord | null> {
    return withLock(async () => {
      const rows = await readCollection<ConnectSessionRecord>("connect_sessions");
      const idx = rows.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      rows[idx] = { ...rows[idx], ...patch };
      await writeCollection("connect_sessions", rows);
      return rows[idx];
    });
  }

  async claimPendingConnectSession(): Promise<ConnectSessionRecord | null> {
    return withLock(async () => {
      const rows = await readCollection<ConnectSessionRecord>("connect_sessions");
      const now = Date.now();
      const idx = rows.findIndex(
        (s) => s.status === "pending" && new Date(s.expiresAt).getTime() > now,
      );
      if (idx === -1) return null;
      rows[idx] = { ...rows[idx], status: "live" };
      await writeCollection("connect_sessions", rows);
      return rows[idx];
    });
  }

  async expireStaleConnectSessions(): Promise<number> {
    return withLock(async () => {
      const rows = await readCollection<ConnectSessionRecord>("connect_sessions");
      const now = Date.now();
      let changed = 0;
      for (let i = 0; i < rows.length; i++) {
        const s = rows[i];
        if (
          (s.status === "pending" || s.status === "live") &&
          new Date(s.expiresAt).getTime() <= now
        ) {
          rows[i] = { ...s, status: "expired" };
          changed++;
        }
      }
      if (changed > 0) await writeCollection("connect_sessions", rows);
      return changed;
    });
  }

  /* -------------------------------- Projects ------------------------------ */

  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    return withLock(async () => {
      const projects = await readCollection<ProjectRecord>("projects");
      const record: ProjectRecord = {
        id: uid("prj"),
        orgId: input.orgId,
        name: input.name,
        url: input.url,
        loginEmail: input.loginEmail,
        encryptedPassword: input.encryptedPassword,
        brandColor: input.brandColor ?? "#38bdf8",
        bumperEnabled: input.bumperEnabled ?? true,
        bumperDurationSeconds: input.bumperDurationSeconds ?? 4,
        bumperTitle: input.bumperTitle ?? input.name,
        bumperTagline: input.bumperTagline,
        status: "draft",
        createdAt: new Date(),
      };
      projects.push(record);
      await writeCollection("projects", projects);
      return record;
    });
  }

  async listProjects(orgId: string): Promise<ProjectRecord[]> {
    const projects = await readCollection<ProjectRecord>("projects");
    return projects
      .filter((p) => p.orgId === orgId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async listProjectsWithoutOrg(): Promise<ProjectRecord[]> {
    const projects = await readCollection<ProjectRecord>("projects");
    return projects.filter((p) => !p.orgId);
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const projects = await readCollection<ProjectRecord>("projects");
    return projects.find((p) => p.id === id) ?? null;
  }

  async updateProject(
    id: string,
    patch: Partial<Omit<ProjectRecord, "id" | "createdAt">>,
  ): Promise<ProjectRecord | null> {
    return withLock(async () => {
      const projects = await readCollection<ProjectRecord>("projects");
      const idx = projects.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      projects[idx] = { ...projects[idx], ...patch };
      await writeCollection("projects", projects);
      return projects[idx];
    });
  }

  async deleteProject(id: string): Promise<boolean> {
    return withLock(async () => {
      const projects = await readCollection<ProjectRecord>("projects");
      const next = projects.filter((p) => p.id !== id);
      const changed = next.length !== projects.length;
      if (changed) await writeCollection("projects", next);
      const jobs = await readCollection<JobRecord>("jobs");
      await writeCollection(
        "jobs",
        jobs.filter((j) => j.projectId !== id),
      );
      const assets = await readCollection<AssetRecord>("assets");
      await writeCollection(
        "assets",
        assets.filter((a) => a.projectId !== id),
      );
      const videos = await readCollection<ProjectVideoRecord>("videos");
      await writeCollection(
        "videos",
        videos.filter((v) => v.projectId !== id),
      );
      return changed;
    });
  }

  async createVideo(input: CreateProjectVideoInput): Promise<ProjectVideoRecord> {
    return withLock(async () => {
      const videos = await readCollection<ProjectVideoRecord>("videos");
      const now = new Date();
      const record: ProjectVideoRecord = {
        id: uid("vid"),
        projectId: input.projectId,
        name: input.name,
        prompt: input.prompt,
        voiceOption: input.voiceOption,
        platforms: input.platforms,
        workflow: input.workflow ?? [],
        status: input.status ?? "draft",
        createdAt: now,
        updatedAt: now,
      };
      videos.push(record);
      await writeCollection("videos", videos);
      return record;
    });
  }

  async listVideosByProject(projectId: string): Promise<ProjectVideoRecord[]> {
    const videos = await readCollection<ProjectVideoRecord>("videos");
    return videos
      .filter((v) => v.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async getVideo(id: string): Promise<ProjectVideoRecord | null> {
    const videos = await readCollection<ProjectVideoRecord>("videos");
    return videos.find((v) => v.id === id) ?? null;
  }

  async updateVideo(
    id: string,
    patch: Partial<Omit<ProjectVideoRecord, "id" | "projectId" | "createdAt">>,
  ): Promise<ProjectVideoRecord | null> {
    return withLock(async () => {
      const videos = await readCollection<ProjectVideoRecord>("videos");
      const idx = videos.findIndex((v) => v.id === id);
      if (idx === -1) return null;
      videos[idx] = { ...videos[idx], ...patch, updatedAt: new Date() };
      await writeCollection("videos", videos);
      return videos[idx];
    });
  }

  async deleteVideo(id: string): Promise<boolean> {
    return withLock(async () => {
      const videos = await readCollection<ProjectVideoRecord>("videos");
      const next = videos.filter((v) => v.id !== id);
      const changed = next.length !== videos.length;
      if (changed) await writeCollection("videos", next);
      const assets = await readCollection<AssetRecord>("assets");
      await writeCollection(
        "assets",
        assets.filter((a) => a.videoId !== id),
      );
      const jobs = await readCollection<JobRecord>("jobs");
      await writeCollection(
        "jobs",
        jobs.filter((j) => j.videoId !== id),
      );
      return changed;
    });
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    return withLock(async () => {
      const jobs = await readCollection<JobRecord>("jobs");
      const record: JobRecord = {
        id: uid("job"),
        projectId: input.projectId,
        videoId: input.videoId,
        type: input.type,
        status: "queued",
        progress: 0,
        logs: [],
        missingCredentials: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jobs.push(record);
      await writeCollection("jobs", jobs);
      return record;
    });
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const jobs = await readCollection<JobRecord>("jobs");
    return jobs.find((j) => j.id === id) ?? null;
  }

  async listJobsByProject(projectId: string): Promise<JobRecord[]> {
    const jobs = await readCollection<JobRecord>("jobs");
    return jobs
      .filter((j) => j.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async listJobsByVideo(videoId: string): Promise<JobRecord[]> {
    const jobs = await readCollection<JobRecord>("jobs");
    return jobs
      .filter((j) => j.videoId === videoId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async getLatestJobByProject(projectId: string): Promise<JobRecord | null> {
    const jobs = await this.listJobsByProject(projectId);
    return jobs[0] ?? null;
  }

  async getLatestJobByVideo(videoId: string): Promise<JobRecord | null> {
    const jobs = await this.listJobsByVideo(videoId);
    return jobs[0] ?? null;
  }

  async updateJob(
    id: string,
    patch: Partial<Omit<JobRecord, "id" | "createdAt" | "projectId">>,
  ): Promise<JobRecord | null> {
    return withLock(async () => {
      const jobs = await readCollection<JobRecord>("jobs");
      const idx = jobs.findIndex((j) => j.id === id);
      if (idx === -1) return null;
      jobs[idx] = { ...jobs[idx], ...patch, updatedAt: new Date() };
      await writeCollection("jobs", jobs);
      return jobs[idx];
    });
  }

  async appendJobLog(id: string, line: string): Promise<void> {
    await withLock(async () => {
      const jobs = await readCollection<JobRecord>("jobs");
      const idx = jobs.findIndex((j) => j.id === id);
      if (idx === -1) return;
      jobs[idx].logs = [...(jobs[idx].logs ?? []), line];
      jobs[idx].updatedAt = new Date();
      await writeCollection("jobs", jobs);
    });
  }

  async claimNextJob(): Promise<JobRecord | null> {
    return withLock(async () => {
      const jobs = await readCollection<JobRecord>("jobs");
      const queued = jobs
        .filter((j) => j.status === "queued")
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      const job = queued[0];
      if (!job) return null;
      job.status = firstStatusForType(job.type);
      job.startedAt = new Date();
      const idx = jobs.findIndex((j) => j.id === job.id);
      jobs[idx] = job;
      await writeCollection("jobs", jobs);
      return job;
    });
  }

  async listInProgressJobs(): Promise<JobRecord[]> {
    const jobs = await readCollection<JobRecord>("jobs");
    return jobs
      .filter((j) => j.status !== "queued" && isActiveJobStatus(j.status))
      .sort(
        (a, b) =>
          new Date(a.updatedAt ?? a.createdAt).getTime() -
          new Date(b.updatedAt ?? b.createdAt).getTime(),
      );
  }

  async createAsset(input: CreateAssetInput): Promise<AssetRecord> {
    return withLock(async () => {
      const assets = await readCollection<AssetRecord>("assets");
      const record: AssetRecord = {
        id: uid("ast"),
        ...input,
        createdAt: new Date(),
      };
      assets.push(record);
      await writeCollection("assets", assets);
      return record;
    });
  }

  async listAssetsByProject(projectId: string): Promise<AssetRecord[]> {
    const assets = await readCollection<AssetRecord>("assets");
    return assets
      .filter((a) => a.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async listAssetsByVideo(videoId: string): Promise<AssetRecord[]> {
    const assets = await readCollection<AssetRecord>("assets");
    return assets
      .filter((a) => a.videoId === videoId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async getAsset(id: string): Promise<AssetRecord | null> {
    const assets = await readCollection<AssetRecord>("assets");
    return assets.find((a) => a.id === id) ?? null;
  }

  async updateAsset(
    id: string,
    patch: Partial<Omit<AssetRecord, "id" | "createdAt">>,
  ): Promise<AssetRecord | null> {
    return withLock(async () => {
      const assets = await readCollection<AssetRecord>("assets");
      const idx = assets.findIndex((a) => a.id === id);
      if (idx === -1) return null;
      assets[idx] = { ...assets[idx], ...patch };
      await writeCollection("assets", assets);
      return assets[idx];
    });
  }

  async deleteAssetsByVideo(videoId: string): Promise<void> {
    await withLock(async () => {
      const assets = await readCollection<AssetRecord>("assets");
      await writeCollection(
        "assets",
        assets.filter((a) => a.videoId !== videoId),
      );
    });
  }
}
