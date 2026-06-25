"use client";

import { useState, useMemo } from "react";
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { assetDisplayUrl } from "@/lib/storage/urls";
import type { DiscoveredPage } from "@/types";

interface SitemapClientProps {
  pages: DiscoveredPage[];
  edges: { from: string; to: string; label: string }[];
}

export function SitemapClient({ pages, edges }: SitemapClientProps) {
  const [selectedPage, setSelectedPage] = useState<DiscoveredPage | null>(null);

  const initialNodes = useMemo(() => {
    return pages.map((page, i) => {
      const x = (i % 4) * 350;
      const y = Math.floor(i / 4) * 250;
      return {
        id: page.url,
        position: { x, y },
        data: {
          label: (
            <div className="flex flex-col items-center p-2 cursor-pointer max-w-[200px]">
              <div className="text-sm font-semibold text-center truncate w-full" title={page.title}>{page.title}</div>
              <div className="text-xs text-muted-foreground truncate w-full" title={page.url}>{new URL(page.url).pathname}</div>
              <div className="mt-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                {page.actionScreenshots?.length || 0} Modals
              </div>
            </div>
          )
        },
        style: { border: '1px solid #ccc', borderRadius: '8px', background: 'var(--background)' }
      };
    });
  }, [pages]);

  const initialEdges = useMemo(() => {
    return edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      label: e.label,
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
    }));
  }, [edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = (event: React.MouseEvent, node: any) => {
    const page = pages.find(p => p.url === node.id);
    if (page) {
      setSelectedPage(page);
    }
  };

  return (
    <>
      <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-muted/20">
        <ReactFlow
          colorMode="system"
          nodes={nodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          attributionPosition="bottom-right"
        >
          <Background />
          <Controls className="shadow-xl rounded-md bg-card border-border [&>button]:text-foreground [&>button]:border-b-border [&>button:hover]:bg-accent" />
        </ReactFlow>
      </div>

      <Dialog open={!!selectedPage} onOpenChange={(open: boolean) => !open && setSelectedPage(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader className="mb-6">
            <DialogTitle>{selectedPage?.title}</DialogTitle>
            <DialogDescription className="break-all">{selectedPage?.url}</DialogDescription>
          </DialogHeader>
          
          {selectedPage && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Base Page Screenshot</h3>
                {selectedPage.screenshot ? (
                  <img
                    src={assetDisplayUrl(selectedPage.screenshot)}
                    alt="Base screenshot"
                    className="w-full rounded-md border"
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">No screenshot available.</p>
                )}
              </div>

              {selectedPage.actionScreenshots && selectedPage.actionScreenshots.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Modals & Popups ({selectedPage.actionScreenshots.length})</h3>
                  <div className="space-y-4">
                    {selectedPage.actionScreenshots.map((action, idx) => (
                      <div key={idx} className="border rounded-md p-2 bg-muted/20">
                        <p className="text-sm font-medium mb-2">Triggered by: "{action.triggerText}"</p>
                        <img
                          src={assetDisplayUrl(action.screenshot)}
                          alt={`Modal for ${action.triggerText}`}
                          className="w-full rounded-md border"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
