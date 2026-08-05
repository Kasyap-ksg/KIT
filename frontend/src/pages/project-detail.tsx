import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Plus,
  AppWindow,
  TestTubes,
  BarChart3,
  ExternalLink,
  Globe,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Calendar,
  Loader2,
  User,
  LayoutDashboard,
  Bug,
  Upload,
} from "lucide-react";
import { SiJira } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone } from "@/components/file-drop-zone";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { SUITE_TYPES } from "@/types";
import type { Project, ProjectAnalytics, JiraConnection } from "@/types";

interface JiraSprint {
  id: number;
  name: string;
  state: string;
  start_date: string;
  end_date: string;
  complete_date: string;
  goal: string;
}

interface JiraBoard {
  id: number;
  name: string;
  type: string;
  project_key: string;
}

interface JiraIssue {
  key: string;
  summary: string;
  issue_type: string;
  status: string;
  status_category: string;
  priority: string;
  assignee: string;
  assignee_avatar: string;
  url: string;
}

interface Props {
  id: string;
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function IssueStatusDot({ category }: { category: string }) {
  const colors: Record<string, string> = {
    "To Do": "bg-gray-400",
    "In Progress": "bg-blue-500",
    "Done": "bg-emerald-500",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[category] || "bg-gray-400"}`} />;
}

export default function ProjectDetail({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [appOpen, setAppOpen] = useState(false);
  const [suiteOpen, setSuiteOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [activeSprintsOpen, setActiveSprintsOpen] = useState(true);
  const [closedSprintsOpen, setClosedSprintsOpen] = useState(false);
  const [expandedSprint, setExpandedSprint] = useState<number | null>(null);
  
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editJiraKey, setEditJiraKey] = useState("");
  const [editJiraConnectionId, setEditJiraConnectionId] = useState("");
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [brdDraft, setBrdDraft] = useState("");
  const [attachedDocName, setAttachedDocName] = useState<string | null>(null);

  const handleDocFile = useCallback(async (file: File) => {
    const TEXT_EXTS = [".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml", ".rst"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (TEXT_EXTS.includes(ext)) {
      const text = await file.text();
      setBrdDraft(text);
      setAttachedDocName(file.name);
    } else {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/uploads/doc", { method: "POST", body: form });
        const data = await res.json();
        if (data.text_content) {
          setBrdDraft(data.text_content);
        }
        setAttachedDocName(file.name);
      } catch {
        toast({ title: "Failed to upload file", variant: "destructive" });
      }
    }
  }, [toast]);

  const [appName, setAppName] = useState("");
  const [appType, setAppType] = useState("web");
  const [appUrl, setAppUrl] = useState("");
  const [appDesc, setAppDesc] = useState("");

  const [suiteName, setSuiteName] = useState("");
  const [suiteType, setSuiteType] = useState("");
  const [suiteDesc, setSuiteDesc] = useState("");

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const { data: analytics } = useQuery<ProjectAnalytics>({
    queryKey: [`/api/analytics/project/${id}`],
  });

  const { data: jiraConnections } = useQuery<JiraConnection[]>({
    queryKey: ["/api/jira-connections"],
  });

  const { data: boardsData, isError: boardsError } = useQuery<{ boards: JiraBoard[] }>({
    queryKey: ["/api/jira/projects", project?.jira_project_key, "boards", id],
    queryFn: async () => {
      const res = await fetch(`/api/jira/projects/${project!.jira_project_key}/boards?project_id=${id}`);
      if (!res.ok) throw new Error("Failed to load boards");
      return res.json();
    },
    enabled: !!project?.jira_project_key,
    retry: 1,
  });

  const activeBoard = boardsData?.boards?.[0];

  const { data: sprintsData, isLoading: sprintsLoading, isError: sprintsError } = useQuery<{ sprints: JiraSprint[] }>({
    queryKey: ["/api/jira/boards", activeBoard?.id, "sprints", id],
    queryFn: async () => {
      const res = await fetch(`/api/jira/boards/${activeBoard!.id}/sprints?state=active,closed&project_id=${id}`);
      if (!res.ok) throw new Error("Failed to load sprints");
      return res.json();
    },
    enabled: !!activeBoard?.id,
    retry: 1,
  });

  const activeSprints = sprintsData?.sprints?.filter(s => s.state === "active") || [];
  const closedSprints = sprintsData?.sprints?.filter(s => s.state === "closed") || [];

  const { data: sprintIssues } = useQuery<{ issues: JiraIssue[] }>({
    queryKey: ["/api/jira/sprints", expandedSprint, "issues", id],
    queryFn: async () => {
      const res = await fetch(`/api/jira/sprints/${expandedSprint}/issues?project_id=${id}`);
      if (!res.ok) throw new Error("Failed to load issues");
      return res.json();
    },
    enabled: !!expandedSprint,
  });

  const updateProject = useMutation({
    mutationFn: async (data: Record<string, string | null>) => {
      const res = await apiRequest("PUT", `/api/projects/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setEditingUrl(false);
      setEditProjectOpen(false);
      toast({ title: "Project updated" });
    },
  });

  const openEditProject = () => {
    setEditName(project?.name || "");
    setEditDesc(project?.description || "");
    setEditJiraKey(project?.jira_project_key || "");
    setEditJiraConnectionId(project?.jira_connection_id || "");
    setEditProjectOpen(true);
  };

  const saveProjectEdit = () => {
    updateProject.mutate({
      name: editName,
      description: editDesc,
      jira_project_key: editJiraKey,
      jira_connection_id: editJiraConnectionId && editJiraConnectionId !== "none" ? editJiraConnectionId : null,
    });
  };

  const createApp = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/applications", {
        project_id: id, name: appName, app_type: appType, url: appUrl, description: appDesc,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setAppOpen(false);
      setAppName(""); setAppUrl(""); setAppDesc("");
      toast({ title: "Application added" });
    },
  });

  const createSuite = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/test-suites", {
        project_id: id, name: suiteName, suite_type: suiteType, description: suiteDesc,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites"] });
      setSuiteOpen(false);
      setSuiteName(""); setSuiteType(""); setSuiteDesc("");
      toast({ title: "Test suite created" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <Button variant="ghost" onClick={() => navigate(project?.domain_id ? `/domains/${project.domain_id}` : "/projects")} className="gap-2" data-testid="button-back-projects">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-project-name">{project?.name}</h1>
          <StatusBadge value={project?.status || "active"} />
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-2"
            onClick={() => { setBrdDraft(project?.brd_document || ""); setUploadDocOpen(true); }}
            data-testid="button-upload-doc"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Doc
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={openEditProject}
            data-testid="button-edit-project"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Settings
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => navigate(`/projects/${id}/defects`)}
            data-testid="button-open-defects"
          >
            <Bug className="h-3.5 w-3.5 text-amber-600" />
            Production Defects
          </Button>
        </div>
        {project?.description && (
          <p className="text-muted-foreground mt-1.5">{project.description}</p>
        )}
        {project?.jira_project_key && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
            <SiJira className="h-3.5 w-3.5 text-blue-500" />
            <span>JIRA: {project.jira_project_key}</span>
            {project.jira_url && (
              <a href={project.jira_url} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors" data-testid="link-jira">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Project Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <SiJira className="h-3.5 w-3.5 text-blue-500" />
                  JIRA Connection
                </Label>
                <Select value={editJiraConnectionId} onValueChange={setEditJiraConnectionId}>
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
                <Label className="flex items-center gap-1.5">
                  <SiJira className="h-3.5 w-3.5 text-blue-500" />
                  JIRA Project Key
                </Label>
                <Input value={editJiraKey} onChange={(e) => setEditJiraKey(e.target.value)} placeholder="e.g., AAP" />
              </div>
              <Button onClick={saveProjectEdit} disabled={!editName.trim() || updateProject.isPending} className="w-full mt-4">
                {updateProject.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={uploadDocOpen} onOpenChange={(open) => { setUploadDocOpen(open); if (!open) setAttachedDocName(null); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Attach or paste your BRD, requirements doc, or any context the AI should use when generating Gherkin tests.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-1">
              <FileDropZone
                onFile={handleDocFile}
                accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.rst,.pdf,.docx"
                label="Drag & drop or click to attach a document"
                attachedName={attachedDocName ?? undefined}
                onClear={() => { setAttachedDocName(null); setBrdDraft(""); }}
              />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Or paste content directly</Label>
                <Textarea
                  placeholder="Paste your document content here..."
                  value={brdDraft}
                  onChange={(e) => setBrdDraft(e.target.value)}
                  rows={8}
                  className="resize-none font-mono text-xs"
                />
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button variant="outline" onClick={() => setUploadDocOpen(false)}>Cancel</Button>
              <Button
                onClick={() => { updateProject.mutate({ brd_document: brdDraft }); setUploadDocOpen(false); setAttachedDocName(null); }}
                disabled={updateProject.isPending}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Save Document
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="flex items-center gap-3 px-4 py-3" data-testid="card-app-url">
        <Globe className="h-5 w-5 text-blue-500 shrink-0" />
        {editingUrl ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://your-app.example.com"
              className="h-8 text-sm flex-1"
              autoFocus
              data-testid="input-edit-app-url"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { updateProject.mutate({ app_url: urlDraft }); }} data-testid="button-save-url">
              <Check className="h-4 w-4 text-emerald-600" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingUrl(false)} data-testid="button-cancel-url">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <>
            {project?.app_url ? (
              <a href={project.app_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex-1" data-testid="link-app-url">
                {project.app_url}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground italic flex-1">No application URL set</span>
            )}
            <Button
              size="icon" variant="ghost" className="h-7 w-7 shrink-0"
              onClick={() => { setUrlDraft(project?.app_url || ""); setEditingUrl(true); }}
              data-testid="button-edit-url"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">Target app for Playwright tests</span>
          </>
        )}
      </Card>

      {project?.jira_project_key && (
        <div className="space-y-4">
          {activeBoard && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Active Board:</span>
              <Badge variant="secondary" className="gap-1.5">
                <LayoutDashboard className="h-3 w-3" />
                {activeBoard.name}
              </Badge>
            </div>
          )}

          {(boardsError || sprintsError) ? (
            <Card className="p-4 border-dashed">
              <p className="text-sm text-muted-foreground">Unable to load sprint data from JIRA. The JIRA server may be unavailable.</p>
            </Card>
          ) : sprintsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sprints from JIRA...
            </div>
          ) : (
            <>
              <Collapsible open={activeSprintsOpen} onOpenChange={setActiveSprintsOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 group cursor-pointer" data-testid="toggle-active-sprints">
                  {activeSprintsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <h2 className="text-base font-semibold">Active Sprints ({activeSprints.length})</h2>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {activeSprints.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6">No active sprints</p>
                  ) : (
                    activeSprints.map((sprint) => (
                      <SprintCard
                        key={sprint.id}
                        sprint={sprint}
                        expanded={expandedSprint === sprint.id}
                        onToggle={() => setExpandedSprint(expandedSprint === sprint.id ? null : sprint.id)}
                        issues={expandedSprint === sprint.id ? sprintIssues?.issues : undefined}
                        jiraBaseUrl={project.jira_url?.replace(`/browse/${project.jira_project_key}`, "") || ""}
                        projectId={id}
                        onNavigate={navigate}
                      />
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={closedSprintsOpen} onOpenChange={setClosedSprintsOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 group cursor-pointer" data-testid="toggle-closed-sprints">
                  {closedSprintsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <h2 className="text-base font-semibold">Closed Sprints ({closedSprints.length})</h2>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {closedSprints.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6">No closed sprints</p>
                  ) : (
                    closedSprints.map((sprint) => (
                      <SprintCard
                        key={sprint.id}
                        sprint={sprint}
                        expanded={expandedSprint === sprint.id}
                        onToggle={() => setExpandedSprint(expandedSprint === sprint.id ? null : sprint.id)}
                        issues={expandedSprint === sprint.id ? sprintIssues?.issues : undefined}
                        jiraBaseUrl={project.jira_url?.replace(`/browse/${project.jira_project_key}`, "") || ""}
                        projectId={id}
                        onNavigate={navigate}
                      />
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </div>
      )}

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Applications</h2>
          <Dialog open={appOpen} onOpenChange={setAppOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-app">
                <Plus className="h-4 w-4 mr-2" />
                Add Application
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Application</DialogTitle>
                <DialogDescription>Add a web, mobile, API, or desktop application to this project.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g., Hilton QA Sandbox" data-testid="input-app-name" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={appType} onValueChange={setAppType}>
                    <SelectTrigger data-testid="select-app-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="web">Web Application</SelectItem>
                      <SelectItem value="mobile">Mobile App</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="desktop">Desktop App</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://..." data-testid="input-app-url" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={appDesc} onChange={(e) => setAppDesc(e.target.value)} placeholder="Describe this application..." data-testid="input-app-desc" />
                </div>
                <Button onClick={() => createApp.mutate()} disabled={!appName.trim() || createApp.isPending} className="w-full" data-testid="button-submit-app">
                  {createApp.isPending ? "Adding..." : "Add Application"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {!project?.applications || project.applications.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <AppWindow className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No applications added yet. Add your first application to start testing.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.applications.map((app) => (
              <Card
                key={app.id}
                className="p-4 cursor-pointer hover-elevate transition-all group"
                onClick={() => navigate(`/applications/${app.id}`)}
                data-testid={`card-app-${app.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-teal-500/10 shrink-0">
                    <Globe className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold truncate">{app.name}</h4>
                      <StatusBadge value={app.status} />
                    </div>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{app.app_type === "web" ? "Web Application" : app.app_type}</p>
                    {app.url && (
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1.5 truncate"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`link-app-${app.id}`}
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{app.url}</span>
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Test Suites</h2>
          <Dialog open={suiteOpen} onOpenChange={setSuiteOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-suite">
                <Plus className="h-4 w-4 mr-2" />
                New Test Suite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Test Suite</DialogTitle>
                <DialogDescription>Create a test suite to organize your test cases.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={suiteName} onChange={(e) => setSuiteName(e.target.value)} placeholder="e.g., Sprint 13 Tests" data-testid="input-suite-name" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={suiteType} onValueChange={setSuiteType}>
                    <SelectTrigger data-testid="select-suite-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {SUITE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={suiteDesc} onChange={(e) => setSuiteDesc(e.target.value)} placeholder="Describe this test suite..." data-testid="input-suite-description" />
                </div>
                <Button onClick={() => createSuite.mutate()} disabled={!suiteName.trim() || !suiteType || createSuite.isPending} className="w-full" data-testid="button-submit-suite">
                  {createSuite.isPending ? "Creating..." : "Create Test Suite"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {analytics && analytics.total_cases > 0 && (
          <Card className="p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Test Execution Summary</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Cases</p>
                <p className="text-xl font-bold">{analytics.total_cases}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Passed</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{analytics.total_passed}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{analytics.total_failed}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pass Rate</p>
                <p className="text-xl font-bold">{analytics.pass_rate}%</p>
              </div>
            </div>
            <Progress value={analytics.pass_rate} className="h-2" />
          </Card>
        )}

        {!project?.test_suites || project.test_suites.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <TestTubes className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No test suites yet. Create one to start managing test cases.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {project.test_suites.map((suite) => {
              const progress = suite.total_cases > 0 ? Math.round((suite.passed_cases / suite.total_cases) * 100) : 0;
              return (
                <Card
                  key={suite.id}
                  className="p-4 cursor-pointer hover-elevate transition-all"
                  onClick={() => navigate(`/test-suites/${suite.id}`)}
                  data-testid={`card-suite-${suite.id}`}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="font-medium">{suite.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge value={suite.suite_type} variant="suite_type" />
                        <StatusBadge value={suite.status} />
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-muted-foreground">{suite.total_cases} cases</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-emerald-600 dark:text-emerald-400">{suite.passed_cases}P</span>
                        <span className="text-red-600 dark:text-red-400">{suite.failed_cases}F</span>
                      </div>
                    </div>
                  </div>
                  {suite.total_cases > 0 && <Progress value={progress} className="h-1.5 mt-3" />}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SprintCard({
  sprint,
  expanded,
  onToggle,
  issues,
  jiraBaseUrl,
  projectId,
  onNavigate,
}: {
  sprint: JiraSprint;
  expanded: boolean;
  onToggle: () => void;
  issues?: JiraIssue[];
  jiraBaseUrl: string;
  projectId: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <Card className="overflow-hidden" data-testid={`sprint-card-${sprint.id}`}>
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="font-medium text-sm">{sprint.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(sprint.start_date)} - {formatDate(sprint.end_date || sprint.complete_date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sprint.state === "active" ? "default" : "secondary"} className="capitalize text-xs">
            {sprint.state === "active" ? "Active" : "Closed"}
          </Badge>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t">
          {!issues ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading stories...
            </div>
          ) : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No issues in this sprint</p>
          ) : (
            <>
              <div className="divide-y">
                {issues.slice(0, 4).map((issue) => (
                  <a
                    key={issue.key}
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors group"
                    data-testid={`issue-${issue.key}`}
                  >
                    <IssueStatusDot category={issue.status_category} />
                    <Badge variant="outline" className="text-xs font-mono shrink-0">{issue.key}</Badge>
                    <span className="text-sm flex-1 truncate group-hover:text-foreground">{issue.summary}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {issue.issue_type && (
                        <Badge variant="secondary" className="text-xs capitalize">{issue.issue_type}</Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          issue.status_category === "Done"
                            ? "border-emerald-200 text-emerald-700 dark:text-emerald-400"
                            : issue.status_category === "In Progress"
                            ? "border-blue-200 text-blue-700 dark:text-blue-400"
                            : ""
                        }`}
                      >
                        {issue.status}
                      </Badge>
                      {issue.assignee_avatar && (
                        <img src={issue.assignee_avatar} alt={issue.assignee} className="h-5 w-5 rounded-full" title={issue.assignee} />
                      )}
                    </div>
                  </a>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t bg-muted/30">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={(e) => { e.stopPropagation(); onNavigate(`/projects/${projectId}/sprints/${sprint.id}`); }}
                  data-testid={`button-view-all-issues-${sprint.id}`}
                >
                  View all {issues.length} issues & manage test cases →
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
