import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PLATFORM_SPECS,
  VOICE_LABELS,
  type ProjectDTO,
} from "@/types";
import { formatDate } from "@/lib/utils";

export function ProjectInfo({ project }: { project: ProjectDTO }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Row label="Application URL">
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-primary hover:underline"
          >
            {project.url}
          </a>
        </Row>
        <Row label="Login email">
          {project.loginEmail || (
            <span className="text-muted-foreground">Not set</span>
          )}
        </Row>
        <Row label="Voice">{VOICE_LABELS[project.voiceOption]}</Row>
        <Row label="Platforms">
          <div className="flex flex-wrap gap-1.5">
            {project.platforms.map((p) => (
              <Badge key={p} variant="secondary">
                {PLATFORM_SPECS[p].label}
              </Badge>
            ))}
          </div>
        </Row>
        <Row label="Created">{formatDate(project.createdAt)}</Row>
        <div className="space-y-1.5">
          <p className="text-muted-foreground">Description</p>
          <p className="whitespace-pre-wrap leading-relaxed">
            {project.prompt}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="sm:max-w-[60%] sm:text-right">{children}</span>
    </div>
  );
}
