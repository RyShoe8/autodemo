"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createProjectVideoSchema,
  type CreateProjectVideoValues,
} from "@/lib/validation/schemas";
import {
  PLATFORM_SPECS,
  VOICE_LABELS,
  type Platform,
  type ProjectVideoDTO,
  type VoiceOption,
} from "@/types";
import { api } from "@/lib/api-client";

const PLATFORMS: Platform[] = [
  "youtube",
  "linkedin",
  "x",
  "bluesky",
  "tiktok",
  "instagram",
];
const VOICES: VoiceOption[] = [
  "openai_tts",
  "browser_speech",
  "elevenlabs",
  "no_audio",
];

export function CreateVideoForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateProjectVideoValues>({
    resolver: zodResolver(createProjectVideoSchema),
    defaultValues: {
      name: "",
      prompt: "",
      platforms: ["youtube"],
      voiceOption: "openai_tts",
    },
  });

  async function onSubmit(values: CreateProjectVideoValues) {
    setSubmitting(true);
    try {
      const { video } = await api.post<{ video: ProjectVideoDTO }>(
        `/api/projects/${projectId}/videos`,
        values,
      );
      toast.success("Video created — building workflow");
      router.push(`/projects/${projectId}/videos/${video.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create video");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New demo video</CardTitle>
          <CardDescription>
            Each video has its own prompt, workflow, and platform exports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Video name" error={errors.name?.message}>
            <Input placeholder="Onboarding walkthrough" {...register("name")} />
          </Field>

          <Field label="What should this video demonstrate?" error={errors.prompt?.message}>
            <Textarea
              rows={5}
              placeholder="Show how a new user creates their first project and invites a teammate."
              {...register("prompt")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target platforms</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="platforms"
            render={({ field }) => (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PLATFORMS.map((platform) => {
                  const spec = PLATFORM_SPECS[platform];
                  const checked = field.value?.includes(platform);
                  return (
                    <label
                      key={platform}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          const set = new Set(field.value ?? []);
                          if (value) set.add(platform);
                          else set.delete(platform);
                          field.onChange(Array.from(set));
                        }}
                      />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{spec.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {spec.width}×{spec.height}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voice</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="voiceOption"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="grid gap-3 sm:grid-cols-2"
              >
                {VOICES.map((voice) => (
                  <label
                    key={voice}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-accent/40"
                  >
                    <RadioGroupItem value={voice} />
                    <span className="text-sm font-medium">
                      {VOICE_LABELS[voice]}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create video
        </Button>
      </div>
    </form>
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
