"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JobProgress } from "@/components/status/job-progress";
import { JobLogs } from "@/components/status/job-logs";
import { useProjectJob } from "@/hooks/use-job";
import { api } from "@/lib/api-client";
import { assetDisplayUrl, assetDownloadUrl } from "@/lib/storage/urls";
import type { ProjectDTO } from "@/types";

export function ProjectBumperPanel({
  projectId,
  initialBumperUrl,
  embedded = false,
  onBeforeGenerate,
}: {
  projectId: string;
  initialBumperUrl?: string;
  /** When true, omit outer Card wrapper (e.g. inside branding form). */
  embedded?: boolean;
  /** Optional branding snapshot to persist before enqueueing render_bumper. */
  onBeforeGenerate?: () => Promise<Record<string, unknown> | void>;
}) {
  const router = useRouter();
  const bumperFileRef = useRef<HTMLInputElement>(null);
  const notifiedJobRef = useRef<string | null>(null);
  const [bumperUrl, setBumperUrl] = useState(initialBumperUrl);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { job, isTerminal } = useProjectJob(projectId);

  const bumperJob =
    job?.type === "render_bumper" ? job : null;
  const isGenerating = starting || (bumperJob !== null && !isTerminal);

  useEffect(() => {
    setBumperUrl(initialBumperUrl);
    if (initialBumperUrl) {
      setPreviewVersion(Date.now());
    }
  }, [initialBumperUrl]);

  useEffect(() => {
    if (!bumperJob || !isTerminal) return;
    if (notifiedJobRef.current === bumperJob.id) return;
    notifiedJobRef.current = bumperJob.id;
    setStarting(false);

    if (bumperJob.status === "completed") {
      toast.success("Bumper ready");
      void (async () => {
        try {
          const { project } = await api.get<{ project: ProjectDTO }>(
            `/api/projects/${projectId}`,
          );
          setBumperUrl(project.bumperUrl);
          setPreviewVersion(Date.now());
        } catch {
          /* refresh will still load server data */
        }
        router.refresh();
      })();
    } else if (bumperJob.status === "failed") {
      toast.error("Bumper generation failed");
    }
  }, [bumperJob, isTerminal, projectId, router]);

  async function generateBumper() {
    setStarting(true);
    setPreviewVersion(Date.now());
    try {
      const branding = onBeforeGenerate ? await onBeforeGenerate() : undefined;
      await api.post("/api/generate", {
        projectId,
        type: "render_bumper",
        ...(branding ?? {}),
      });
      toast.success("Bumper generation started");
      router.refresh();
    } catch (err) {
      setStarting(false);
      toast.error(
        err instanceof Error ? err.message : "Could not start bumper job",
      );
    }
  }

  async function uploadBumper(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("bumper", file);
      const res = await fetch(`/api/projects/${projectId}/bumper`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Upload failed");
      }
      const { bumperUrl: url } = (await res.json()) as { bumperUrl: string };
      setBumperUrl(url);
      setPreviewVersion(Date.now());
      toast.success("Bumper uploaded");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not upload bumper",
      );
    } finally {
      setUploading(false);
    }
  }

  const displayUrl = bumperUrl ? assetDisplayUrl(bumperUrl) : undefined;
  const previewSrc = displayUrl
    ? `${displayUrl}${displayUrl.includes("?") ? "&" : "?"}v=${previewVersion}`
    : undefined;

  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isGenerating || uploading}
          onClick={() => void generateBumper()}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate bumper
        </Button>
        <input
          ref={bumperFileRef}
          type="file"
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadBumper(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isGenerating || uploading}
          onClick={() => bumperFileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload bumper
        </Button>
        {bumperUrl && (
          <Button asChild size="sm" variant="outline">
            <a href={assetDownloadUrl(bumperUrl, "bumper.mp4")}>
              <Download className="h-4 w-4" /> Download
            </a>
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {bumperUrl
          ? "Preview below. Re-generate or upload after changing logo or colors."
          : "Generate a branded intro or upload an MP4/WebM file (max 100 MB)."}
      </p>

      {previewSrc && (
        <video
          key={previewSrc}
          src={previewSrc}
          controls
          className="aspect-video w-full rounded-lg border bg-black"
        />
      )}

      {bumperJob && !isTerminal && (
        <>
          <JobProgress job={bumperJob} />
          <JobLogs logs={bumperJob.logs} />
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-lg border p-3">
        <p className="mb-3 text-sm font-medium">Project bumper</p>
        {content}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project bumper</CardTitle>
        <CardDescription>
          Intro clip prepended to every video export when bumper is enabled.
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
