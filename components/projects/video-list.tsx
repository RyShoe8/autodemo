"use client";

import Link from "next/link";
import { Film, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VideoStatusBadge } from "@/components/status/status-badge";
import { DeleteVideoButton } from "@/components/projects/delete-video-button";
import type { ProjectVideoDTO } from "@/types";

export function VideoList({
  projectId,
  videos,
  canCreate,
}: {
  projectId: string;
  videos: ProjectVideoDTO[];
  canCreate: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Demo videos</CardTitle>
          <CardDescription>
            Each video has its own workflow and exports. The project bumper is
            shared across all videos.
          </CardDescription>
        </div>
        {canCreate && (
          <Button asChild size="sm">
            <Link href={`/projects/${projectId}/videos/new`}>
              <Plus className="h-4 w-4" /> New video
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canCreate
              ? "No videos yet. Run discovery, then create your first demo video."
              : "Run discovery on this project before creating videos."}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {videos.map((video) => (
              <li key={video.id} className="flex items-center gap-2">
                <Link
                  href={`/projects/${projectId}/videos/${video.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4 hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{video.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {video.platforms.length} platform
                      {video.platforms.length === 1 ? "" : "s"} ·{" "}
                      {video.workflow.length} steps
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <VideoStatusBadge status={video.status} />
                    <Film className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <div className="pr-2">
                  <DeleteVideoButton
                    projectId={projectId}
                    videoId={video.id}
                    videoName={video.name}
                    videoStatus={video.status}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
