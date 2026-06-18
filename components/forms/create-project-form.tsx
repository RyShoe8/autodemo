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
  createProjectSchema,
  type CreateProjectValues,
} from "@/lib/validation/schemas";
import type { ProjectDTO } from "@/types";
import { api } from "@/lib/api-client";
import { ProjectBrandingFields } from "@/components/forms/project-branding-fields";

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
        { ...values, bumperTitle: values.bumperTitle?.trim() || values.name },
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
            Connect AutoDemo to your application. You can create multiple demo
            videos after discovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Project name" error={errors.name?.message}>
            <Input placeholder="Acme Analytics" {...register("name")} />
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
