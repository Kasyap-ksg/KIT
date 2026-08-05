import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, Globe, Code, FileText, ExternalLink, Palette, Eye, Plus, TestTubes, Wand2, ArrowRight, Upload } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone } from "@/components/file-drop-zone";
import type { Application, DesignValidation, TestSuite } from "@/types";

interface Props {
  id: string;
}

export default function ApplicationDetail({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [docUrlDraft, setDocUrlDraft] = useState("");
  const [codeUrlDraft, setCodeUrlDraft] = useState("");
  const [attachedResourceName, setAttachedResourceName] = useState<string | null>(null);

  const updateResources = useMutation({
    mutationFn: async (data: { documentation_url: string; codebase_url: string }) => {
      const res = await apiRequest("PUT", `/api/applications/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications", id] });
      toast({ title: "Resources updated" });
      setResourcesOpen(false);
      setAttachedResourceName(null);
    },
    onError: () => toast({ title: "Failed to update resources", variant: "destructive" }),
  });

  const handleResourceFile = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/uploads/resource", { method: "POST", body: form });
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.url}`;
      setDocUrlDraft(fullUrl);
      setAttachedResourceName(file.name);
    } catch {
      toast({ title: "Failed to upload file", variant: "destructive" });
    }
  };

  const { data: app, isLoading } = useQuery<Application>({
    queryKey: ["/api/applications", id],
  });

  const { data: validations } = useQuery<DesignValidation[]>({
    queryKey: [`/api/design-validations?application_id=${id}`],
  });

  const { data: allSuites } = useQuery<TestSuite[]>({
    queryKey: ["/api/test-suites"],
  });
  const projectSuites = (allSuites ?? []).filter((s) => app && s.project_id === app.project_id);

  const { data: healing } = useQuery<{ proposals: Array<{ id: string; status: string; test_case_title: string; application_name: string; risk_level: string; test_suite_id: string | null }>; counts: { pending: number; applied: number; rejected: number; total: number } }>({
    queryKey: ["/api/healing/proposals"],
  });
  // Robust mapping: a healing proposal belongs to this app if its test_suite_id
  // is one of the suites under this app's project. Falls back to exact name match.
  const projectSuiteIds = new Set(projectSuites.map((s) => s.id));
  const appHealing = (healing?.proposals ?? []).filter((p) => {
    if (p.test_suite_id && projectSuiteIds.has(p.test_suite_id)) return true;
    if (app && p.application_name && p.application_name.toLowerCase() === app.name.toLowerCase()) return true;
    return false;
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!app) return null;

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" onClick={() => navigate("/applications")} className="gap-2" data-testid="button-back-apps">
        <ArrowLeft className="h-4 w-4" />
        Back to Applications
      </Button>

      <Card className="p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Globe className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-app-name">{app.name}</h1>
              <Badge variant="outline" className="capitalize border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                {app.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground capitalize mt-1">{app.app_type} application</p>
          </div>
          <div className="flex items-center gap-2">
            <SignalChip icon={TestTubes} label="Test Suites" value={projectSuites.length} accent="test-suites" />
            <SignalChip icon={Palette} label="Validations" value={validations?.length ?? 0} accent="design" />
            <SignalChip icon={Wand2} label="Healing" value={appHealing.length} accent="healing" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">Details</h3>
          <div className="space-y-3 text-sm">
            {app.description && (
              <div>
                <p className="text-muted-foreground text-xs mb-1">Description</p>
                <p>{app.description}</p>
              </div>
            )}
            {app.url && (
              <div>
                <p className="text-muted-foreground text-xs mb-1">Application URL</p>
                <a href={app.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  {app.url} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Resources</h3>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={() => { setDocUrlDraft(app.documentation_url || ""); setCodeUrlDraft(app.codebase_url || ""); setResourcesOpen(true); }}
              data-testid="button-upload-resources"
            >
              <Upload className="h-3 w-3" />
              Upload Resources
            </Button>
          </div>
          <div className="space-y-3">
            {app.documentation_url ? (
              <a href={app.documentation_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <FileText className="h-4 w-4" />
                Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                No documentation linked
              </p>
            )}
            {app.codebase_url ? (
              <a href={app.codebase_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <Code className="h-4 w-4" />
                Codebase
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Code className="h-4 w-4" />
                No codebase linked
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Cross-feature: Test Suites for this app's project */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center module-chip-test-suites">
              <TestTubes className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-none">Test Suites</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Suites running against this project</p>
            </div>
          </div>
          <Link href="/test-suites">
            <Button size="sm" variant="ghost" className="gap-1 text-xs" data-testid="button-all-suites">
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        {projectSuites.length === 0 ? (
          <Card className="p-6 text-center">
            <TestTubes className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No test suites for this project yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projectSuites.slice(0, 6).map((s) => (
              <Card
                key={s.id}
                className="p-4 hover:shadow-md transition-all cursor-pointer hover-elevate"
                onClick={() => navigate(`/test-suites/${s.id}`)}
                data-testid={`card-app-suite-${s.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center module-chip-test-suites shrink-0">
                    <TestTubes className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate">{s.name}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                      <StatusBadge value={s.status} />
                      <span className="text-[11px] text-muted-foreground">
                        {s.passed_cases}/{s.total_cases} passed
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Cross-feature: Healing activity */}
      {appHealing.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center module-chip-healing">
                <Wand2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-none">Self-Healing Activity</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">AI-proposed selector fixes for this app</p>
              </div>
            </div>
            <Link href="/self-healing">
              <Button size="sm" variant="ghost" className="gap-1 text-xs" data-testid="button-all-healing">
                Review all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
          <Card className="p-3">
            <div className="space-y-1">
              {appHealing.slice(0, 5).map((p) => (
                <Link key={p.id} href="/self-healing" className="block">
                  <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`app-healing-${p.id}`}>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.status === "pending" ? "bg-amber-500 live-dot" : p.status === "applied" ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-sm flex-1 truncate font-medium">{p.test_case_title}</span>
                    <Badge variant="outline" className="capitalize text-[10px] h-5">{p.risk_level} risk</Badge>
                    <Badge variant="outline" className="capitalize text-[10px] h-5">{p.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center module-chip-design">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-none">Design Validations</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Pixel & intent fidelity vs. spec</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/design-validation")}
            className="gap-1"
            data-testid="button-new-app-validation"
          >
            <Plus className="h-3.5 w-3.5" />
            New Validation
          </Button>
        </div>

        <Dialog open={resourcesOpen} onOpenChange={(open) => { setResourcesOpen(open); if (!open) setAttachedResourceName(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Resources</DialogTitle>
            <DialogDescription>Attach a file or link URLs for documentation and codebase.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Attach documentation file (auto-fills URL below)</Label>
              <FileDropZone
                onFile={handleResourceFile}
                accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg"
                label="Drag & drop or click to attach a resource file"
                attachedName={attachedResourceName ?? undefined}
                onClear={() => { setAttachedResourceName(null); setDocUrlDraft(""); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Documentation URL</Label>
              <Input
                placeholder="https://docs.example.com"
                value={docUrlDraft}
                onChange={(e) => setDocUrlDraft(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Codebase URL</Label>
              <Input
                placeholder="https://github.com/org/repo"
                value={codeUrlDraft}
                onChange={(e) => setCodeUrlDraft(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setResourcesOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateResources.mutate({ documentation_url: docUrlDraft, codebase_url: codeUrlDraft })}
              disabled={updateResources.isPending}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Save Resources
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!validations?.length ? (
          <Card className="p-6 text-center">
            <Palette className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No design validations for this application yet
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {validations.map((v) => (
              <Card
                key={v.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer hover-elevate"
                onClick={() => navigate(`/design-validation/${v.id}`)}
                data-testid={`card-app-validation-${v.id}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-sm">{v.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="capitalize text-xs">
                        {v.status.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {v.pages.length} page{v.pages.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {v.overall_score !== null && (
                      <span className={`text-2xl font-bold ${getScoreColor(v.overall_score)}`}>
                        {Math.round(v.overall_score)}%
                      </span>
                    )}
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SignalChip({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: "test-suites" | "design" | "healing" }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-center gap-2.5 min-w-[100px]">
      <div className={`h-7 w-7 rounded-md flex items-center justify-center module-chip-${accent}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div>
        <div className="text-lg font-bold tabular-nums leading-none text-foreground">{value}</div>
        <div className="text-[10px] font-medium text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}
