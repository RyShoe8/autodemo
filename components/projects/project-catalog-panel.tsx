"use client";

import Image from "next/image";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApplicationMap } from "@/types";

export function ProjectCatalogPanel({
  applicationMap,
}: {
  applicationMap?: ApplicationMap;
}) {
  if (!applicationMap || !applicationMap.pages || applicationMap.pages.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discovered Catalog</CardTitle>
        <CardDescription>
          A full catalog of screenshots for pages, modals, and popups discovered in this project.
          Use these in your marketing materials and onboarding guides.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {applicationMap.pages.map((page, idx) => (
          <div key={idx} className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">{page.title || "Untitled Page"}</h3>
              <p className="text-sm text-muted-foreground break-all">{page.url}</p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {/* Base Page Screenshot */}
              {page.screenshot && (
                <div className="space-y-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="relative w-full aspect-video overflow-hidden rounded-md border bg-muted hover:opacity-90 transition-opacity">
                        <Image
                          src={page.screenshot}
                          alt={`Base screenshot for ${page.title}`}
                          fill
                          className="object-cover object-top"
                        />
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none">
                      <DialogTitle className="sr-only">{page.title} base screenshot</DialogTitle>
                      <DialogDescription className="sr-only">Full view of the base page screenshot</DialogDescription>
                      <div className="relative w-full max-h-[85vh] aspect-auto overflow-auto rounded-md bg-background">
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={page.screenshot} alt={`Base screenshot for ${page.title}`} className="w-full h-auto" />
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs font-medium text-center">Full Page</p>
                </div>
              )}

              {/* Action Screenshots (Modals/Popups) */}
              {page.actionScreenshots?.map((action, aIdx) => (
                <div key={aIdx} className="space-y-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="relative w-full aspect-video overflow-hidden rounded-md border bg-muted hover:opacity-90 transition-opacity">
                        <Image
                          src={action.screenshot}
                          alt={`Action: ${action.triggerText}`}
                          fill
                          className="object-cover object-top"
                        />
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none">
                      <DialogTitle className="sr-only">Action: {action.triggerText}</DialogTitle>
                      <DialogDescription className="sr-only">Full view of the action screenshot</DialogDescription>
                      <div className="relative w-full max-h-[85vh] aspect-auto overflow-auto rounded-md bg-background">
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={action.screenshot} alt={`Action: ${action.triggerText}`} className="w-full h-auto" />
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs font-medium text-center truncate px-1" title={action.triggerText}>
                    Trigger: {action.triggerText}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
