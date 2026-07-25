import { Suspense } from "react";
import { Clapperboard } from "lucide-react";
import { SignupForm } from "@/components/forms/signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Clapperboard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              AutoDemo AI
            </h1>
            <p className="text-sm text-muted-foreground">
              Create a workspace to start generating demo videos.
            </p>
          </div>
        </div>
        <Suspense>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
