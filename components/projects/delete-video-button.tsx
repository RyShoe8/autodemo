"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import type { VideoStatus } from "@/types";

const BUSY_STATUSES: VideoStatus[] = [
  "building_workflow",
  "recording",
  "rendering",
];

export function DeleteVideoButton({
  projectId,
  videoId,
  videoName,
  videoStatus,
  compact = false,
}: {
  projectId: string;
  videoId: string;
  videoName: string;
  videoStatus?: VideoStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const disabledByStatus =
    videoStatus !== undefined && BUSY_STATUSES.includes(videoStatus);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.del(`/api/projects/${projectId}/videos/${videoId}`);
      toast.success(`Deleted "${videoName}"`);
      setOpen(false);
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete video");
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "destructive"}
        size={compact ? "icon" : "default"}
        disabled={disabledByStatus}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Delete ${videoName}`}
      >
        <Trash2 className="h-4 w-4" />
        {!compact && "Delete"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete video</DialogTitle>
            <DialogDescription>
              This permanently removes &quot;{videoName}&quot;, its workflow, and
              platform exports. The project bumper is not affected. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
