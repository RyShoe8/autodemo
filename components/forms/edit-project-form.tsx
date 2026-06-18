"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  updateProjectSchema,
  type UpdateProjectValues,
} from "@/lib/validation/schemas";
import type { ProjectDTO } from "@/types";
import { api } from "@/lib/api-client";
import { ProjectBrandingFields } from "@/components/forms/project-branding-fields";

export function EditProjectForm({ project }: { project: ProjectDTO }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<UpdateProjectValues>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      name: project.name,
      url: project.url,
      loginEmail: project.loginEmail,
      loginPassword: "",
      brandColor: project.brandColor,
      bumperEnabled: project.bumperEnabled,
      bumperDurationSeconds: project.bumperDurationSeconds,
      bumperTitle: project.bumperTitle,
      bumperTagline: project.bumperTagline ?? "",
    },
  });

  async function onSubmit(values: UpdateProjectValues) {
    setSubmitting(true);
    try {
      const payload = { ...values };
      if (!payload.loginPassword) {
        delete payload.loginPassword;
      }
      await api.patch<{ project: ProjectDTO }>(
        `/api/projects/${project.id}`,
        payload,
      );
      toast.success("Project updated");
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update project");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>
            Update login credentials and shared project settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Project name" error={errors.name?.message}>
            <Input placeholder="Acme Analytics Demo" {...register("name")} />
          </Field>

          <Field label="Application URL" error={errors.url?.message}>
            <Input placeholder="https://app.example.com" {...register("url")} />
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
                placeholder="Leave blank to keep current"
                autoComplete="new-password"
                {...register("loginPassword")}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Changing the URL or credentials clears the discovery map — re-run
            discovery after saving.
          </p>
        </CardContent>
      </Card>

      <ProjectBrandingFields
        control={control}
        register={register}
        errors={errors}
        projectId={project.id}
        initialLogoUrl={project.logoUrl}
        initialBumperUrl={project.bumperUrl}
      />

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
          Save changes
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
