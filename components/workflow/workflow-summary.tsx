import Link from "next/link";
import { ListChecks, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WorkflowStep } from "@/types";

export function WorkflowSummary({
  projectId,
  workflow,
}: {
  projectId: string;
  workflow: WorkflowStep[];
}) {
  const sorted = [...workflow].sort((a, b) => a.order - b.order);
  const enabled = sorted.filter((s) => s.enabled).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Workflow</CardTitle>
        {workflow.length > 0 && (
          <Badge variant="secondary">
            {enabled}/{workflow.length} enabled
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {workflow.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workflow yet. Run discovery to generate a proposed sequence.
          </p>
        ) : (
          <ol className="space-y-2">
            {sorted.slice(0, 6).map((step, i) => (
              <li
                key={step.id}
                className="flex items-start gap-3 text-sm"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs">
                  {i + 1}
                </span>
                <span
                  className={
                    step.enabled ? "" : "text-muted-foreground line-through"
                  }
                >
                  {step.title}
                </span>
              </li>
            ))}
            {sorted.length > 6 && (
              <li className="pl-8 text-xs text-muted-foreground">
                +{sorted.length - 6} more steps
              </li>
            )}
          </ol>
        )}

        {workflow.length > 0 && (
          <Button asChild variant="outline" className="w-full">
            <Link href={`/projects/${projectId}/workflow`}>
              <ListChecks className="h-4 w-4" /> Open workflow editor
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
