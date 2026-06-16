import { AlertTriangle } from "lucide-react";

export function MissingCredentials({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div>
        <p className="font-medium text-amber-600 dark:text-amber-400">
          Completed with mock fallbacks
        </p>
        <p className="text-muted-foreground">
          The following were missing, so deterministic placeholders were used
          instead: <span className="font-mono">{items.join(", ")}</span>.
        </p>
      </div>
    </div>
  );
}
