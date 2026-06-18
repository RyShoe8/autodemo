"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload } from "lucide-react";
import {
  type Control,
  Controller,
  type FieldErrors,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProjectBumperPanel } from "@/components/projects/project-bumper-panel";

type BrandingFormFields = {
  brandColor?: string;
  bumperEnabled?: boolean;
  bumperDurationSeconds?: number;
  bumperTitle?: string;
  bumperTagline?: string;
};

export function ProjectBrandingFields<T extends BrandingFormFields>({
  control,
  register,
  errors,
  projectId,
  initialLogoUrl,
  initialBumperUrl,
  onLogoChange,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  projectId?: string;
  initialLogoUrl?: string;
  initialBumperUrl?: string;
  onLogoChange?: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [uploading, setUploading] = useState(false);

  async function uploadLogo(file: File) {
    if (!projectId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`/api/projects/${projectId}/logo`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Upload failed");
      }
      const { logoUrl: url } = (await res.json()) as { logoUrl: string };
      setLogoUrl(url);
      onLogoChange?.(url);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload logo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding &amp; intro bumper</CardTitle>
        <CardDescription>
          Generate the bumper once per project. It is prepended to every video
          export when enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex flex-wrap items-center gap-4">
            {logoUrl ? (
              <div className="relative h-14 w-14 overflow-hidden rounded-lg border bg-muted">
                <Image
                  src={logoUrl}
                  alt="Project logo"
                  fill
                  className="object-contain p-1"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                None
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadLogo(file);
                  e.target.value = "";
                }}
              />
              {projectId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload logo
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Upload a logo after creating the project, or rely on favicon
                  discovery.
                </p>
              )}
            </div>
          </div>
        </div>

        <Field label="Bumper title" error={errors.bumperTitle?.message as string | undefined}>
          <Input placeholder="Acme Analytics" {...register("bumperTitle" as Path<T>)} />
        </Field>

        <Field label="Bumper tagline" error={errors.bumperTagline?.message as string | undefined}>
          <Input
            placeholder="Optional subtitle on the intro bumper"
            {...register("bumperTagline" as Path<T>)}
          />
        </Field>

        <Field label="Brand color" error={errors.brandColor?.message as string | undefined}>
          <div className="flex items-center gap-3">
            <Input
              type="color"
              className="h-10 w-14 cursor-pointer p-1"
              {...register("brandColor" as Path<T>)}
            />
            <Input
              placeholder="#38bdf8"
              className="max-w-[140px] font-mono text-sm"
              {...register("brandColor" as Path<T>)}
            />
          </div>
        </Field>

        <Controller
          control={control}
          name={"bumperEnabled" as Path<T>}
          render={({ field }) => (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40">
              <Checkbox
                checked={field.value !== false}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Use bumper on exports</p>
                <p className="text-xs text-muted-foreground">
                  Prepend the generated bumper to every video export.
                </p>
              </div>
            </label>
          )}
        />

        <Field
          label="Bumper duration (seconds)"
          error={errors.bumperDurationSeconds?.message as string | undefined}
        >
          <Controller
            control={control}
            name={"bumperDurationSeconds" as Path<T>}
            render={({ field }) => (
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={2}
                  max={8}
                  step={1}
                  value={Number(field.value ?? 4)}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  className="w-full max-w-xs"
                />
                <span className="w-8 text-sm font-medium tabular-nums">
                  {Number(field.value ?? 4)}s
                </span>
              </div>
            )}
          />
        </Field>

        {projectId && (
          <ProjectBumperPanel
            projectId={projectId}
            initialBumperUrl={initialBumperUrl}
            embedded
          />
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
