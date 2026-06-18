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
  createProjectSchema,
  type CreateProjectValues,
} from "@/lib/validation/schemas";
import { PLATFORM_SPECS, VOICE_LABELS, type Platform, type VoiceOption } from "@/types";
import type { ProjectDTO } from "@/types";
import { api } from "@/lib/api-client";
import { ProjectBrandingFields } from "@/components/forms/project-branding-fields";

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

export function CreateProjectForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      url: "",
      loginEmail: "",
      loginPassword: "",
      prompt: "",
      platforms: ["youtube"],
      voiceOption: "openai_tts",
      brandColor: "#38bdf8",
      bumperEnabled: true,
      bumperDurationSeconds: 4,
    },
  });

  async function onSubmit(values: CreateProjectValues) {
    setSubmitting(true);
    try {
      const { project } = await api.post<{ project: ProjectDTO }>(
        "/api/projects",
        values,
      );
      toast.success("Project created");
      router.push(`/projects/${project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>
            Tell AutoDemo where to log in and what to demonstrate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Project name" error={errors.name?.message}>
            <Input placeholder="Acme Analytics Demo" {...register("name")} />
          </Field>

          <Field label="Application URL" error={errors.url?.message}>
            <Input
              placeholder="https://app.example.com"
              {...register("url")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Login email" error={errors.loginEmail?.message}>
              <Input
                type="email"
                placeholder="demo@example.com"
                autoComplete="off"
                {...register("loginEmail")}
              />
            </Field>
            <Field label="Login password" error={errors.loginPassword?.message}>
              <Input
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                {...register("loginPassword")}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Credentials are encrypted at rest and only decrypted by the worker to
            sign in to the target app.
          </p>

          <Field
            label="Video description"
            error={errors.prompt?.message}
          >
            <Textarea
              rows={5}
              placeholder="Demonstrate how a new user signs up, creates their first dashboard, and invites a teammate."
              {...register("prompt")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target platforms</CardTitle>
          <CardDescription>
            Generate a tailored export for each selected platform.
          </CardDescription>
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
                          {spec.width}×{spec.height} · {spec.minSeconds}-
                          {spec.maxSeconds}s
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          />
          {errors.platforms && (
            <p className="mt-2 text-xs text-destructive">
              {errors.platforms.message as string}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voice</CardTitle>
          <CardDescription>
            How narration audio should be generated.
          </CardDescription>
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
                      {voice === "openai_tts" && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          default
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
        </CardContent>
      </Card>

      <ProjectBrandingFields control={control} register={register} errors={errors} />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create project
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
