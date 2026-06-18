import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  JOB_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  VIDEO_STATUS_LABELS,
  type JobStatus,
  type ProjectStatus,
  type VideoStatus,
} from "@/types";
import { cn } from "@/lib/utils";

type Variant = NonNullable<BadgeProps["variant"]>;

const PROJECT_VARIANT: Record<ProjectStatus, Variant> = {
  draft: "secondary",
  discovering: "info",
  ready: "success",
  failed: "destructive",
  awaiting_approval: "warning",
  recording: "info",
  rendering: "info",
  completed: "success",
};

const VIDEO_VARIANT: Record<VideoStatus, Variant> = {
  draft: "secondary",
  building_workflow: "info",
  awaiting_approval: "warning",
  recording: "info",
  rendering: "info",
  completed: "success",
  failed: "destructive",
};

const JOB_VARIANT: Record<JobStatus, Variant> = {
  queued: "secondary",
  discovering: "info",
  building_workflow: "info",
  awaiting_approval: "warning",
  recording: "info",
  generating_script: "info",
  generating_audio: "info",
  rendering: "info",
  exporting: "info",
  completed: "success",
  failed: "destructive",
};

const PULSING: string[] = [
  "discovering",
  "building_workflow",
  "recording",
  "rendering",
  "generating_script",
  "generating_audio",
  "exporting",
];

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant={PROJECT_VARIANT[status]} className="capitalize">
      <span
        className={cn(
          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current",
          PULSING.includes(status) && "animate-pulse",
        )}
      />
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  return (
    <Badge variant={VIDEO_VARIANT[status]} className="capitalize">
      <span
        className={cn(
          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current",
          PULSING.includes(status) && "animate-pulse",
        )}
      />
      {VIDEO_STATUS_LABELS[status]}
    </Badge>
  );
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge variant={JOB_VARIANT[status]}>
      <span
        className={cn(
          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current",
          PULSING.includes(status) && "animate-pulse",
        )}
      />
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}
