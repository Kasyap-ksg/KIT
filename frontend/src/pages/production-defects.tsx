import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  Bug,
  Plus,
  Sparkles,
  Loader2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ExternalLink,
  CheckCircle2,
  XCircle,
  TestTubes,
  ChevronRight,
  Wand2,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { SiJira } from "react-icons/si";
import type { Project } from "@/types";

interface Defect {
  id: string;
  project_id: string;
  jira_key: string;
  title: string;
  description: string;
  repro_steps: string;
  severity: string;
  status: string;
  source: string;
  page_url: string;
  rationale: string;
  created_at: string | null;
  regression_test_count: number;
  regression_test_case_ids: string[];
}

interface Scenario {
  kind: string;
  title: string;
  gherkin: string;
}

interface JiraBug {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  url: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  high: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  low: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const STATUS_STYLES: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  captured: { label: "Captured", className: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300", icon: Bug },
  generating: { label: "Generating", className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300", icon: Loader2 },
  regression_added: { label: "Protected", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300", icon: ShieldCheck },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-500 border-slate-200", icon: Bug },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ProductionDefects({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [selectedDefectId, setSelectedDefectId] = useState<string | null>(null);

  // Auto-open from query string
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("defect");
    if (d) setSelectedDefectId(d);
  }, []);

  const { data: project } = useQuery<Project>({ queryKey: ["/api/projects", id] });

  const { data: defects, isLoading } = useQuery<Defect[]>({
    queryKey: ["/api/defects", { project_id: id }],
    queryFn: async () => {
      const res = await fetch(`/api/defects?project_id=${id}`);
      if (!res.ok) throw new Error("Failed to load defects");
      return res.json();
    },
  });

  const createDefect = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await apiRequest("POST", "/api/defects", { project_id: id, ...payload });
      return res.json();
    },
    onSuccess: (d: Defect) => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects", { project_id: id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/defects/stats"] });
      setCreateOpen(false);
      setSelectedDefectId(d.id);
      toast({ title: "Defect captured", description: "Click Generate Regression Test to convert it." });
    },
    onError: (e: any) => toast({ title: "Could not capture defect", description: e?.message || "Please try again.", variant: "destructive" }),
  });

  const captured = defects?.filter((d) => d.status !== "regression_added") ?? [];
  const protectedDefects = defects?.filter((d) => d.status === "regression_added") ?? [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => navigate(`/projects/${id}`)}
        className="gap-2"
        data-testid="button-back-project"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to project
      </Button>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wider font-semibold">
            <Sparkles className="h-3 w-3 text-primary" />
            Learning From Production
          </div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-defects-title">
            Production Defects
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Every escaped defect is a teaching moment. Convert it into Gherkin scenarios that get permanently
            attached to your regression suite — with a lineage that proves it can never silently come back.
          </p>
          {project?.name && (
            <p className="text-xs text-muted-foreground mt-1">
              Project: <span className="font-medium text-foreground">{project.name}</span>
              {project.jira_project_key && <span> · JIRA {project.jira_project_key}</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {project?.jira_project_key && (
            <Button variant="outline" onClick={() => setJiraOpen(true)} data-testid="button-pull-jira" className="gap-2">
              <SiJira className="h-4 w-4 text-blue-500" />
              Pull from JIRA
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)} data-testid="button-add-defect" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Defect
          </Button>
        </div>
      </div>

      <DefectStats defects={defects ?? []} />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-semibold">Awaiting Regression ({captured.length})</h2>
          <span className="text-xs text-muted-foreground">— defects with no permanent protection yet</span>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : captured.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <Bug className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No defects awaiting regression. Add one to start learning from production.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {captured.map((d) => (
              <DefectRow key={d.id} defect={d} onClick={() => setSelectedDefectId(d.id)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold">Permanently Protected ({protectedDefects.length})</h2>
          <span className="text-xs text-muted-foreground">— each one can never silently regress</span>
        </div>
        {protectedDefects.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <p className="text-xs text-muted-foreground">Approved defects with regression tests appear here.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {protectedDefects.map((d) => (
              <DefectRow key={d.id} defect={d} onClick={() => setSelectedDefectId(d.id)} />
            ))}
          </div>
        )}
      </div>

      <CreateDefectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(payload) => createDefect.mutate(payload)}
        pending={createDefect.isPending}
      />

      {project?.jira_project_key && (
        <JiraImportDialog
          open={jiraOpen}
          onOpenChange={setJiraOpen}
          projectKey={project.jira_project_key}
          projectId={id}
        />
      )}

      <DefectDrawer
        defectId={selectedDefectId}
        onClose={() => setSelectedDefectId(null)}
        projectId={id}
      />
    </div>
  );
}

function DefectStats({ defects }: { defects: Defect[] }) {
  const protectedCount = defects.filter((d) => d.status === "regression_added").length;
  const totalTests = defects.reduce((acc, d) => acc + (d.regression_test_count || 0), 0);
  const critical = defects.filter((d) => d.severity === "critical").length;
  const protectionRate = defects.length ? Math.round((protectedCount / defects.length) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="defect-stats">
      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Defects Captured</div>
        <div className="text-2xl font-bold mt-1 tabular-nums">{defects.length}</div>
      </Card>
      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Permanently Protected</div>
        <div className="text-2xl font-bold mt-1 tabular-nums text-emerald-600">{protectedCount}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{protectionRate}% protection rate</div>
      </Card>
      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Regression Tests Born</div>
        <div className="text-2xl font-bold mt-1 tabular-nums text-primary">{totalTests}</div>
      </Card>
      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Critical Open</div>
        <div className={`text-2xl font-bold mt-1 tabular-nums ${critical > 0 ? "text-red-600" : "text-foreground"}`}>{critical}</div>
      </Card>
    </div>
  );
}

function DefectRow({ defect, onClick }: { defect: Defect; onClick: () => void }) {
  const StatusIcon = STATUS_STYLES[defect.status]?.icon ?? Bug;
  const statusInfo = STATUS_STYLES[defect.status] ?? STATUS_STYLES.captured;
  return (
    <Card
      className="p-4 hover-elevate cursor-pointer"
      onClick={onClick}
      data-testid={`row-defect-${defect.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
          <Bug className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {defect.jira_key && (
              <Badge variant="outline" className="gap-1 text-[10px] font-semibold border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                <SiJira className="h-3 w-3" />
                {defect.jira_key}
              </Badge>
            )}
            <h3 className="font-semibold truncate">{defect.title}</h3>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_STYLES[defect.severity] ?? ""}`}>
              {defect.severity}
            </Badge>
            <Badge variant="outline" className={`text-[10px] gap-1 ${statusInfo.className}`}>
              <StatusIcon className="h-3 w-3" />
              {statusInfo.label}
            </Badge>
            {defect.regression_test_count > 0 && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <TestTubes className="h-3 w-3" />
                {defect.regression_test_count} regression test{defect.regression_test_count !== 1 ? "s" : ""}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">· captured {fmtDate(defect.created_at)}</span>
          </div>
          {defect.rationale && (
            <p className="text-xs text-muted-foreground mt-2 italic">"{defect.rationale}"</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2" />
      </div>
    </Card>
  );
}

function CreateDefectDialog({
  open, onOpenChange, onSubmit, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (payload: Record<string, string>) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reproSteps, setReproSteps] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [pageUrl, setPageUrl] = useState("");
  const [jiraKey, setJiraKey] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle(""); setDescription(""); setReproSteps("");
      setSeverity("medium"); setPageUrl(""); setJiraKey("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Capture Production Defect</DialogTitle>
          <DialogDescription>
            Paste the bug details. The AI will turn it into permanent regression scenarios.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Search returns 0 results when query has trailing space"
              data-testid="input-defect-title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger data-testid="select-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>JIRA key (optional)</Label>
              <Input value={jiraKey} onChange={(e) => setJiraKey(e.target.value)} placeholder="PROD-123"
                data-testid="input-jira-key" />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="What went wrong, observed in production…" data-testid="input-description" />
          </div>
          <div>
            <Label>Reproduction steps</Label>
            <Textarea value={reproSteps} onChange={(e) => setReproSteps(e.target.value)} rows={4}
              placeholder="1. Go to /search\n2. Enter 'shoes ' (trailing space)\n3. Click search\n4. Expect: results. Actual: empty state."
              data-testid="input-repro-steps" />
          </div>
          <div>
            <Label>Page URL (optional)</Label>
            <Input value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="https://app.example.com/search"
              data-testid="input-page-url" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onSubmit({ title, description, repro_steps: reproSteps, severity, page_url: pageUrl, jira_key: jiraKey, source: "manual" })}
            disabled={!title.trim() || pending}
            data-testid="button-submit-defect"
          >
            {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Capture Defect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JiraImportDialog({
  open, onOpenChange, projectKey, projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectKey: string;
  projectId: string;
}) {
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<{ bugs: JiraBug[] }>({
    queryKey: ["/api/defects/jira/bugs", projectKey],
    queryFn: async () => {
      const res = await fetch(`/api/defects/jira/bugs/${projectKey}`);
      if (!res.ok) throw new Error("Failed to load JIRA bugs");
      return res.json();
    },
    enabled: open,
  });

  const importBug = useMutation({
    mutationFn: async (bug: JiraBug) => {
      const res = await apiRequest("POST", "/api/defects", {
        project_id: projectId,
        title: bug.summary,
        description: bug.description,
        repro_steps: "",
        severity: (bug.priority || "medium").toLowerCase().includes("critical") ? "critical"
          : (bug.priority || "").toLowerCase().includes("high") ? "high"
          : (bug.priority || "").toLowerCase().includes("low") ? "low" : "medium",
        jira_key: bug.key,
        source: "jira",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects", { project_id: projectId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/defects/stats"] });
      toast({ title: "Imported from JIRA" });
    },
    onError: (e: any) => toast({ title: "JIRA import failed", description: e?.message || "Try again or capture manually.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SiJira className="h-4 w-4 text-blue-500" /> Open Bugs in {projectKey}</DialogTitle>
          <DialogDescription>Pick a production bug to import as a defect for regression learning.</DialogDescription>
        </DialogHeader>
        <div className="overflow-auto flex-1 space-y-2 -mx-1 px-1">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : isError ? (
            <Card className="p-6 text-sm text-muted-foreground border-dashed">JIRA is unavailable. Add a defect manually instead.</Card>
          ) : !data?.bugs?.length ? (
            <Card className="p-6 text-sm text-muted-foreground border-dashed">No open bugs in this JIRA project.</Card>
          ) : (
            data.bugs.map((b) => (
              <Card key={b.key} className="p-3 flex items-start gap-3" data-testid={`row-jira-bug-${b.key}`}>
                <Badge variant="outline" className="text-[10px] font-semibold gap-1 border-blue-200 text-blue-700 bg-blue-50">
                  <SiJira className="h-3 w-3" /> {b.key}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{b.summary}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{b.priority || "—"} · {b.status}</div>
                  {b.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.description}</p>}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button size="sm" onClick={() => importBug.mutate(b)} disabled={importBug.isPending} data-testid={`button-import-${b.key}`}>
                    Import
                  </Button>
                  <a href={b.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                    <ExternalLink className="h-3 w-3" /> View
                  </a>
                </div>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DefectDrawer({
  defectId, onClose, projectId,
}: {
  defectId: string | null;
  onClose: () => void;
  projectId: string;
}) {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [rationale, setRationale] = useState("");
  const { toast } = useToast();

  const { data: defect } = useQuery<Defect>({
    queryKey: ["/api/defects", defectId],
    enabled: !!defectId,
  });

  const { data: lineage, isLoading: lineageLoading } = useQuery<any>({
    queryKey: ["/api/defects", defectId, "lineage"],
    queryFn: async () => {
      const res = await fetch(`/api/defects/${defectId}/lineage`);
      if (!res.ok) throw new Error("lineage");
      return res.json();
    },
    enabled: !!defectId && defect?.status === "regression_added",
  });

  useEffect(() => {
    setScenarios(null);
    setRationale("");
  }, [defectId]);

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/defects/${defectId}/generate`, {});
      return res.json();
    },
    onSuccess: (data: { scenarios: Scenario[]; rationale: string }) => {
      setScenarios(data.scenarios);
      setRationale(data.rationale || "");
    },
    onError: () => toast({ title: "AI generation failed", variant: "destructive" }),
  });

  const approve = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/defects/${defectId}/approve`, {
        scenarios, rationale,
      });
      return res.json();
    },
    onSuccess: (data: { regression_suite_id: string; created: any[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects", { project_id: projectId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/defects", defectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/defects", defectId, "lineage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/defects/stats"] });
      toast({
        title: `${data.created.length} regression test${data.created.length !== 1 ? "s" : ""} added`,
        description: "The defect is now permanently protected.",
      });
      setScenarios(null);
    },
    onError: (e: any) => toast({ title: "Approval failed", description: e?.message || "Could not attach to regression suite.", variant: "destructive" }),
  });

  const open = !!defectId;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-auto" data-testid="sheet-defect-detail">
        {!defect ? (
          <div className="space-y-3 mt-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2 flex-wrap">
                {defect.jira_key && (
                  <Badge variant="outline" className="gap-1 text-[10px] font-semibold border-blue-200 text-blue-700 bg-blue-50">
                    <SiJira className="h-3 w-3" /> {defect.jira_key}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_STYLES[defect.severity] ?? ""}`}>
                  {defect.severity}
                </Badge>
              </div>
              <SheetTitle className="mt-2">{defect.title}</SheetTitle>
              <SheetDescription>{defect.description || "No description provided."}</SheetDescription>
            </SheetHeader>

            {defect.repro_steps && (
              <div className="mt-4">
                <Label className="text-xs text-muted-foreground">Reproduction</Label>
                <pre className="text-xs bg-muted/50 p-3 rounded-md mt-1 whitespace-pre-wrap font-mono">{defect.repro_steps}</pre>
              </div>
            )}

            <Separator className="my-5" />

            {defect.status === "regression_added" ? (
              <LineageView lineage={lineage} loading={lineageLoading} />
            ) : (
              <div className="space-y-4">
                {!scenarios && (
                  <Card className="p-5 border-dashed text-center">
                    <Wand2 className="h-8 w-8 mx-auto text-primary mb-2" />
                    <h3 className="font-semibold text-sm">Convert this defect into permanent regression coverage</h3>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                      The AI will produce 1–3 Gherkin scenarios you can review and edit before they're attached to the regression suite.
                    </p>
                    <Button
                      onClick={() => generate.mutate()}
                      disabled={generate.isPending}
                      data-testid="button-generate-regression"
                      className="gap-2"
                    >
                      {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Generate Regression Test
                    </Button>
                  </Card>
                )}

                {scenarios && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">What this protects against</Label>
                      <Textarea
                        value={rationale}
                        onChange={(e) => setRationale(e.target.value)}
                        rows={2}
                        className="mt-1 italic"
                        data-testid="input-rationale"
                      />
                    </div>
                    {scenarios.map((s, i) => (
                      <ScenarioEditor
                        key={i}
                        scenario={s}
                        onChange={(updated) => {
                          const next = [...scenarios];
                          next[i] = updated;
                          setScenarios(next);
                        }}
                        onRemove={() => setScenarios(scenarios.filter((_, j) => j !== i))}
                      />
                    ))}
                    <div className="flex items-center justify-between gap-2">
                      <Button variant="ghost" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
                        <Loader2 className={`h-3 w-3 mr-1.5 ${generate.isPending ? "animate-spin" : "hidden"}`} />
                        Regenerate
                      </Button>
                      <Button
                        onClick={() => approve.mutate()}
                        disabled={approve.isPending || scenarios.length === 0}
                        data-testid="button-approve-regression"
                        className="gap-2"
                      >
                        {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        Approve & Add to Regression Suite
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ScenarioEditor({
  scenario, onChange, onRemove,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  onRemove: () => void;
}) {
  const KIND_LABELS: Record<string, { label: string; color: string }> = {
    repro: { label: "Repro (negative)", color: "bg-red-50 text-red-700 border-red-200" },
    positive: { label: "Positive (happy path)", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    edge: { label: "Edge case", color: "bg-violet-50 text-violet-700 border-violet-200" },
  };
  const meta = KIND_LABELS[scenario.kind] ?? KIND_LABELS.repro;
  return (
    <Card className="p-3" data-testid={`scenario-editor-${scenario.kind}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge variant="outline" className={`text-[10px] font-semibold ${meta.color}`}>{meta.label}</Badge>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={onRemove}>
          <XCircle className="h-3 w-3 mr-1" /> Remove
        </Button>
      </div>
      <Input
        value={scenario.title}
        onChange={(e) => onChange({ ...scenario, title: e.target.value })}
        className="font-semibold mb-2"
      />
      <Textarea
        value={scenario.gherkin}
        onChange={(e) => onChange({ ...scenario, gherkin: e.target.value })}
        rows={6}
        className="font-mono text-xs"
      />
    </Card>
  );
}

function LineageView({ lineage, loading }: { lineage: any; loading: boolean }) {
  if (loading) return <Skeleton className="h-40" />;
  if (!lineage) return null;

  const status = lineage.overall_status as "protected" | "regressed" | "unverified";
  const statusMeta = {
    protected: { label: "Protected", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    regressed: { label: "Regressed", icon: ShieldX, color: "text-red-600 bg-red-50 border-red-200" },
    unverified: { label: "Unverified", icon: ShieldAlert, color: "text-slate-600 bg-slate-100 border-slate-200" },
  }[status];
  const StatusIcon = statusMeta.icon;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Lineage
        </h3>
        <Card className={`p-3 border ${statusMeta.color}`}>
          <div className="flex items-center gap-2">
            <StatusIcon className="h-5 w-5" />
            <div>
              <div className="font-semibold text-sm">{statusMeta.label}</div>
              <div className="text-xs opacity-80">
                Pass streak: {lineage.pass_streak_days} consecutive day{lineage.pass_streak_days === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Timeline</Label>
        <div className="relative mt-2 space-y-3 pl-5 border-l-2 border-border">
          {lineage.timeline.map((t: any, i: number) => (
            <div key={i} className="relative">
              <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {t.at ? new Date(t.at).toLocaleString() : ""} · {t.detail}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Regression tests ({lineage.tests.length})</Label>
        <div className="space-y-2">
          {lineage.tests.map((t: any) => (
            <Link
              key={t.test_case_id}
              href={`/test-suites/${t.test_suite_id}?focus=${t.test_case_id}`}
              className="block"
            >
              <Card className="p-3 hover-elevate cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{t.test_case_title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {t.runs.length} run{t.runs.length === 1 ? "" : "s"} · {t.pass_streak_days} day pass streak
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] capitalize ${
                    t.runs[0]?.status === "passed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    (t.runs[0]?.status === "failed" || t.runs[0]?.status === "error") ? "bg-red-50 text-red-700 border-red-200" :
                    "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>
                    {t.runs[0]?.status ?? "no runs"}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
