import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProjectDTO } from "@/types";
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
        <Row label="Bumper">
          {!project.bumperEnabled ? (
            <span className="text-muted-foreground">Disabled</span>
          ) : project.bumperUrl ? (
            <span>Ready</span>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </Row>
        <Row label="Created">{formatDate(project.createdAt)}</Row>
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
