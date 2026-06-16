import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { env, flags } from "@/lib/env";

export const dynamic = "force-dynamic";

function StatusRow({
  label,
  ok,
  detail,
  warn,
}: {
  label: string;
  ok: boolean;
  detail?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      {warn ? (
        <Badge variant="warning">
          <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Default
        </Badge>
      ) : ok ? (
        <Badge variant="success">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Configured
        </Badge>
      ) : (
        <Badge variant="secondary">
          <XCircle className="mr-1 h-3.5 w-3.5" /> Not set
        </Badge>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Environment and integration status for this internal instance."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>
              Missing integrations fall back to deterministic mocks; the affected
              job records which credentials were missing on completion.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <StatusRow
              label="MongoDB Atlas"
              ok={flags.hasMongo}
              detail={
                flags.hasMongo
                  ? "Durable persistence enabled."
                  : "Using local file datastore (./storage/db). Set MONGODB_URI for durability."
              }
            />
            <StatusRow
              label="OpenAI"
              ok={flags.hasOpenAI}
              detail={`Model: ${env.openaiModel}`}
            />
            <StatusRow
              label="ElevenLabs"
              ok={flags.hasElevenLabs}
              detail="Optional — only used by the ElevenLabs voice option."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatusRow
              label="Storage driver"
              ok
              detail={`Active driver: ${env.storageDriver}`}
            />
            <StatusRow
              label="Vercel Blob token"
              ok={flags.hasBlob}
              detail={
                env.storageDriver === "blob"
                  ? "Required for the blob driver."
                  : "Only required when STORAGE_DRIVER=blob."
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatusRow
              label="Admin password"
              ok={flags.hasAdminPassword}
              warn={!flags.hasAdminPassword}
              detail={
                flags.hasAdminPassword
                  ? "Custom ADMIN_PASSWORD set."
                  : "Using development default. Set ADMIN_PASSWORD in production."
              }
            />
            <StatusRow
              label="Session secret"
              ok={flags.hasAuthSecret}
              warn={!flags.hasAuthSecret}
              detail={
                flags.hasAuthSecret
                  ? "Custom AUTH_SECRET set."
                  : "Using development default. Set AUTH_SECRET in production."
              }
            />
            <StatusRow
              label="Encryption key"
              ok={flags.hasEncryptionKey}
              warn={!flags.hasEncryptionKey}
              detail={
                flags.hasEncryptionKey
                  ? "Custom ENCRYPTION_KEY set (login passwords encrypted at rest)."
                  : "Using development default. Set ENCRYPTION_KEY in production."
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Worker</CardTitle>
            <CardDescription>
              Heavy steps (Playwright, Remotion, FFmpeg) run in the standalone
              worker process.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Poll interval</span>
              <span>{env.workerPollInterval} ms</span>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              Start the worker with{" "}
              <code className="rounded bg-muted px-1 py-0.5">npm run worker</code>
              . It must share the same database as the app.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
