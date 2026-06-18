"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Lock, Save, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { WorkflowStep } from "@/types";

function SortableRow({
  step,
  index,
  onToggle,
  onRename,
  onUpdateField,
}: {
  step: WorkflowStep;
  index: number;
  onToggle: (id: string, enabled: boolean) => void;
  onRename: (id: string, title: string) => void;
  onUpdateField: (
    id: string,
    field: "url" | "selector" | "value",
    value: string,
  ) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-card p-3"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <Input
          value={step.title}
          onChange={(e) => onRename(step.id, e.target.value)}
          className="h-8 font-medium"
        />
        {step.description && (
          <p className="truncate pl-1 text-xs text-muted-foreground">
            {step.description}
          </p>
        )}
        <div className="grid gap-1.5 pt-1 sm:grid-cols-2">
          <Input
            value={step.url ?? ""}
            onChange={(e) => onUpdateField(step.id, "url", e.target.value)}
            placeholder="URL (optional)"
            className="h-7 text-xs"
          />
          <Input
            value={step.selector ?? ""}
            onChange={(e) =>
              onUpdateField(step.id, "selector", e.target.value)
            }
            placeholder="CSS selector (optional)"
            className="h-7 text-xs"
          />
        </div>
      </div>
      <Badge variant="outline" className="hidden capitalize sm:inline-flex">
        {step.actionType}
      </Badge>
      <div className="flex items-center gap-2">
        <Switch
          checked={step.enabled}
          onCheckedChange={(v) => onToggle(step.id, v)}
          aria-label="Enable step"
        />
      </div>
    </div>
  );
}

export function WorkflowEditor({
  projectId,
  videoId,
  initialWorkflow,
  bumperEnabled = false,
}: {
  projectId: string;
  videoId: string;
  initialWorkflow: WorkflowStep[];
  bumperEnabled?: boolean;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<WorkflowStep[]>(
    [...initialWorkflow].sort((a, b) => a.order - b.order),
  );
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const enabledCount = useMemo(
    () => steps.filter((s) => s.enabled).length,
    [steps],
  );

  function withOrder(list: WorkflowStep[]): WorkflowStep[] {
    return list.map((s, i) => ({ ...s, order: i }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return withOrder(arrayMove(prev, oldIndex, newIndex));
    });
  }

  function toggle(id: string, enabled: boolean) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }

  function rename(id: string, title: string) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  function updateField(
    id: string,
    field: "url" | "selector" | "value",
    value: string,
  ) {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, [field]: value || undefined } : s,
      ),
    );
  }

  async function save() {
    setSaving(true);
    try {
      await api.put("/api/workflows", { videoId, workflow: withOrder(steps) });
      toast.success("Workflow saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    setApproving(true);
    try {
      await api.post("/api/workflows", {
        videoId,
        action: "approve",
        workflow: withOrder(steps),
      });
      toast.success("Workflow approved — recording started");
      router.push(`/projects/${projectId}/videos/${videoId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
      setApproving(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      await api.post("/api/workflows", { videoId, action: "regenerate" });
      toast.success("Regenerating workflow…");
      router.push(`/projects/${projectId}/videos/${videoId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not regenerate");
      setRegenerating(false);
    }
  }

  if (steps.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-10">
          <p className="text-sm text-muted-foreground">
            No workflow has been generated yet. Run discovery from the project
            page to propose a workflow.
          </p>
          <Button variant="outline" onClick={regenerate} disabled={regenerating}>
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Run discovery
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Drag to reorder, toggle to enable/disable, and click a title to rename.
          <span className="ml-2 font-medium text-foreground">
            {enabledCount}/{steps.length} enabled
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
          <Button
            variant="outline"
            onClick={regenerate}
            disabled={regenerating}
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Regenerate
          </Button>
          <Button onClick={approve} disabled={approving || enabledCount === 0}>
            {approving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Approve &amp; start recording
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={steps.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {bumperEnabled && (
              <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/40 p-3">
                <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs">
                  1
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Intro bumper</p>
                  <p className="text-xs text-muted-foreground">
                    Branded opener — rendered in Remotion only, not recorded by
                    Playwright.
                  </p>
                </div>
                <Badge variant="secondary">Remotion</Badge>
              </div>
            )}
            {steps.map((step, index) => (
              <SortableRow
                key={step.id}
                step={step}
                index={bumperEnabled ? index + 1 : index}
                onToggle={toggle}
                onRename={rename}
                onUpdateField={updateField}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
