import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Plus,
  FolderKanban,
  ExternalLink,
  Globe,
  FileText,
  Upload,
  Search,
  Loader2,
  Link2,
  Trash2,
} from "lucide-react";
import { SiJira } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/empty-state";
import type { Domain, Project, JiraConnection } from "@/types";

interface JiraProject {
  key: string;
  name: string;
  id: string;
  project_type: string;
  lead: string;
  avatar_url: string;
  url: string;
}

interface Props {
  id: string;
}

export default function DomainDetail({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [jiraKey, setJiraKey] = useState("");
  const [jiraUrl, setJiraUrl] = useState("");
  const [jiraConnectionId, setJiraConnectionId] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [brdDocument, setBrdDocument] = useState("");
  const [jiraSearchOpen, setJiraSearchOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: domain, isLoading: domainLoading } = useQuery<Domain>({
    queryKey: ["/api/domains", id],
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: [`/api/projects?domain_id=${id}`],
  });

  const { data: jiraConnections } = useQuery<JiraConnection[]>({
    queryKey: ["/api/jira-connections"],
  });

  const { data: jiraStatus } = useQuery<{ configured: boolean; base_url: string | null }>({
    queryKey: ["/api/jira/status", jiraConnectionId],
    queryFn: async () => {
      if (!jiraConnectionId || jiraConnectionId === "none") return { configured: false, base_url: null };
      const res = await fetch(`/api/jira/status?connection_id=${jiraConnectionId}`);
      if (!res.ok) return { configured: false, base_url: null };
      return res.json();
    },
    enabled: !!jiraConnectionId && jiraConnectionId !== "none",
  });

  const { data: jiraProjects, isLoading: jiraLoading } = useQuery<{ projects: JiraProject[]; total: number }>({
    queryKey: ["/api/jira/projects", jiraConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/jira/projects?connection_id=${jiraConnectionId}`);
      if (!res.ok) throw new Error("Failed to load JIRA projects");
      return res.json();
    },
    enabled: jiraSearchOpen && !!jiraConnectionId && jiraConnectionId !== "none",
  });

  const createProject = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects", {
        domain_id: id,
        name: projectName,
        description: projectDesc,
        jira_project_key: jiraKey,
        jira_url: jiraUrl,
        jira_connection_id: jiraConnectionId && jiraConnectionId !== "none" ? jiraConnectionId : null,
        app_url: appUrl,
        brd_document: brdDocument,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects?domain_id=${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      _resetForm();
      toast({ title: "Project created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects?domain_id=${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setDeleteConfirmId(null);
      toast({ title: "Project deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function _resetForm() {
    setOpen(false);
    setProjectName("");
    setProjectDesc("");
    setJiraKey("");
    setJiraUrl("");
    setJiraConnectionId("");
    setAppUrl("");
    setBrdDocument("");
    setJiraSearchOpen(false);
  }

  function selectJiraProject(jp: JiraProject) {
    setJiraKey(jp.key);
    setJiraUrl(jp.url);
    if (!projectName) setProjectName(jp.name);
    setJiraSearchOpen(false);
    toast({ title: `JIRA project ${jp.key} linked` });
  }

  if (domainLoading || projectsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" onClick={() => navigate("/domains")} className="gap-2" data-testid="button-back-domains">
        <ArrowLeft className="h-4 w-4" />
        Back to Domains
      </Button>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-domain-detail-name">{domain?.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{domain?.description}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) _resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-project">
              <Plus className="h-4 w-4 mr-2" />
              Add Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g., Access Assist Portal"
                  data-testid="input-project-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  placeholder="Describe this project..."
                  data-testid="input-project-description"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <SiJira className="h-3.5 w-3.5 text-blue-500" />
                  JIRA Connection
                </Label>
                <Select value={jiraConnectionId} onValueChange={setJiraConnectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Jira connection" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {jiraConnections?.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        {conn.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <SiJira className="h-3.5 w-3.5 text-blue-500" />
                    JIRA Project Key
                  </Label>
                  {jiraStatus?.configured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setJiraSearchOpen(!jiraSearchOpen)}
                      data-testid="button-import-jira"
                    >
                      <Search className="h-3 w-3" />
                      Import from JIRA
                    </Button>
                  )}
                </div>

                {jiraSearchOpen && (
                  <Card className="p-3 border-dashed max-h-48 overflow-y-auto space-y-1.5">
                    {jiraLoading ? (
                      <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading JIRA projects...
                      </div>
                    ) : jiraProjects?.projects && jiraProjects.projects.length > 0 ? (
                      jiraProjects.projects.map((jp) => (
                        <div
                          key={jp.key}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                          onClick={() => selectJiraProject(jp)}
                          data-testid={`jira-project-${jp.key}`}
                        >
                          <div className="flex items-center gap-2.5">
                            {jp.avatar_url ? (
                              <img src={jp.avatar_url} alt="" className="h-6 w-6 rounded" />
                            ) : (
                              <SiJira className="h-5 w-5 text-blue-500" />
                            )}
                            <div>
                              <p className="text-sm font-medium">{jp.name}</p>
                              <p className="text-xs text-muted-foreground">{jp.key} &middot; {jp.project_type}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">{jp.key}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-2">No JIRA projects found</p>
                    )}
                  </Card>
                )}

                <div className="flex gap-2">
                  <Input
                    value={jiraKey}
                    onChange={(e) => setJiraKey(e.target.value)}
                    placeholder="e.g., AAP"
                    className="flex-1"
                    data-testid="input-jira-key"
                  />
                  {jiraKey && (
                    <Badge variant="secondary" className="flex items-center gap-1 whitespace-nowrap">
                      <SiJira className="h-3 w-3 text-blue-500" />
                      {jiraKey}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-emerald-500" />
                  Application URL
                </Label>
                <Input
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://your-app.example.com"
                  data-testid="input-app-url"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-amber-500" />
                  Context Documents (BRD / Requirements)
                </Label>
                <Textarea
                  value={brdDocument}
                  onChange={(e) => setBrdDocument(e.target.value)}
                  placeholder="Paste BRD content, requirements, or reference links..."
                  rows={3}
                  data-testid="input-brd-document"
                />
              </div>

              <Button
                onClick={() => createProject.mutate()}
                disabled={!projectName.trim() || createProject.isPending}
                className="w-full"
                data-testid="button-submit-project"
              >
                {createProject.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                ) : (
                  "Create Project"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-12 w-12" />}
          title="No projects in this domain"
          description="Add your first project to start building test suites."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Project
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group relative cursor-pointer hover-elevate transition-all"
              onClick={() => navigate(`/projects/${project.id}`)}
              data-testid={`card-project-${project.id}`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-violet-500/10 shrink-0">
                      <FolderKanban className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{project.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {project.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(project.id); }}
                    data-testid={`button-delete-project-${project.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.jira_project_key && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <SiJira className="h-2.5 w-2.5 text-blue-500" />
                      {project.jira_project_key}
                    </Badge>
                  )}
                  {project.app_url && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Globe className="h-2.5 w-2.5 text-emerald-500" />
                      App URL
                    </Badge>
                  )}
                  {project.brd_document && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <FileText className="h-2.5 w-2.5 text-amber-500" />
                      Docs
                    </Badge>
                  )}
                </div>

                {(project.app_url || project.jira_url) && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-3 text-xs text-muted-foreground">
                    {project.app_url && (
                      <span
                        className="flex items-center gap-1 hover:text-foreground transition-colors truncate"
                        onClick={(e) => { e.stopPropagation(); window.open(project.app_url, "_blank"); }}
                        data-testid={`link-app-url-${project.id}`}
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{project.app_url.replace(/^https?:\/\//, "")}</span>
                      </span>
                    )}
                    {project.jira_url && (
                      <span
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={(e) => { e.stopPropagation(); window.open(project.jira_url, "_blank"); }}
                        data-testid={`link-jira-url-${project.id}`}
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        JIRA
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteConfirmId} onOpenChange={(v) => { if (!v) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this project and all its test suites, test cases, and applications. This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteProject.mutate(deleteConfirmId)}
              disabled={deleteProject.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteProject.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
