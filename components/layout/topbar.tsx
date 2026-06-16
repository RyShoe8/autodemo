"use client";

import { useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useUiStore } from "@/store/ui-store";

export function Topbar({ title }: { title?: string }) {
  const router = useRouter();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  async function logout() {
    try {
      await fetch("/api/auth", { method: "DELETE" });
      toast.success("Signed out");
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out");
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>
        {title && (
          <h1 className="text-sm font-semibold tracking-tight md:text-base">
            {title}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
