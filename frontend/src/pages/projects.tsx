import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderKanban } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import type { Project } from "@/types";

export default function Projects() {
  const [, navigate] = useLocation();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
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
        <h1 className="text-2xl font-bold" data-testid="text-projects-title">All Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage all projects across domains
        </p>
      </div>

      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-12 w-12" />}
          title="No projects yet"
          description="Create a project from within a domain to get started."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="p-5 cursor-pointer hover-elevate"
              onClick={() => navigate(`/projects/${project.id}`)}
              data-testid={`card-project-${project.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-violet-500/10">
                    <FolderKanban className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{project.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {project.description || "No description"}
                    </p>
                  </div>
                </div>
                <StatusBadge value={project.status} />
              </div>
              {project.jira_project_key && (
                <div className="mt-3 text-xs text-muted-foreground">
                  JIRA: {project.jira_project_key}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
