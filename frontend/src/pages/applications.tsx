import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppWindow } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import type { Application } from "@/types";

export default function Applications() {
  const [, navigate] = useLocation();

  const { data: apps, isLoading } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-apps-title">Applications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All applications across projects
        </p>
      </div>

      {!apps || apps.length === 0 ? (
        <EmptyState
          icon={<AppWindow className="h-12 w-12" />}
          title="No applications yet"
          description="Add applications from within a project."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <Card
              key={app.id}
              className="p-5 cursor-pointer hover-elevate"
              onClick={() => navigate(`/applications/${app.id}`)}
              data-testid={`card-app-${app.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-teal-500/10">
                    <AppWindow className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{app.name}</h3>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{app.app_type}</p>
                  </div>
                </div>
                <StatusBadge value={app.status} />
              </div>
              {app.url && (
                <p className="text-xs text-muted-foreground mt-3 truncate">{app.url}</p>
              )}
              {app.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{app.description}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
