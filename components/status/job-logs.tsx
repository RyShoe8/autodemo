"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function JobLogs({ logs }: { logs: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No logs yet.</p>
    );
  }

  return (
    <ScrollArea className="h-64 rounded-md border bg-muted/30">
      <div className="space-y-1 p-3 font-mono text-xs">
        {logs.map((line, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-words",
              line.startsWith("MISSING:") || line.toLowerCase().includes("error")
                ? "text-amber-500"
                : "text-muted-foreground",
            )}
          >
            {line}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
