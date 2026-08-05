import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Upload,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Loader2,
  FileImage,
  Download,
  Camera,
  Wand2,
  Zap,
  Settings2,
  Eye,
  Monitor,
  Figma,
  Route,
  LayoutGrid,
  Palette,
  Component,
  Ruler,
  Layers,
  Shield,
  BarChart3,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DesignValidation, ComparisonResult, ColorComparison, DimensionComparison, TypographyComparison, SpacingComparison, StructuralAnalysis, StructuralDiffItem } from "@/types";

interface Props {
  id: string;
}

interface FigmaFrame {
  node_id: string;
  name: string;
  type: string;
}

interface LiveScreen {
  image: string;
  step_index: number;
  name: string;
  url?: string;
}

interface JourneyStep {
  index: number;
  name: string;
  figma_image: string;
  app_image: string;
  app_url: string;
  page_id: string;
}

interface ScreenResult {
  pageId: string;
  name: string;
  score: number | null;
  fidelityScores?: Record<string, number>;
}

export default function DesignValidationDetail({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [pageName, setPageName] = useState("");
  const [comparingPageId, setComparingPageId] = useState<string | null>(null);
  const [comparisonStream, setComparisonStream] = useState("");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [figmaImportOpen, setFigmaImportOpen] = useState(false);
  const [figmaToken, setFigmaToken] = useState("");
  const [figmaApiToken, setFigmaApiToken] = useState("");
  const [figmaPassword, setFigmaPassword] = useState("");
  const [figmaFrames, setFigmaFrames] = useState<FigmaFrame[]>([]);
  const [selectedFrames, setSelectedFrames] = useState<Set<string>>(new Set());
  const [fetchingFrames, setFetchingFrames] = useState(false);
  const [importingFrames, setImportingFrames] = useState(false);

  const [capturingPageId, setCapturingPageId] = useState<string | null>(null);
  const [httpUsername, setHttpUsername] = useState("");
  const [httpPassword, setHttpPassword] = useState("");
  const [editingUrls, setEditingUrls] = useState(false);
  const [editFigmaUrl, setEditFigmaUrl] = useState("");
  const [editAppUrl, setEditAppUrl] = useState("");

  const [quickRunning, setQuickRunning] = useState(false);
  const [quickStep, setQuickStep] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [screenStreams, setScreenStreams] = useState<Record<string, string>>({});
  const [activeScreenIndex, setActiveScreenIndex] = useState<number>(0);
  const [screenResults, setScreenResults] = useState<ScreenResult[]>([]);
  const [uxFlowStream, setUxFlowStream] = useState("");
  const [uxFlowResult, setUxFlowResult] = useState<any>(null);
  const [validationPhase, setValidationPhase] = useState<string>("init");

  const [figmaLiveScreens, setFigmaLiveScreens] = useState<LiveScreen[]>([]);
  const [appLiveScreens, setAppLiveScreens] = useState<LiveScreen[]>([]);
  const [figmaVideoUrl, setFigmaVideoUrl] = useState<string | null>(null);
  const [appVideoUrl, setAppVideoUrl] = useState<string | null>(null);
  const [journeySteps, setJourneySteps] = useState<JourneyStep[]>([]);
  const [journeyReport, setJourneyReport] = useState<any>(null);
  const [journeyStepResults, setJourneyStepResults] = useState<any[]>([]);
  const [journeyPlan, setJourneyPlan] = useState<any>(null);

  const { data: validation, isLoading } = useQuery<DesignValidation>({
    queryKey: ["/api/design-validations", id],
  });

  const updateUrlsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/design-validations/${id}`, {
        figma_url: editFigmaUrl,
        app_url: editAppUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
      setEditingUrls(false);
      toast({ title: "URLs updated" });
    },
  });

  const addPageMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("page_name", pageName);
      const res = await fetch(`/api/design-validations/${id}/pages`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
      setAddPageOpen(false);
      setPageName("");
      toast({ title: "Page added" });
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: async (pageId: string) => {
      await apiRequest("DELETE", `/api/design-validations/${id}/pages/${pageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
      toast({ title: "Page deleted" });
    },
  });

  const uploadImage = useCallback(
    async (pageId: string, type: "figma" | "app", file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/design-validations/${id}/pages/${pageId}/upload-${type}`,
        { method: "POST", body: form }
      );
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
      toast({ title: `${type === "figma" ? "Figma" : "App"} image uploaded` });
    },
    [id, toast]
  );

  const fetchFigmaFrames = useCallback(async () => {
    if (!figmaToken.trim() || !validation?.figma_url) return;
    setFetchingFrames(true);
    try {
      const res = await apiRequest("POST", "/api/design-validations/figma/frames", {
        figma_token: figmaToken,
        figma_url: validation.figma_url,
        figma_password: figmaPassword || undefined,
      });
      const data = await res.json();
      setFigmaFrames(data.frames || []);
      if (data.frames?.length === 0) {
        toast({ title: "No frames found" });
      } else {
        toast({ title: `Found ${data.frames.length} frames` });
      }
    } catch (err: any) {
      toast({ title: "Failed to fetch frames", description: err.message, variant: "destructive" });
    } finally {
      setFetchingFrames(false);
    }
  }, [figmaToken, figmaPassword, validation?.figma_url, toast]);

  const importSelectedFrames = useCallback(async () => {
    if (selectedFrames.size === 0) return;
    setImportingFrames(true);
    try {
      const frameIds = Array.from(selectedFrames);
      const frameNames = frameIds.map(
        (fid) => figmaFrames.find((f) => f.node_id === fid)?.name || "Untitled"
      );
      const res = await apiRequest("POST", `/api/design-validations/${id}/import-figma`, {
        figma_token: figmaToken,
        figma_url: validation?.figma_url || "",
        frame_ids: frameIds,
        frame_names: frameNames,
        figma_password: figmaPassword || undefined,
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
      setFigmaImportOpen(false);
      setSelectedFrames(new Set());
      setFigmaFrames([]);
      toast({ title: `Imported ${data.imported} frames` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportingFrames(false);
    }
  }, [selectedFrames, figmaFrames, figmaToken, figmaPassword, validation?.figma_url, id, toast]);

  const captureFromFigmaBrowser = useCallback(async () => {
    if (!validation?.figma_url) return;
    setImportingFrames(true);
    try {
      const res = await apiRequest("POST", `/api/design-validations/${id}/import-figma`, {
        figma_url: validation.figma_url,
        figma_password: figmaPassword || undefined,
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
      setFigmaImportOpen(false);
      toast({ title: `Captured ${data.imported} page(s) from Figma` });
    } catch (err: any) {
      toast({ title: "Capture failed", description: err.message, variant: "destructive" });
    } finally {
      setImportingFrames(false);
    }
  }, [figmaPassword, validation?.figma_url, id, toast]);

  const captureAppScreenshot = useCallback(
    async (pageId: string, url: string) => {
      setCapturingPageId(pageId);
      try {
        const body: Record<string, any> = { url, wait_seconds: 3, viewport_width: 1440, viewport_height: 900, full_page: true };
        if (httpUsername || httpPassword) {
          body.http_username = httpUsername;
          body.http_password = httpPassword;
        }
        const res = await apiRequest("POST", `/api/design-validations/${id}/pages/${pageId}/capture-app`, body);
        await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
        toast({ title: "App screenshot captured" });
      } catch (err: any) {
        toast({ title: "Capture failed", description: err.message, variant: "destructive" });
      } finally {
        setCapturingPageId(null);
      }
    },
    [id, toast, httpUsername, httpPassword]
  );

  const runComparison = useCallback(
    async (pageId: string) => {
      setComparingPageId(pageId);
      setComparisonStream("");
      setSelectedPageId(pageId);

      try {
        const res = await fetch(`/api/design-validations/${id}/pages/${pageId}/compare`, { method: "POST" });
        if (!res.ok) throw new Error(await res.text());
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader");
        const decoder = new TextDecoder();
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) { accumulated += data.content; setComparisonStream(accumulated); }
                if (data.done) { queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] }); }
                if (data.error) { toast({ title: "Comparison error", description: data.error, variant: "destructive" }); }
              } catch {}
            }
          }
        }
      } catch (err: any) {
        toast({ title: "Comparison failed", description: err.message, variant: "destructive" });
      } finally {
        setComparingPageId(null);
      }
    },
    [id, toast]
  );

  const runQuickValidation = useCallback(async () => {
    if (!validation?.figma_url || !validation?.app_url) return;
    setQuickRunning(true);
    setComparisonStream("");
    setScreenStreams({});
    setScreenResults([]);
    setUxFlowStream("");
    setUxFlowResult(null);
    setValidationPhase("init");
    setActiveScreenIndex(0);
    setFigmaLiveScreens([]);
    setAppLiveScreens([]);
    setFigmaVideoUrl(null);
    setAppVideoUrl(null);
    setJourneySteps([]);
    setJourneyReport(null);
    setJourneyStepResults([]);
    setJourneyPlan(null);

    try {
      const body: Record<string, any> = {
        figma_password: figmaPassword || undefined,
        figma_token: figmaApiToken || undefined,
        viewport_width: 1440,
        viewport_height: 900,
        wait_seconds: 5,
        max_screens: 10,
      };
      if (httpUsername) body.http_username = httpUsername;
      if (httpPassword) body.http_password = httpPassword;

      const res = await fetch(`/api/design-validations/${id}/run-full-validation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(await res.text());

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      const streamAccum: Record<string, string> = {};
      let uxAccum = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));

              if (d.step) setQuickStep(d.step);
              if (d.phase) setValidationPhase(d.phase);

              if (d.figma_live) {
                setFigmaLiveScreens(prev => {
                  const existing = prev.findIndex(s => s.step_index === d.figma_live.step_index);
                  if (existing >= 0) { const next = [...prev]; next[existing] = d.figma_live; return next; }
                  return [...prev, d.figma_live];
                });
              }

              if (d.app_live) {
                setAppLiveScreens(prev => {
                  const existing = prev.findIndex(s => s.step_index === d.app_live.step_index);
                  if (existing >= 0) { const next = [...prev]; next[existing] = d.app_live; return next; }
                  return [...prev, d.app_live];
                });
              }

              if (d.figma_video) { setFigmaVideoUrl(d.figma_video); }
              if (d.app_video) { setAppVideoUrl(d.app_video); }

              if (d.journey_step) {
                setJourneySteps(prev => [...prev, d.journey_step]);
              }

              if (d.screen_index !== undefined && d.step) {
                setActiveScreenIndex(d.screen_index);
                if (d.page_id) { setSelectedPageId(d.page_id); setComparingPageId(d.page_id); }
              }

              if (d.content && d.screen_index !== undefined) {
                const key = String(d.screen_index);
                streamAccum[key] = (streamAccum[key] || "") + d.content;
                setScreenStreams({ ...streamAccum });
                setComparisonStream(streamAccum[key]);
              }

              if (d.ux_flow_content) { uxAccum += d.ux_flow_content; setUxFlowStream(uxAccum); }

              if (d.screen_done) {
                setScreenResults(prev => [...prev, {
                  pageId: d.page_id, name: d.screen_name, score: d.score,
                  fidelityScores: d.fidelity_scores || undefined,
                }]);
                setComparingPageId(null);
              }

              if (d.ux_flow_done && d.ux_flow_result) { setUxFlowResult(d.ux_flow_result); }

              if (d.journey_plan) { setJourneyPlan(d.journey_plan); }
              if (d.journey_report) { setJourneyReport(d.journey_report); }

              if (d.journey_step_result) {
                setJourneyStepResults(prev => [...prev, d.journey_step_result]);
              }

              if (d.done) {
                if (d.journey_report) { setJourneyReport(d.journey_report); }
                setComparingPageId(null);
                setValidationPhase("done");
                await queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
                toast({ title: `Validation complete! ${d.total_screens || ""} screens analyzed.` });
              }
              if (d.error) {
                setComparingPageId(null);
                toast({ title: "Validation error", description: d.error, variant: "destructive" });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Validation failed", description: err.message, variant: "destructive" });
    } finally {
      setQuickRunning(false);
      setQuickStep("");
    }
  }, [validation, figmaPassword, figmaApiToken, httpUsername, httpPassword, id, toast]);

  const parseFindings = (findingsStr: string): ComparisonResult | null => {
    if (!findingsStr) return null;
    try { return JSON.parse(findingsStr); } catch { return null; }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300";
    if (score >= 60) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300";
    return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!validation) return null;

  const hasBothUrls = !!(validation.figma_url && validation.app_url);
  const hasResults = validation.pages.some((p) => p.status === "compared");

  const toggleFrame = (nodeId: string) => {
    setSelectedFrames((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const latestFigmaScreen = figmaLiveScreens.length > 0 ? figmaLiveScreens[figmaLiveScreens.length - 1] : null;
  const latestAppScreen = appLiveScreens.length > 0 ? appLiveScreens[appLiveScreens.length - 1] : null;

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" onClick={() => navigate("/design-validation")} className="gap-2" data-testid="button-back-validations">
        <ArrowLeft className="h-4 w-4" /> Back to Validations
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-validation-name">{validation.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {validation.application_name && <Badge variant="secondary">{validation.application_name}</Badge>}
            <Badge variant={validation.status === "completed" ? "default" : validation.status === "in_progress" ? "secondary" : "outline"} className="capitalize">
              {validation.status.replace("_", " ")}
            </Badge>
          </div>
        </div>
        {validation.overall_score !== null && (
          <div className="text-right">
            <div className={`text-4xl font-bold ${getScoreColor(validation.overall_score)}`}>{Math.round(validation.overall_score)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Overall Score</p>
          </div>
        )}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">URLs</h3>
          {!editingUrls ? (
            <Button variant="ghost" size="sm" onClick={() => { setEditFigmaUrl(validation.figma_url || ""); setEditAppUrl(validation.app_url || ""); setEditingUrls(true); }} data-testid="button-edit-urls">Edit</Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditingUrls(false)}>Cancel</Button>
              <Button size="sm" onClick={() => updateUrlsMutation.mutate()} disabled={updateUrlsMutation.isPending} data-testid="button-save-urls">
                {updateUrlsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          )}
        </div>
        {editingUrls ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Figma Design URL</Label>
              <Input value={editFigmaUrl} onChange={(e) => setEditFigmaUrl(e.target.value)} placeholder="https://figma.com/design/..." data-testid="input-edit-figma-url" />
            </div>
            <div>
              <Label className="text-xs">Application URL</Label>
              <Input value={editAppUrl} onChange={(e) => setEditAppUrl(e.target.value)} placeholder="https://your-app.com" data-testid="input-edit-app-url" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground shrink-0">Figma:</span>
              {validation.figma_url ? (
                <a href={validation.figma_url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 flex items-center gap-1 truncate" data-testid="link-figma-url">
                  <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{validation.figma_url.replace(/https?:\/\//, '')}</span>
                </a>
              ) : <span className="text-orange-500">Not set — click Edit</span>}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground shrink-0">App:</span>
              {validation.app_url ? (
                <a href={validation.app_url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 flex items-center gap-1 truncate" data-testid="link-app-url">
                  <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{validation.app_url.replace(/https?:\/\//, '')}</span>
                </a>
              ) : <span className="text-orange-500">Not set — click Edit</span>}
            </div>
          </div>
        )}
      </Card>

      {hasBothUrls && (
        <Card className="p-6 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-200/60 dark:border-indigo-800/50">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-indigo-500/10">
              <Route className="h-6 w-6 text-indigo-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Prototype Journey Validation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                The AI crawls your Figma prototype screen by screen. For each prototype screen, it analyzes
                the current app state and automatically navigates the live app to match that screen — filling
                forms, clicking buttons, selecting options with synthetic test data. Only after the app matches
                each prototype screen does the comparison begin. Deep DOM analysis extracts colors, typography,
                spacing, layout, icons, and component structure for evidence-based comparison.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Figma API Token <span className="text-muted-foreground">(recommended — enables high-quality frame rendering via API)</span></Label>
                  <Input type="password" value={figmaApiToken} onChange={(e) => setFigmaApiToken(e.target.value)}
                    placeholder="figd_xxxxx..." className="mt-1" data-testid="input-quick-figma-token" />
                </div>
                <div>
                  <Label className="text-xs">Figma File Password</Label>
                  <Input type="password" value={figmaPassword} onChange={(e) => setFigmaPassword(e.target.value)}
                    placeholder="Enter Figma file password (if protected)" className="mt-1" data-testid="input-quick-figma-password" />
                </div>
                <div className="flex gap-2">
                  <Input value={httpUsername} onChange={(e) => setHttpUsername(e.target.value)}
                    placeholder="App username (optional)" className="text-sm" data-testid="input-quick-http-username" />
                  <Input type="password" value={httpPassword} onChange={(e) => setHttpPassword(e.target.value)}
                    placeholder="App password (optional)" className="text-sm" data-testid="input-quick-http-password" />
                </div>

                <Button onClick={runQuickValidation} disabled={quickRunning} size="lg" className="w-full gap-2 h-12 text-base" data-testid="button-quick-validate">
                  {quickRunning ? (
                    <><Loader2 className="h-5 w-5 animate-spin" />{quickStep ? quickStep.substring(0, 80) : "Starting..."}</>
                  ) : (
                    <><Route className="h-5 w-5" />{hasResults ? "Re-run Journey Validation" : "Run Journey Validation"}</>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center -mt-1">
                  AI automatically analyzes the Figma prototype, identifies the user journey, then replays it on the live app with test data.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {quickRunning && (
        <LiveBrowserView
          phase={validationPhase}
          step={quickStep}
          figmaScreens={figmaLiveScreens}
          appScreens={appLiveScreens}
          latestFigma={latestFigmaScreen}
          latestApp={latestAppScreen}
          figmaVideoUrl={figmaVideoUrl}
          appVideoUrl={appVideoUrl}
        />
      )}

      {quickRunning && journeySteps.length > 0 && (validationPhase === "pairing" || validationPhase === "analysis" || validationPhase === "ux_flow") && (
        <Card className="p-5" data-testid="card-journey-progress">
          <div className="flex items-center gap-2 mb-4">
            <Route className="h-5 w-5 text-indigo-500" />
            <h3 className="font-semibold">Journey Screens — {screenResults.length}/{journeySteps.length} Analyzed</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {journeySteps.map((js, i) => {
              const result = screenResults.find(sr => sr.pageId === js.page_id);
              const isActive = activeScreenIndex === i && !result;
              return (
                <div key={js.page_id}
                  className={`border rounded-lg overflow-hidden transition-all ${isActive ? "ring-2 ring-indigo-500 border-indigo-300" : result ? "border-muted" : "border-dashed"}`}
                  data-testid={`journey-step-${i}`}
                >
                  <div className="relative h-20 bg-muted/30">
                    {js.figma_image && <img src={js.figma_image} alt={js.name} className="w-full h-full object-cover" />}
                    {isActive && (
                      <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                      </div>
                    )}
                  </div>
                  <div className="p-2 text-center">
                    {result && result.score !== null ? (
                      <div className={`text-lg font-bold ${getScoreColor(result.score)}`}>{Math.round(result.score)}%</div>
                    ) : isActive ? (
                      <div className="text-xs text-indigo-500 font-medium">Analyzing...</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Pending</div>
                    )}
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{js.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {quickStep && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded mt-3">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" /> {quickStep}
            </div>
          )}
        </Card>
      )}

      {quickRunning && validationPhase === "ux_flow" && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <h3 className="font-semibold">UX Flow Analysis in Progress</h3>
          </div>
          <pre className="text-sm whitespace-pre-wrap text-muted-foreground bg-muted/30 p-4 rounded-md max-h-96 overflow-auto">
            {uxFlowStream || "Analyzing cross-screen navigation and flow..."}
          </pre>
        </Card>
      )}

      {validation.status === "completed" && (
        <Card className="p-4 flex items-center justify-between bg-gradient-to-r from-green-500/5 to-emerald-500/5 border-green-200/60 dark:border-green-800/50">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-sm">Validation Complete</p>
              <p className="text-xs text-muted-foreground">View the full evidence-based report with color comparisons, dimensions, and typography analysis</p>
            </div>
          </div>
          <Button
            onClick={() => window.open(`/api/design-validations/${id}/report`, '_blank')}
            className="gap-2"
            data-testid="button-view-full-report"
          >
            <ExternalLink className="h-4 w-4" /> View Full Report
          </Button>
        </Card>
      )}

      {(validation.figma_video_path || validation.app_video_path || figmaVideoUrl || appVideoUrl) && (
        <Card className="overflow-hidden border-2 border-indigo-200 dark:border-indigo-800" data-testid="card-journey-recordings">
          <div className="p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-b flex items-center gap-3">
            <Play className="h-4 w-4 text-indigo-600" />
            <h3 className="font-semibold">Journey Recordings</h3>
            <Badge variant="secondary" className="text-xs">Video Playback</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <div className="p-4 border-r">
              <div className="flex items-center gap-2 mb-3">
                <Figma className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Figma Prototype</span>
              </div>
              {(figmaVideoUrl || validation.figma_video_path) ? (
                <div className="rounded-lg overflow-hidden border bg-black">
                  <video
                    src={figmaVideoUrl || validation.figma_video_path}
                    controls
                    playsInline
                    muted
                    className="w-full h-auto"
                    data-testid="video-figma-recording"
                  />
                </div>
              ) : (
                <div className="h-48 border-2 border-dashed rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">No Figma recording available</p>
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Monitor className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Live Application</span>
              </div>
              {(appVideoUrl || validation.app_video_path) ? (
                <div className="rounded-lg overflow-hidden border bg-black">
                  <video
                    src={appVideoUrl || validation.app_video_path}
                    controls
                    playsInline
                    muted
                    className="w-full h-auto"
                    data-testid="video-app-recording"
                  />
                </div>
              ) : (
                <div className="h-48 border-2 border-dashed rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">No app recording available</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {validation.pages.length === 0 && !quickRunning ? (
        <Card className="p-8 text-center">
          <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-2">No pages added yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            {hasBothUrls
              ? 'Click "Run Journey Validation" above to automatically capture and compare, or add pages manually'
              : "Set both URLs above, then run journey validation"}
          </p>
        </Card>
      ) : validation.pages.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Screens ({validation.pages.length})</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="gap-1 text-muted-foreground" data-testid="button-toggle-advanced">
              <Settings2 className="h-3.5 w-3.5" />
              {showAdvanced ? "Hide" : "Show"} Manual Tools
            </Button>
          </div>

          {validation.pages.filter(p => p.status === "compared" && p.figma_image_path && p.app_image_path).length > 0 && (
            <div className="space-y-6">
              {validation.pages.filter(p => p.status === "compared").map((page) => {
                const findings = parseFindings(page.findings);
                return (
                  <Card key={page.id} className="overflow-hidden" data-testid={`screen-result-${page.id}`}>
                    <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Layers className="h-4 w-4 text-indigo-500" />
                        {page.page_name}
                      </h3>
                      {page.compliance_score !== null && (
                        <Badge className={`text-sm ${getScoreBg(page.compliance_score)}`}>
                          {Math.round(page.compliance_score)}% Match
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                      <div className="p-3 border-r border-b md:border-b-0">
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider flex items-center gap-1.5">
                          <Figma className="h-3 w-3" /> Figma Prototype
                        </p>
                        {page.figma_image_path && (
                          <img src={page.figma_image_path} alt={`${page.page_name} - Figma`}
                            className="w-full h-auto max-h-96 object-contain rounded border bg-muted/30" />
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider flex items-center gap-1.5">
                          <Monitor className="h-3 w-3" /> Live Application
                        </p>
                        {page.app_image_path && (
                          <img src={page.app_image_path} alt={`${page.page_name} - App`}
                            className="w-full h-auto max-h-96 object-contain rounded border bg-muted/30" />
                        )}
                      </div>
                    </div>

                    {findings && (
                      <div className="p-4 border-t">
                        <FidelityDashboard findings={findings} journeyReport={journeyReport} pageName={page.page_name} uxFlowResult={uxFlowResult} />
                        <ComparisonResults findings={findings} streamContent="" isStreaming={false} pageName={page.page_name} embedded />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {showAdvanced && (
            <>
              <Card className="p-4 border-dashed">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-purple-500" /> Manual Tools
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Import designs from Figma</p>
                    <Dialog open={figmaImportOpen} onOpenChange={setFigmaImportOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2" disabled={!validation.figma_url} data-testid="button-import-figma">
                          <Download className="h-4 w-4" /> Import from Figma
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>Import from Figma</DialogTitle></DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div className="p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/50">
                            <h4 className="font-medium text-sm mb-2 flex items-center gap-2"><Camera className="h-4 w-4 text-blue-500" /> With File Password</h4>
                            <div className="space-y-2">
                              <Input type="password" value={figmaPassword} onChange={(e) => setFigmaPassword(e.target.value)} placeholder="Enter Figma file password" data-testid="input-figma-password" />
                              <Button onClick={captureFromFigmaBrowser} disabled={!figmaPassword.trim() || importingFrames} className="w-full gap-2" data-testid="button-capture-figma">
                                {importingFrames ? <><Loader2 className="h-4 w-4 animate-spin" /> Capturing...</> : <><Camera className="h-4 w-4" /> Capture from Figma</>}
                              </Button>
                            </div>
                          </div>
                          <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                            <div className="relative flex justify-center text-xs uppercase">
                              <span className="bg-background px-2 text-muted-foreground">or API token</span>
                            </div>
                          </div>
                          <div className="space-y-3 opacity-80">
                            <div>
                              <Label className="text-xs">Personal Access Token</Label>
                              <Input type="password" value={figmaToken} onChange={(e) => setFigmaToken(e.target.value)} placeholder="figd_..." className="text-sm" data-testid="input-figma-token" />
                            </div>
                            <Button variant="outline" onClick={fetchFigmaFrames} disabled={!figmaToken.trim() || fetchingFrames} className="w-full gap-2" data-testid="button-fetch-frames">
                              {fetchingFrames ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching...</> : <><Download className="h-4 w-4" /> Fetch Frames</>}
                            </Button>
                          </div>
                          {figmaFrames.length > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <Label>Select frames ({selectedFrames.size})</Label>
                                <Button variant="ghost" size="sm" onClick={() => { setSelectedFrames(selectedFrames.size === figmaFrames.length ? new Set() : new Set(figmaFrames.map(f => f.node_id))); }}>
                                  {selectedFrames.size === figmaFrames.length ? "Deselect" : "Select All"}
                                </Button>
                              </div>
                              <div className="max-h-48 overflow-auto border rounded-md p-2 space-y-1">
                                {figmaFrames.map(frame => (
                                  <label key={frame.node_id} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer">
                                    <Checkbox checked={selectedFrames.has(frame.node_id)} onCheckedChange={() => toggleFrame(frame.node_id)} />
                                    <span className="text-sm">{frame.name}</span>
                                  </label>
                                ))}
                              </div>
                              <Button onClick={importSelectedFrames} disabled={selectedFrames.size === 0 || importingFrames} className="w-full mt-3 gap-2" data-testid="button-import-selected">
                                {importingFrames ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</> :
                                  <><Download className="h-4 w-4" /> Import {selectedFrames.size} Frame{selectedFrames.size !== 1 ? "s" : ""}</>}
                              </Button>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Add a manual page</p>
                    <Dialog open={addPageOpen} onOpenChange={setAddPageOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" data-testid="button-add-page"><Plus className="h-4 w-4 mr-1" /> Add Page</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Page for Comparison</DialogTitle></DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div>
                            <Label>Page / Screen Name</Label>
                            <Input value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder="e.g. Homepage, Login, Dashboard" data-testid="input-page-name" />
                          </div>
                          <Button onClick={() => addPageMutation.mutate()} disabled={!pageName.trim() || addPageMutation.isPending} className="w-full" data-testid="button-create-page">Add Page</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </Card>

              {validation.pages.filter(p => p.status !== "compared").length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Pending Screens</h3>
                  {validation.pages.filter(p => p.status !== "compared").map((page) => (
                    <PageComparisonCard key={page.id} page={page} isComparing={comparingPageId === page.id} isSelected={selectedPageId === page.id}
                      isCapturing={capturingPageId === page.id} captureUrl={validation.app_url || ""} onUpload={uploadImage}
                      onCompare={runComparison} onDelete={(pageId) => deletePageMutation.mutate(pageId)}
                      onSelect={(pageId) => setSelectedPageId(pageId === selectedPageId ? null : pageId)} onCapture={captureAppScreenshot} />
                  ))}
                </div>
              )}
            </>
          )}

          {comparingPageId && comparisonStream && !validation.pages.find(p => p.id === comparingPageId && p.status === "compared") && (
            <ComparisonResults findings={null} streamContent={comparisonStream} isStreaming={true}
              pageName={validation.pages.find(p => p.id === comparingPageId)?.page_name || "Analyzing..."} />
          )}
        </>
      ) : null}

      {journeyPlan && !journeyReport && (
        <Card className="p-4 border-indigo-200 dark:border-indigo-800" data-testid="card-journey-plan">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 className="h-5 w-5 text-indigo-500" />
            <h3 className="font-semibold">AI-Generated Journey Plan</h3>
            <Badge variant="secondary">{journeyPlan.total_steps} steps</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{journeyPlan.name}: {journeyPlan.description}</p>
          <div className="space-y-1">
            {(journeyPlan.steps || []).map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30" data-testid={`plan-step-${i}`}>
                <span className="text-muted-foreground w-5 shrink-0">{i + 1}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{s.action}</Badge>
                <span className="truncate">{s.description}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {journeyReport && <JourneyConformanceReport report={journeyReport} stepResults={journeyStepResults} />}

      {uxFlowResult && <UxFlowResults result={uxFlowResult} />}

      {validation.summary && (
        <Card className="p-5">
          <h3 className="font-semibold mb-2">Overall Summary</h3>
          <p className="text-sm text-muted-foreground">{validation.summary}</p>
        </Card>
      )}
    </div>
  );
}


function JourneyConformanceReport({ report, stepResults }: { report: any; stepResults: any[] }) {
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const scores = report?.scores || {};
  const summary = report?.summary || {};
  const verdict = report?.verdict || "N/A";
  const stepDetails = report?.step_details || [];
  const frictionPoints = report?.friction_points || [];

  const getVerdictColor = (v: string) => {
    if (v.toLowerCase().includes("strong")) return "text-green-600 bg-green-100 dark:bg-green-950 dark:text-green-300";
    if (v.toLowerCase().includes("partial") || v.toLowerCase().includes("acceptable")) return "text-yellow-600 bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300";
    return "text-red-600 bg-red-100 dark:bg-red-950 dark:text-red-300";
  };

  const getStatusIcon = (status: string) => {
    if (status === "passed") return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    if (status === "skipped") return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <Card className="overflow-hidden" data-testid="card-journey-conformance">
      <div className="p-4 bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-b flex items-center gap-3">
        <Route className="h-5 w-5 text-orange-500" />
        <h3 className="font-semibold">Journey Conformance Report</h3>
        {report?.journey_name && <span className="text-sm text-muted-foreground">— {report.journey_name}</span>}
        <Badge className={`ml-auto ${getVerdictColor(verdict)}`}>{verdict}</Badge>
      </div>

      <div className="p-4 space-y-4">
        {report?.journey_description && (
          <p className="text-sm text-muted-foreground">{report.journey_description}</p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold" data-testid="score-execution">{scores.execution || 0}%</div>
            <div className="text-xs text-muted-foreground">Execution Score</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold" data-testid="score-friction">{scores.friction || 0}%</div>
            <div className="text-xs text-muted-foreground">Friction Score</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold" data-testid="score-overall-journey">{scores.overall || 0}%</div>
            <div className="text-xs text-muted-foreground">Overall</div>
          </div>
        </div>

        <div className="flex gap-4 text-sm p-3 rounded-lg border bg-muted/30">
          <div><span className="text-muted-foreground">Total steps:</span> <strong>{summary.total_steps || 0}</strong></div>
          <div><span className="text-green-600">Passed:</span> <strong>{summary.passed || 0}</strong></div>
          <div><span className="text-red-600">Failed:</span> <strong>{summary.failed || 0}</strong></div>
          <div><span className="text-yellow-600">Skipped:</span> <strong>{summary.skipped || 0}</strong></div>
          <div><span className="text-muted-foreground">Proto screens:</span> <strong>{summary.proto_screens || 0}</strong></div>
        </div>

        {stepDetails.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Step-by-Step Execution</h4>
            <div className="space-y-4">
              {stepDetails.map((sd: any, i: number) => (
                <div key={i} className="rounded-lg border bg-muted/20 overflow-hidden" data-testid={`step-detail-${i}`}>
                  <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
                    <span className="font-mono text-sm font-bold text-muted-foreground w-6 text-center">{sd.step_index}</span>
                    {getStatusIcon(sd.app_status)}
                    <Badge variant="outline" className="text-xs">{sd.action}</Badge>
                    <span className="flex-1 text-sm">{sd.description}</span>
                    {sd.app_error && (
                      <span className="text-red-500 text-xs bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded">{sd.app_error}</span>
                    )}
                  </div>
                  {(sd.proto_screenshot || sd.app_screenshot) && (
                    <div className="grid grid-cols-2 gap-px bg-border">
                      <div className="bg-background p-2">
                        <div className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Prototype</div>
                        {sd.proto_screenshot ? (
                          <img
                            src={sd.proto_screenshot}
                            alt="prototype"
                            className="w-full h-auto rounded border cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setLightboxImg(sd.proto_screenshot)}
                            data-testid={`img-proto-step-${i}`}
                          />
                        ) : (
                          <div className="w-full h-32 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">No prototype screenshot</div>
                        )}
                      </div>
                      <div className="bg-background p-2">
                        <div className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Application</div>
                        {sd.app_screenshot ? (
                          <img
                            src={sd.app_screenshot}
                            alt="app"
                            className="w-full h-auto rounded border cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setLightboxImg(sd.app_screenshot)}
                            data-testid={`img-app-step-${i}`}
                          />
                        ) : (
                          <div className="w-full h-32 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">No app screenshot</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {frictionPoints.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-red-600">Friction Points ({frictionPoints.length})</h4>
            <div className="space-y-1">
              {frictionPoints.map((fp: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs p-2 rounded border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" data-testid={`friction-point-${i}`}>
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">Step {fp.step}: {fp.description}</span>
                    {fp.error && <span className="text-muted-foreground ml-1">— {fp.error}</span>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{fp.type}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {stepResults.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Live Execution Timeline</h4>
            <div className="space-y-1">
              {stepResults.filter(r => r.side === "app").map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  {getStatusIcon(r.status)}
                  <span className="text-muted-foreground">{r.step_index}.</span>
                  <span className="truncate">{r.description || r.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setLightboxImg(null)}
          data-testid="lightbox-overlay"
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={lightboxImg}
              alt="Full size screenshot"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute -top-3 -right-3 bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              data-testid="button-close-lightbox"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}


function LiveBrowserView({ phase, step, figmaScreens, appScreens, latestFigma, latestApp, figmaVideoUrl, appVideoUrl }: {
  phase: string; step: string;
  figmaScreens: LiveScreen[]; appScreens: LiveScreen[];
  latestFigma: LiveScreen | null; latestApp: LiveScreen | null;
  figmaVideoUrl: string | null; appVideoUrl: string | null;
}) {
  const phaseLabel = phase === "figma_crawl" ? "Recording Figma Prototype Journey" :
    phase === "app_crawl" ? "Recording Application Journey" :
    phase === "app_journey" ? "Recording App Navigation" :
    phase === "figma_tokens" ? "Extracting Figma Design Tokens" :
    phase === "browsers" ? "Launching Browsers" :
    phase === "journey_analysis" ? "AI Analyzing Screen Navigation" :
    phase === "pairing" ? "Pairing Screens" :
    phase === "analysis" ? "AI Analysis Running" :
    phase === "judge" ? "LLM Judge Validating" :
    phase === "ux_flow" ? "UX Flow Analysis" :
    phase === "journey_comparison" ? "Journey Conformance" :
    phase === "done" ? "Complete" : "Initializing...";

  const isComplete = phase === "pairing" || phase === "analysis" || phase === "judge" || phase === "ux_flow" || phase === "journey_comparison" || phase === "done";
  const isAppActive = phase === "app_journey" || phase === "app_crawl";
  const isFigmaActive = phase === "figma_crawl";

  return (
    <Card className="overflow-hidden border-2 border-indigo-200 dark:border-indigo-800" data-testid="card-live-browsers">
      <div className="p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-b flex items-center gap-3">
        <div className="relative">
          <div className={`h-3 w-3 rounded-full ${isComplete ? "bg-green-500" : "bg-green-500 animate-pulse"}`} />
        </div>
        <h3 className="font-semibold">Live Validation — {phaseLabel}</h3>
        <Badge variant="secondary" className="ml-auto text-xs">
          {phase === "figma_crawl" ? `${figmaScreens.length} screen(s)` :
           phase === "app_crawl" ? `${appScreens.length} page(s)` :
           isComplete ? `${figmaScreens.length} + ${appScreens.length} captured` : "..."}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        <div className={`p-4 border-r ${isFigmaActive ? "bg-indigo-50/30 dark:bg-indigo-950/20" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <Figma className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Figma Prototype</span>
            {figmaScreens.length > 0 && <span className="text-xs text-muted-foreground">({figmaScreens.length})</span>}
            {isFigmaActive && !figmaVideoUrl && <Loader2 className="h-3 w-3 animate-spin text-indigo-500 ml-auto" />}
            {(figmaVideoUrl || isComplete) && figmaScreens.length > 0 && <CheckCircle className="h-3 w-3 text-green-500 ml-auto" />}
          </div>

          {figmaVideoUrl ? (
            <div className="rounded-lg overflow-hidden border bg-black min-h-[240px]">
              <video
                src={figmaVideoUrl}
                autoPlay
                loop
                muted
                controls
                playsInline
                className="w-full h-auto"
                data-testid="video-figma-live"
              />
            </div>
          ) : isFigmaActive || latestFigma ? (
            <div className="relative rounded-lg overflow-hidden border bg-gray-100 dark:bg-gray-800 min-h-[240px]">
              {latestFigma ? (
                <>
                  <img src={latestFigma.image} alt={latestFigma.name} className="w-full h-auto object-contain" data-testid="img-figma-live" />
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-indigo-500 text-white text-xs shadow-md">{latestFigma.name}</Badge>
                  </div>
                  {isFigmaActive && (
                    <div className="absolute bottom-2 left-2">
                      <Badge variant="outline" className="text-[10px] border-indigo-400 text-indigo-600 bg-white/80 dark:bg-black/60 animate-pulse">RECORDING</Badge>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Recording prototype journey...</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-48 border-2 border-dashed rounded-lg flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No Figma frames captured</p>
            </div>
          )}
        </div>

        <div className={`p-4 ${isAppActive ? "bg-blue-50/30 dark:bg-blue-950/20" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Live Application</span>
            {appScreens.length > 0 && <span className="text-xs text-muted-foreground">({appScreens.length})</span>}
            {isAppActive && !appVideoUrl && <Loader2 className="h-3 w-3 animate-spin text-blue-500 ml-auto" />}
            {(appVideoUrl || (isComplete && appScreens.length > 0)) && <CheckCircle className="h-3 w-3 text-green-500 ml-auto" />}
          </div>

          {appVideoUrl ? (
            <div className="rounded-lg overflow-hidden border bg-black min-h-[240px]">
              <video
                src={appVideoUrl}
                autoPlay
                loop
                muted
                controls
                playsInline
                className="w-full h-auto"
                data-testid="video-app-live"
              />
            </div>
          ) : isAppActive || latestApp ? (
            <div className="relative rounded-lg overflow-hidden border bg-gray-100 dark:bg-gray-800 min-h-[240px]">
              {latestApp ? (
                <>
                  <img src={latestApp.image} alt={latestApp.name} className="w-full h-auto object-contain" data-testid="img-app-live" />
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-blue-500 text-white text-xs shadow-md">{latestApp.name}</Badge>
                  </div>
                  {isAppActive && (
                    <div className="absolute bottom-2 left-2">
                      <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-600 bg-white/80 dark:bg-black/60 animate-pulse">RECORDING</Badge>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Recording app navigation...</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-48 border-2 border-dashed rounded-lg flex items-center justify-center">
              {isFigmaActive || phase === "browsers" || phase === "init" ? (
                <div className="text-center text-muted-foreground">
                  <Monitor className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Waiting for Figma to finish...</p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Monitor className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No app recording yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-2.5 border-t bg-muted/20 flex items-center gap-2">
        {isComplete ? (
          <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
        ) : (
          <Loader2 className="h-3 w-3 animate-spin text-indigo-500 shrink-0" />
        )}
        <p className="text-xs text-muted-foreground truncate flex-1">{step || (isComplete ? "Recording complete — videos captured" : "Processing...")}</p>
        {isAppActive && !appVideoUrl && (
          <Badge variant="outline" className="text-[10px] shrink-0 border-red-300 text-red-600 animate-pulse">REC</Badge>
        )}
        {isFigmaActive && !figmaVideoUrl && (
          <Badge variant="outline" className="text-[10px] shrink-0 border-red-300 text-red-600 animate-pulse">REC</Badge>
        )}
        {(figmaVideoUrl || appVideoUrl) && (
          <Badge variant="outline" className="text-[10px] shrink-0 border-green-300 text-green-600">PLAYBACK</Badge>
        )}
      </div>
    </Card>
  );
}


function FidelityDashboard({ findings, journeyReport, pageName, uxFlowResult }: { findings: ComparisonResult; journeyReport?: any; pageName?: string; uxFlowResult?: any }) {
  const fScores = findings.fidelity_scores;
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  if (!fScores) return null;

  const sa = findings.structural_analysis;

  const dimensions = [
    { key: "visual", label: "Visual", icon: Palette, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-950/30", ringColor: "ring-pink-400", description: "Colors, images, icons, visual styling" },
    { key: "layout", label: "Layout", icon: LayoutGrid, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-950/30", ringColor: "ring-blue-400", description: "Spacing, dimensions, alignment, positioning" },
    { key: "component", label: "Component", icon: Component, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-950/30", ringColor: "ring-green-400", description: "UI components, buttons, forms, inputs" },
    { key: "token_theme", label: "Token/Theme", icon: Ruler, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-950/30", ringColor: "ring-orange-400", description: "Design tokens, typography, color themes" },
    { key: "ux_flow", label: "UX Flow", icon: Route, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-950/30", ringColor: "ring-purple-400", description: "Navigation, user flow, interactions" },
  ];

  const scoreColor = (s: number) =>
    s >= 80 ? "text-green-600 dark:text-green-400" : s >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";

  const scoreBorder = (s: number) =>
    s >= 80 ? "border-green-200 dark:border-green-800" : s >= 60 ? "border-yellow-200 dark:border-yellow-800" : "border-red-200 dark:border-red-800";

  const scoreBg = (s: number) =>
    s >= 80 ? "bg-green-50/50 dark:bg-green-950/10" : s >= 60 ? "bg-yellow-50/50 dark:bg-yellow-950/10" : "bg-red-50/50 dark:bg-red-950/10";

  const getEvidenceCount = (key: string) => {
    let count = 0;
    if (key === "visual") {
      count += (findings.color_comparisons?.length || 0) + (sa?.color_diffs?.length || 0) + (sa?.icon_diffs?.length || 0) + (sa?.image_diffs?.length || 0);
    } else if (key === "layout") {
      count += (findings.dimension_comparisons?.length || 0) + (findings.spacing_comparisons?.length || 0) + (sa?.spacing_diffs?.length || 0) + (sa?.layout_diffs?.length || 0);
    } else if (key === "component") {
      count += (findings.component_analysis?.length || 0) + (sa?.component_diffs?.length || 0);
    } else if (key === "token_theme") {
      count += (findings.typography_comparisons?.length || 0) + (sa?.typography_diffs?.length || 0);
    } else if (key === "ux_flow") {
      count += (findings.ux_findings?.length || 0) + (findings.categories?.filter(c => c.name?.toLowerCase().includes('ux') || c.name?.toLowerCase().includes('flow')).length || 0);
      const stepDetail = journeyReport?.step_details?.find((sd: any) =>
        pageName && (sd.description === pageName || sd.proto_screen_name === pageName || sd.description?.includes(pageName) || pageName.includes(sd.proto_screen_name || ''))
      );
      if (stepDetail) count += 1 + (stepDetail.actions_taken?.length || 0);
      const fp = journeyReport?.friction_points?.filter((f: any) => stepDetail && f.step === stepDetail.step_index) || [];
      count += fp.length;
    }
    return count;
  };

  const isColorValue = (v: string | undefined) => v && (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgba?\(/.test(v) || /^hsla?\(/.test(v));

  const renderColorSwatch = (hex: string | undefined, _label: string) => (
    <span className="inline-flex items-center gap-1.5">
      {isColorValue(hex) && <span className="inline-block w-5 h-5 rounded border shadow-sm" style={{ background: hex }} />}
      <span className="font-mono text-xs">{hex || '—'}</span>
    </span>
  );

  const matchIcon = (match: boolean | undefined) => match
    ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
    : <XCircle className="h-3.5 w-3.5 text-red-500" />;

  const severityBadge = (severity: string | undefined) => {
    if (severity === "critical") return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Critical</Badge>;
    if (severity === "major") return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30 text-[10px] px-1.5 py-0">Major</Badge>;
    return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30 text-[10px] px-1.5 py-0">Minor</Badge>;
  };

  const renderVisualEvidence = () => {
    const colors = findings.color_comparisons || [];
    const colorDiffs = sa?.color_diffs || [];
    const iconDiffs = sa?.icon_diffs || [];
    const imageDiffs = sa?.image_diffs || [];
    if (colors.length === 0 && colorDiffs.length === 0 && iconDiffs.length === 0 && imageDiffs.length === 0)
      return <p className="text-xs text-muted-foreground italic">No visual evidence data was captured for this screen.</p>;

    return (
      <div className="space-y-4">
        {colors.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Palette className="h-3.5 w-3.5 text-pink-500" /> Color Comparisons ({colors.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Element</th><th className="text-left p-2 font-medium">Figma Color</th><th className="text-left p-2 font-medium">App Color</th><th className="text-center p-2 font-medium">Match</th></tr></thead>
                <tbody>
                  {colors.map((c, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{c.element}</td>
                      <td className="p-2">{renderColorSwatch(c.figma_hex, "Figma")}</td>
                      <td className="p-2">{renderColorSwatch(c.app_hex, "App")}</td>
                      <td className="p-2 text-center">{matchIcon(c.match)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {colorDiffs.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Palette className="h-3.5 w-3.5 text-pink-500" /> Structural Color Diffs ({colorDiffs.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Element</th><th className="text-left p-2 font-medium">Figma</th><th className="text-left p-2 font-medium">App</th><th className="text-center p-2 font-medium">Severity</th></tr></thead>
                <tbody>
                  {colorDiffs.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{d.element || '—'}</td>
                      <td className="p-2">{renderColorSwatch(d.figma_value, "Figma")}</td>
                      <td className="p-2">{renderColorSwatch(d.app_value, "App")}</td>
                      <td className="p-2 text-center">{severityBadge(d.severity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {iconDiffs.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-indigo-500" /> Icon Diffs ({iconDiffs.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Location</th><th className="text-left p-2 font-medium">Expected (Figma)</th><th className="text-left p-2 font-medium">Actual (App)</th><th className="text-center p-2 font-medium">Severity</th></tr></thead>
                <tbody>
                  {iconDiffs.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{d.location || '—'}</td>
                      <td className="p-2 font-mono">{d.figma_icon || d.figma_value || '—'}</td>
                      <td className="p-2 font-mono">{d.app_icon || d.app_value || '—'}</td>
                      <td className="p-2 text-center">{severityBadge(d.severity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {imageDiffs.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Camera className="h-3.5 w-3.5 text-teal-500" /> Image Diffs ({imageDiffs.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Location</th><th className="text-left p-2 font-medium">Expected (Figma)</th><th className="text-left p-2 font-medium">Actual (App)</th><th className="text-center p-2 font-medium">Severity</th></tr></thead>
                <tbody>
                  {imageDiffs.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{d.location || '—'}</td>
                      <td className="p-2 font-mono">{d.figma_image || d.figma_value || '—'}</td>
                      <td className="p-2 font-mono">{d.app_image || d.app_value || '—'}</td>
                      <td className="p-2 text-center">{severityBadge(d.severity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLayoutEvidence = () => {
    const dims = findings.dimension_comparisons || [];
    const spacings = findings.spacing_comparisons || [];
    const spacingDiffs = sa?.spacing_diffs || [];
    const layoutDiffs = sa?.layout_diffs || [];
    if (dims.length === 0 && spacings.length === 0 && spacingDiffs.length === 0 && layoutDiffs.length === 0)
      return <p className="text-xs text-muted-foreground italic">No layout evidence data was captured for this screen.</p>;

    return (
      <div className="space-y-4">
        {dims.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5 text-orange-500" /> Size Comparisons ({dims.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Component</th><th className="text-left p-2 font-medium">Figma Size</th><th className="text-left p-2 font-medium">App Size</th><th className="text-left p-2 font-medium">Difference</th></tr></thead>
                <tbody>
                  {dims.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{d.component}</td>
                      <td className="p-2 font-mono">{d.figma_dims}</td>
                      <td className="p-2 font-mono">{d.app_dims}</td>
                      <td className="p-2 font-mono text-orange-600 dark:text-orange-400 font-semibold">{d.diff_px}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {spacings.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5 text-blue-500" /> Spacing Comparisons ({spacings.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Element</th><th className="text-left p-2 font-medium">Property</th><th className="text-left p-2 font-medium">Figma</th><th className="text-left p-2 font-medium">App</th></tr></thead>
                <tbody>
                  {spacings.map((s, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{s.element}</td>
                      <td className="p-2 font-mono">{s.property}</td>
                      <td className="p-2 font-mono">{s.figma_value}</td>
                      <td className="p-2 font-mono">{s.app_value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {layoutDiffs.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><LayoutGrid className="h-3.5 w-3.5 text-blue-500" /> Structural Layout Diffs ({layoutDiffs.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Component</th><th className="text-left p-2 font-medium">Property</th><th className="text-left p-2 font-medium">Figma</th><th className="text-left p-2 font-medium">App</th><th className="text-center p-2 font-medium">Severity</th></tr></thead>
                <tbody>
                  {layoutDiffs.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{d.component || d.element || '—'}</td>
                      <td className="p-2 font-mono">{d.property || '—'}</td>
                      <td className="p-2 font-mono">{d.figma_value || '—'}</td>
                      <td className="p-2 font-mono">{d.app_value || '—'}</td>
                      <td className="p-2 text-center">{severityBadge(d.severity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {spacingDiffs.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5 text-blue-500" /> Structural Spacing Diffs ({spacingDiffs.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Element</th><th className="text-left p-2 font-medium">Property</th><th className="text-left p-2 font-medium">Figma</th><th className="text-left p-2 font-medium">App</th><th className="text-center p-2 font-medium">Severity</th></tr></thead>
                <tbody>
                  {spacingDiffs.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{d.element || '—'}</td>
                      <td className="p-2 font-mono">{d.property || '—'}</td>
                      <td className="p-2 font-mono">{d.figma_value || '—'}</td>
                      <td className="p-2 font-mono">{d.app_value || '—'}</td>
                      <td className="p-2 text-center">{severityBadge(d.severity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderComponentEvidence = () => {
    const comps = findings.component_analysis || [];
    const compDiffs = sa?.component_diffs || [];
    if (comps.length === 0 && compDiffs.length === 0)
      return <p className="text-xs text-muted-foreground italic">No component evidence data was captured for this screen.</p>;

    return (
      <div className="space-y-4">
        {comps.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Component className="h-3.5 w-3.5 text-green-500" /> Component Analysis ({comps.length})</h6>
            <div className="space-y-2">
              {comps.map((c, i) => {
                const m = c.design_match?.toLowerCase();
                const bg = m === "match" ? "border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800" : m === "partial" ? "border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20 dark:border-yellow-800" : "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800";
                return (
                  <div key={i} className={`rounded-lg border p-3 ${bg}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{c.component}</span>
                      {m === "match" ? <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 text-xs">Match</Badge> : m === "partial" ? <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 text-xs">Partial</Badge> : <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 text-xs">Mismatch</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{c.notes}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {compDiffs.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Component className="h-3.5 w-3.5 text-green-500" /> Structural Component Diffs ({compDiffs.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Component</th><th className="text-left p-2 font-medium">Property</th><th className="text-left p-2 font-medium">Figma</th><th className="text-left p-2 font-medium">App</th><th className="text-center p-2 font-medium">Severity</th></tr></thead>
                <tbody>
                  {compDiffs.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{d.component || '—'}</td>
                      <td className="p-2 font-mono">{d.property || '—'}</td>
                      <td className="p-2 font-mono">{d.figma_value || '—'}</td>
                      <td className="p-2 font-mono">{d.app_value || '—'}</td>
                      <td className="p-2 text-center">{severityBadge(d.severity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTokenThemeEvidence = () => {
    const typo = findings.typography_comparisons || [];
    const typoDiffs = sa?.typography_diffs || [];
    if (typo.length === 0 && typoDiffs.length === 0)
      return <p className="text-xs text-muted-foreground italic">No token/theme evidence data was captured for this screen.</p>;

    return (
      <div className="space-y-4">
        {typo.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5 text-orange-500" /> Typography Comparisons ({typo.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Element</th><th className="text-left p-2 font-medium">Expected (Figma)</th><th className="text-left p-2 font-medium">Actual (App)</th><th className="text-center p-2 font-medium">Match</th></tr></thead>
                <tbody>
                  {typo.map((t, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{t.element}</td>
                      <td className="p-2 font-mono">{t.figma_font}</td>
                      <td className="p-2 font-mono">{t.app_font}</td>
                      <td className="p-2 text-center">{matchIcon(t.match)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {typoDiffs.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5 text-orange-500" /> Structural Typography Diffs ({typoDiffs.length})</h6>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left p-2 font-medium">Element</th><th className="text-left p-2 font-medium">Property</th><th className="text-left p-2 font-medium">Figma</th><th className="text-left p-2 font-medium">App</th><th className="text-center p-2 font-medium">Severity</th></tr></thead>
                <tbody>
                  {typoDiffs.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground font-medium">{d.element || '—'}</td>
                      <td className="p-2 font-mono">{d.property || '—'}</td>
                      <td className="p-2 font-mono">{d.figma_value || '—'}</td>
                      <td className="p-2 font-mono">{d.app_value || '—'}</td>
                      <td className="p-2 text-center">{severityBadge(d.severity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUxFlowEvidence = () => {
    const uxFindings = findings.ux_findings || [];
    const categories = findings.categories || [];

    const stepDetail = journeyReport?.step_details?.find((sd: any) =>
      pageName && (sd.description === pageName || sd.proto_screen_name === pageName || sd.description?.includes(pageName) || pageName.includes(sd.proto_screen_name || ''))
    );
    const stepFrictionPoints = journeyReport?.friction_points?.filter((fp: any) =>
      stepDetail && fp.step === stepDetail.step_index
    ) || [];
    const uxFlowFindings = uxFlowResult?.flow_findings?.filter((f: any) =>
      pageName && f.area && (f.area.toLowerCase().includes(pageName.toLowerCase()) || pageName.toLowerCase().includes(f.area.toLowerCase()))
    ) || [];
    const journeySummary = journeyReport?.summary;
    const journeyScores = journeyReport?.scores;

    const hasJourneyData = !!stepDetail || stepFrictionPoints.length > 0 || uxFlowFindings.length > 0;
    const hasPerScreenData = uxFindings.length > 0 || categories.length > 0;

    if (!hasJourneyData && !hasPerScreenData)
      return <p className="text-xs text-muted-foreground italic">No UX flow evidence data was captured for this screen.</p>;

    const getStatusLabel = (status: string) => {
      if (status === "passed") return { label: "Aligned", color: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400", icon: <CheckCircle className="h-4 w-4 text-green-500" /> };
      if (status === "failed") return { label: "Misaligned", color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400", icon: <XCircle className="h-4 w-4 text-red-500" /> };
      if (status === "undetermined") return { label: "Undetermined", color: "text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800 dark:text-yellow-400", icon: <AlertTriangle className="h-4 w-4 text-yellow-500" /> };
      return { label: "Partial", color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400", icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> };
    };

    return (
      <div className="space-y-4">
        {stepDetail && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Route className="h-3.5 w-3.5 text-purple-500" /> Journey Step Status
            </h6>
            {(() => {
              const status = getStatusLabel(stepDetail.app_status);
              return (
                <div className={`rounded-lg border p-3 ${status.color}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-xs font-bold bg-background/50 rounded px-2 py-0.5 border">Step {stepDetail.step_index + 1}</span>
                    {status.icon}
                    <span className="font-semibold text-sm">{status.label}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">{stepDetail.action}</Badge>
                  </div>
                  <p className="text-xs opacity-80">{stepDetail.description}</p>
                  {stepDetail.app_error && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium">Error: {stepDetail.app_error}</p>
                  )}

                  {stepDetail.actions_taken && stepDetail.actions_taken.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-current/10">
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 opacity-70">Actions Executed</p>
                      <div className="space-y-1">
                        {stepDetail.actions_taken.map((act: any, ai: number) => (
                          <div key={ai} className="flex items-center gap-2 text-xs bg-background/30 rounded px-2 py-1">
                            {act.status === "passed" ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{act.action}</Badge>
                            <span className="truncate flex-1">{act.description}</span>
                            {act.status === "failed" && act.error && (
                              <span className="text-red-500 text-[10px] shrink-0">{act.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {stepFrictionPoints.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <XCircle className="h-3.5 w-3.5" /> Friction Points ({stepFrictionPoints.length})
            </h6>
            <div className="space-y-1.5">
              {stepFrictionPoints.map((fp: any, i: number) => (
                <div key={i} className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">{fp.type?.replace(/_/g, ' ')}</Badge>
                    <span className="font-medium">{fp.description}</span>
                  </div>
                  {fp.error && <p className="text-[10px] text-red-500 mt-1">{fp.error}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {journeyScores && stepDetail && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-purple-500" /> Journey Scores
            </h6>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg border bg-muted/30">
                <div className={`text-lg font-bold ${scoreColor(journeyScores.execution || 0)}`}>{journeyScores.execution || 0}%</div>
                <div className="text-[10px] text-muted-foreground">Execution</div>
              </div>
              <div className="text-center p-2 rounded-lg border bg-muted/30">
                <div className={`text-lg font-bold ${scoreColor(journeyScores.friction || 0)}`}>{journeyScores.friction || 0}%</div>
                <div className="text-[10px] text-muted-foreground">Screen Match</div>
              </div>
              <div className="text-center p-2 rounded-lg border bg-muted/30">
                <div className={`text-lg font-bold ${scoreColor(journeyScores.overall || 0)}`}>{journeyScores.overall || 0}%</div>
                <div className="text-[10px] text-muted-foreground">Overall</div>
              </div>
            </div>
            {journeySummary && (
              <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground p-2 rounded border bg-muted/20">
                <span><strong>{journeySummary.passed || 0}</strong> aligned</span>
                <span><strong>{journeySummary.failed || 0}</strong> misaligned</span>
                <span><strong>{journeySummary.total_steps || 0}</strong> total screens</span>
                <span><strong>{journeySummary.passed_actions || 0}/{journeySummary.total_actions || 0}</strong> actions passed</span>
              </div>
            )}
          </div>
        )}

        {uxFlowFindings.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-purple-500" /> Cross-Screen Flow Analysis
            </h6>
            <div className="space-y-2">
              {uxFlowFindings.map((f: any, i: number) => (
                <div key={i} className="rounded-lg border p-2.5 bg-muted/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs">{f.area}</span>
                    <span className={`font-bold text-sm ${scoreColor(f.score)}`}>{f.score}%</span>
                  </div>
                  <Progress value={f.score} className="h-1 mb-1" />
                  <p className="text-[10px] text-muted-foreground">{f.finding}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {categories.filter(c => c.name?.toLowerCase().includes('ux') || c.name?.toLowerCase().includes('flow')).length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><LayoutGrid className="h-3.5 w-3.5 text-indigo-500" /> Per-Screen UX Categories</h6>
            <div className="space-y-2">
              {categories.filter(c => c.name?.toLowerCase().includes('ux') || c.name?.toLowerCase().includes('flow')).map((cat, i) => (
                <div key={i} className="rounded-lg border p-2.5 bg-muted/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs">{cat.name}</span>
                    <span className={`font-bold text-sm ${scoreColor(cat.score)}`}>{cat.score}%</span>
                  </div>
                  <Progress value={cat.score} className="h-1 mb-1" />
                  <p className="text-[10px] text-muted-foreground">{cat.findings}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {uxFindings.length > 0 && (
          <div>
            <h6 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-purple-500" /> UX Observations ({uxFindings.length})</h6>
            <ul className="space-y-1">
              {uxFindings.map((f, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2 p-2 rounded-md bg-muted/20">
                  <span className="text-purple-500 shrink-0">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderEvidence = (key: string) => {
    if (key === "visual") return renderVisualEvidence();
    if (key === "layout") return renderLayoutEvidence();
    if (key === "component") return renderComponentEvidence();
    if (key === "token_theme") return renderTokenThemeEvidence();
    if (key === "ux_flow") return renderUxFlowEvidence();
    return null;
  };

  return (
    <div className="mb-4" data-testid="fidelity-dashboard">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-indigo-500" /> Fidelity Dimensions
        <span className="text-xs text-muted-foreground font-normal ml-1">Click any dimension to see detailed evidence</span>
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {dimensions.map(dim => {
          const score = fScores[dim.key as keyof typeof fScores];
          if (score == null) return null;
          const Icon = dim.icon;
          const isExpanded = expandedDim === dim.key;
          const evidenceCount = getEvidenceCount(dim.key);
          return (
            <div key={dim.key}
              className={`rounded-xl border-2 p-3 text-center cursor-pointer transition-all hover:shadow-md ${scoreBorder(score)} ${isExpanded ? `ring-2 ${dim.ringColor} shadow-lg ${scoreBg(score)}` : 'hover:scale-[1.02]'}`}
              onClick={() => setExpandedDim(isExpanded ? null : dim.key)}
              data-testid={`fidelity-${dim.key}`}
            >
              <div className={`inline-flex p-2 rounded-lg ${dim.bg} mb-2`}>
                <Icon className={`h-4 w-4 ${dim.color}`} />
              </div>
              <div className={`text-2xl font-bold ${scoreColor(score)}`}>{Math.round(score)}%</div>
              <p className="text-xs text-muted-foreground mt-0.5">{dim.label}</p>
              {evidenceCount > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">{evidenceCount} finding{evidenceCount !== 1 ? 's' : ''}</p>
              )}
            </div>
          );
        })}
      </div>

      {expandedDim && (
        <div className="mt-4 rounded-xl border-2 p-5 bg-card animate-in slide-in-from-top-2 duration-200" data-testid={`fidelity-detail-${expandedDim}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {(() => { const dim = dimensions.find(d => d.key === expandedDim); if (!dim) return null; const Icon = dim.icon; return <><div className={`inline-flex p-2 rounded-lg ${dim.bg}`}><Icon className={`h-5 w-5 ${dim.color}`} /></div><div><h5 className="font-semibold text-sm">{dim.label} — Detailed Evidence</h5><p className="text-xs text-muted-foreground">{dim.description}</p></div></>; })()}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setExpandedDim(null)} className="text-xs gap-1" data-testid="button-close-fidelity-detail">
              <XCircle className="h-3.5 w-3.5" /> Close
            </Button>
          </div>
          {renderEvidence(expandedDim)}
        </div>
      )}
    </div>
  );
}


function PageComparisonCard({
  page, isComparing, isSelected, isCapturing, captureUrl,
  onUpload, onCompare, onDelete, onSelect, onCapture,
}: {
  page: DesignValidation["pages"][0]; isComparing: boolean; isSelected: boolean;
  isCapturing: boolean; captureUrl: string;
  onUpload: (pageId: string, type: "figma" | "app", file: File) => void;
  onCompare: (pageId: string) => void; onDelete: (pageId: string) => void;
  onSelect: (pageId: string) => void; onCapture: (pageId: string, url: string) => void;
}) {
  const figmaInputRef = useRef<HTMLInputElement>(null);
  const appInputRef = useRef<HTMLInputElement>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const hasBothImages = !!page.figma_image_path && !!page.app_image_path;

  return (
    <Card className={`p-4 ${isSelected ? "ring-2 ring-primary" : ""}`} data-testid={`card-page-${page.id}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium" data-testid={`text-page-name-${page.id}`}>{page.page_name}</h3>
          {page.compliance_score !== null && (
            <Badge variant={page.compliance_score >= 80 ? "default" : page.compliance_score >= 60 ? "secondary" : "destructive"}>{Math.round(page.compliance_score)}%</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {page.status === "compared" && (
            <Button variant="ghost" size="sm" onClick={() => onSelect(page.id)} data-testid={`button-view-results-${page.id}`}>
              <Eye className="h-3.5 w-3.5 mr-1" />{isSelected ? "Hide" : "Results"}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(page.id)} data-testid={`button-delete-page-${page.id}`}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Figma Design</p>
          {page.figma_image_path ? (
            <div className="relative group">
              <img src={page.figma_image_path} alt="Figma design" className="w-full h-72 object-contain rounded-md border bg-muted/30 cursor-pointer" data-testid={`img-figma-${page.id}`}
                onClick={() => setExpandedImage(page.figma_image_path!)} />
              <Button variant="secondary" size="sm" className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => figmaInputRef.current?.click()}>Replace</Button>
            </div>
          ) : (
            <div className="h-48 border-2 border-dashed rounded-md flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => figmaInputRef.current?.click()} data-testid={`dropzone-figma-${page.id}`}>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Upload Figma Screenshot</p>
            </div>
          )}
          <input ref={figmaInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(page.id, "figma", file); e.target.value = ""; }} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">App Screenshot</p>
            {captureUrl && (
              <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" disabled={isCapturing}
                onClick={() => onCapture(page.id, captureUrl)} data-testid={`button-capture-${page.id}`}>
                {isCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                {isCapturing ? "Capturing..." : "Auto-capture"}
              </Button>
            )}
          </div>
          {page.app_image_path ? (
            <div className="relative group">
              <img src={page.app_image_path} alt="App screenshot" className="w-full h-72 object-contain rounded-md border bg-muted/30 cursor-pointer" data-testid={`img-app-${page.id}`}
                onClick={() => setExpandedImage(page.app_image_path!)} />
              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {captureUrl && (
                  <Button variant="secondary" size="sm" disabled={isCapturing} onClick={() => onCapture(page.id, captureUrl)}>
                    {isCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3 mr-1" />}Re-capture
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => appInputRef.current?.click()}>Upload</Button>
              </div>
            </div>
          ) : (
            <div className="h-48 border-2 border-dashed rounded-md flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => appInputRef.current?.click()} data-testid={`dropzone-app-${page.id}`}>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Upload App Screenshot</p>
              {captureUrl && (
                <Button variant="outline" size="sm" className="gap-1 mt-1" disabled={isCapturing}
                  onClick={(e) => { e.stopPropagation(); onCapture(page.id, captureUrl); }}>
                  {isCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                  {isCapturing ? "Capturing..." : "or Auto-capture"}
                </Button>
              )}
            </div>
          )}
          <input ref={appInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(page.id, "app", file); e.target.value = ""; }} />
        </div>
      </div>

      {hasBothImages && (
        <div className="mt-3 pt-3 border-t">
          <Button onClick={() => onCompare(page.id)} disabled={isComparing} className="w-full gap-2" data-testid={`button-compare-${page.id}`}>
            {isComparing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</> : <><Play className="h-4 w-4" /> {page.status === "compared" ? "Re-run Comparison" : "Run AI Comparison"}</>}
          </Button>
        </div>
      )}

      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setExpandedImage(null)}
          data-testid="lightbox-overlay-page"
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={expandedImage}
              alt="Full size screenshot"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute -top-3 -right-3 bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              data-testid="button-close-lightbox-page"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}


function StructuralDiffTable({ title, icon, diffs, columns }: { title: string; icon: React.ComponentType<{ className?: string }>; diffs?: StructuralDiffItem[]; columns: { key: string; label: string }[] }) {
  if (!diffs || diffs.length === 0) return null;

  const severityBadge = (severity: string) => {
    if (severity === "critical") return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Critical</Badge>;
    if (severity === "major") return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30 text-[10px] px-1.5 py-0">Major</Badge>;
    return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30 text-[10px] px-1.5 py-0">Minor</Badge>;
  };

  const Icon = icon;
  return (
    <div data-testid={`structural-diff-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <h5 className="font-medium text-xs flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5" /> {title} ({diffs.length})
      </h5>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b">
              {columns.map(col => (
                <th key={col.key} className="text-left p-1.5 font-medium">{col.label}</th>
              ))}
              <th className="text-left p-1.5 font-medium">Status</th>
              <th className="text-left p-1.5 font-medium">Severity</th>
            </tr>
          </thead>
          <tbody>
            {diffs.slice(0, 15).map((d: StructuralDiffItem, i: number) => (
              <tr key={i} className="border-b last:border-0">
                {columns.map(col => (
                  <td key={col.key} className="p-1.5 font-mono text-muted-foreground">{String(d[col.key] ?? '—')}</td>
                ))}
                <td className="p-1.5">
                  {d.match ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500" />
                  )}
                </td>
                <td className="p-1.5">{severityBadge(d.severity || 'minor')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StructuralAnalysisSection({ analysis }: { analysis: StructuralAnalysis }) {
  if (!analysis) return null;

  const scoreColor = (s: number) =>
    s >= 80 ? "text-green-600 dark:text-green-400" : s >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";

  return (
    <div className="pt-3 border-t space-y-4" data-testid="structural-analysis-section">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-indigo-500" /> Deep Structural Analysis
        </h4>
        <div className="flex items-center gap-3 text-xs">
          {analysis.structural_score != null && (
            <span className={`font-bold text-lg ${scoreColor(analysis.structural_score)}`}>{Math.round(analysis.structural_score)}%</span>
          )}
          {(analysis.critical_count ?? 0) > 0 && <span className="text-red-600">{analysis.critical_count} critical</span>}
          {(analysis.major_count ?? 0) > 0 && <span className="text-orange-600">{analysis.major_count} major</span>}
          {(analysis.minor_count ?? 0) > 0 && <span className="text-blue-600">{analysis.minor_count} minor</span>}
        </div>
      </div>

      <StructuralDiffTable
        title="Color Diffs"
        icon={Palette}
        diffs={analysis.color_diffs}
        columns={[
          { key: "element", label: "Element" },
          { key: "figma_value", label: "Figma" },
          { key: "app_value", label: "App" },
        ]}
      />
      <StructuralDiffTable
        title="Typography Diffs"
        icon={Ruler}
        diffs={analysis.typography_diffs}
        columns={[
          { key: "element", label: "Element" },
          { key: "property", label: "Property" },
          { key: "figma_value", label: "Figma" },
          { key: "app_value", label: "App" },
        ]}
      />
      <StructuralDiffTable
        title="Spacing Diffs"
        icon={Ruler}
        diffs={analysis.spacing_diffs}
        columns={[
          { key: "element", label: "Element" },
          { key: "property", label: "Property" },
          { key: "figma_value", label: "Figma" },
          { key: "app_value", label: "App" },
        ]}
      />
      <StructuralDiffTable
        title="Layout Diffs"
        icon={LayoutGrid}
        diffs={analysis.layout_diffs}
        columns={[
          { key: "component", label: "Component" },
          { key: "property", label: "Property" },
          { key: "figma_value", label: "Figma" },
          { key: "app_value", label: "App" },
        ]}
      />
      <StructuralDiffTable
        title="Icon Diffs"
        icon={Eye}
        diffs={analysis.icon_diffs}
        columns={[
          { key: "location", label: "Location" },
          { key: "figma_icon", label: "Figma" },
          { key: "app_icon", label: "App" },
        ]}
      />
      <StructuralDiffTable
        title="Image Diffs"
        icon={Camera}
        diffs={analysis.image_diffs}
        columns={[
          { key: "location", label: "Location" },
          { key: "figma_image", label: "Figma" },
          { key: "app_image", label: "App" },
        ]}
      />
      <StructuralDiffTable
        title="Component Diffs"
        icon={Component}
        diffs={analysis.component_diffs}
        columns={[
          { key: "component", label: "Component" },
          { key: "property", label: "Property" },
          { key: "figma_value", label: "Figma" },
          { key: "app_value", label: "App" },
        ]}
      />
    </div>
  );
}

function ComparisonResults({
  findings, streamContent, isStreaming, pageName, embedded = false,
}: {
  findings: ComparisonResult | null; streamContent: string; isStreaming: boolean; pageName: string; embedded?: boolean;
}) {
  if (isStreaming && !findings) {
    const inner = (
      <>
        <div className="flex items-center gap-2 mb-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <h3 className="font-semibold">AI Analysis in Progress — {pageName}</h3>
        </div>
        <pre className="text-sm whitespace-pre-wrap text-muted-foreground bg-muted/30 p-4 rounded-md max-h-96 overflow-auto">
          {streamContent || "Starting analysis..."}
        </pre>
      </>
    );
    return embedded ? <div>{inner}</div> : <Card className="p-5">{inner}</Card>;
  }

  if (!findings) return null;

  const scoreColor = (s: number) =>
    s >= 80 ? "text-green-600 dark:text-green-400" : s >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";

  const matchBadge = (match: string) => {
    const m = match.toLowerCase();
    if (m === "match") return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 text-xs">Match</Badge>;
    if (m === "partial") return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 text-xs">Partial</Badge>;
    return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 text-xs">Mismatch</Badge>;
  };

  const content = (
    <>
      {!embedded && <h3 className="text-lg font-semibold mb-4">Comparison Results — {pageName}</h3>}

      <div className="flex items-center justify-center gap-8 mb-6">
        <div className="text-center">
          <div className={`text-4xl font-bold ${scoreColor(findings.overall_score)}`}>{Math.round(findings.overall_score)}%</div>
          <p className="text-xs text-muted-foreground mt-1">Overall</p>
        </div>
        {findings.design_fidelity_score != null && (
          <div className="text-center">
            <div className={`text-3xl font-bold ${scoreColor(findings.design_fidelity_score)}`}>{Math.round(findings.design_fidelity_score)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Design Fidelity</p>
          </div>
        )}
        {findings.ux_score != null && (
          <div className="text-center">
            <div className={`text-3xl font-bold ${scoreColor(findings.ux_score)}`}>{Math.round(findings.ux_score)}%</div>
            <p className="text-xs text-muted-foreground mt-1">UX Score</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium text-sm mb-3">Category Scores</h4>
          <div className="space-y-3">
            {findings.categories.map((cat) => (
              <div key={cat.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{cat.name}</span>
                  <span className={scoreColor(cat.score)}>{cat.score}%</span>
                </div>
                <Progress value={cat.score} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{cat.findings}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {findings.critical_issues.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
                <XCircle className="h-4 w-4 text-red-500" /> Critical Issues ({findings.critical_issues.length})
              </h4>
              <ul className="space-y-1.5">
                {findings.critical_issues.map((issue, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-red-500 shrink-0">•</span>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {findings.minor_issues.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" /> Minor Issues ({findings.minor_issues.length})
              </h4>
              <ul className="space-y-1.5">
                {findings.minor_issues.map((issue, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-yellow-500 shrink-0">•</span>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {findings.ux_findings && findings.ux_findings.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
                <Eye className="h-4 w-4 text-purple-500" /> UX Findings ({findings.ux_findings.length})
              </h4>
              <ul className="space-y-1.5">
                {findings.ux_findings.map((f, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-purple-500 shrink-0">•</span>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {findings.recommendations.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
                <CheckCircle className="h-4 w-4 text-blue-500" /> Recommendations ({findings.recommendations.length})
              </h4>
              <ul className="space-y-1.5">
                {findings.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-blue-500 shrink-0">•</span>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {findings.color_comparisons && findings.color_comparisons.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
                <Palette className="h-4 w-4 text-pink-500" /> Color Comparisons ({findings.color_comparisons.length})
              </h4>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b">
                      <th className="text-left p-2 font-medium">Element</th>
                      <th className="text-left p-2 font-medium">Figma</th>
                      <th className="text-left p-2 font-medium">App</th>
                      <th className="text-left p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.color_comparisons.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 text-muted-foreground">{c.element}</td>
                        <td className="p-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-4 h-4 rounded border" style={{ background: c.figma_hex }} data-testid={`color-swatch-figma-${i}`} />
                            <span className="font-mono text-xs">{c.figma_hex}</span>
                          </span>
                        </td>
                        <td className="p-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-4 h-4 rounded border" style={{ background: c.app_hex }} data-testid={`color-swatch-app-${i}`} />
                            <span className="font-mono text-xs">{c.app_hex}</span>
                          </span>
                        </td>
                        <td className="p-2">
                          {c.match ? (
                            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 text-xs">Match</Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 text-xs">Mismatch</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {findings.dimension_comparisons && findings.dimension_comparisons.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
                <Ruler className="h-4 w-4 text-orange-500" /> Dimension Comparisons ({findings.dimension_comparisons.length})
              </h4>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b">
                      <th className="text-left p-2 font-medium">Component</th>
                      <th className="text-left p-2 font-medium">Figma</th>
                      <th className="text-left p-2 font-medium">App</th>
                      <th className="text-left p-2 font-medium">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.dimension_comparisons.map((d, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 text-muted-foreground">{d.component}</td>
                        <td className="p-2 font-mono">{d.figma_dims}</td>
                        <td className="p-2 font-mono">{d.app_dims}</td>
                        <td className="p-2 font-mono text-orange-600 dark:text-orange-400">{d.diff_px}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {findings.typography_comparisons && findings.typography_comparisons.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
                Typography Comparisons ({findings.typography_comparisons.length})
              </h4>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b">
                      <th className="text-left p-2 font-medium">Element</th>
                      <th className="text-left p-2 font-medium">Figma</th>
                      <th className="text-left p-2 font-medium">App</th>
                      <th className="text-left p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.typography_comparisons.map((t, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 text-muted-foreground">{t.element}</td>
                        <td className="p-2 font-mono">{t.figma_font}</td>
                        <td className="p-2 font-mono">{t.app_font}</td>
                        <td className="p-2">
                          {t.match ? (
                            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 text-xs">Match</Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 text-xs">Mismatch</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {findings.spacing_comparisons && findings.spacing_comparisons.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
                Spacing Comparisons ({findings.spacing_comparisons.length})
              </h4>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b">
                      <th className="text-left p-2 font-medium">Element</th>
                      <th className="text-left p-2 font-medium">Property</th>
                      <th className="text-left p-2 font-medium">Figma</th>
                      <th className="text-left p-2 font-medium">App</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.spacing_comparisons.map((s, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 text-muted-foreground">{s.element}</td>
                        <td className="p-2 font-mono">{s.property}</td>
                        <td className="p-2 font-mono">{s.figma_value}</td>
                        <td className="p-2 font-mono">{s.app_value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {findings.component_analysis && findings.component_analysis.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">Component Analysis</h4>
              <div className="space-y-2">
                {findings.component_analysis.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm border rounded-md p-2 bg-muted/20" data-testid={`component-card-${i}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.component}</span>
                        {matchBadge(c.design_match)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {findings.structural_analysis && (
            <StructuralAnalysisSection analysis={findings.structural_analysis} />
          )}

          {(findings as any).judge_validation && (
            <JudgeValidationSection judge={(findings as any).judge_validation} originalScore={(findings as any).original_score} />
          )}

          {findings.summary && (
            <div className="pt-3 border-t">
              <h4 className="font-medium text-sm mb-1">Summary</h4>
              <p className="text-sm text-muted-foreground">{findings.summary}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return embedded ? <div data-testid="card-comparison-results">{content}</div> : <Card className="p-5" data-testid="card-comparison-results">{content}</Card>;
}


function JudgeValidationSection({ judge, originalScore }: { judge: any; originalScore?: number }) {
  if (!judge) return null;

  const verdictColor = judge.judge_verdict === "validated"
    ? "text-green-600 bg-green-50 border-green-300 dark:bg-green-950/30"
    : judge.judge_verdict === "partially_validated"
    ? "text-yellow-600 bg-yellow-50 border-yellow-300 dark:bg-yellow-950/30"
    : "text-red-600 bg-red-50 border-red-300 dark:bg-red-950/30";

  return (
    <div className="pt-3 border-t" data-testid="section-judge-validation">
      <h4 className="font-medium text-sm flex items-center gap-1.5 mb-3">
        <Shield className="h-4 w-4 text-indigo-500" /> LLM Judge Validation
      </h4>

      <div className="flex items-center gap-4 mb-3">
        <Badge variant="outline" className={`${verdictColor} text-xs px-2 py-1`} data-testid="badge-judge-verdict">
          {judge.judge_verdict === "validated" ? "Validated" : judge.judge_verdict === "partially_validated" ? "Partially Validated" : "Rejected"}
        </Badge>
        {originalScore != null && judge.adjusted_overall_score != null && originalScore !== judge.adjusted_overall_score && (
          <span className="text-xs text-muted-foreground">
            Score adjusted: {originalScore}% → {judge.adjusted_overall_score}%
          </span>
        )}
        {judge.confidence != null && (
          <span className="text-xs text-muted-foreground">Confidence: {judge.confidence}%</span>
        )}
      </div>

      {judge.app_state_correct === false && judge.app_state_issue && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-400">
          <strong>App State Issue:</strong> {judge.app_state_issue}
        </div>
      )}

      {judge.validated_findings && judge.validated_findings.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Verified Findings ({judge.validated_findings.filter((f: any) => f.verified).length}/{judge.validated_findings.length})</p>
          <ul className="space-y-1">
            {judge.validated_findings.slice(0, 8).map((f: any, i: number) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                {f.verified ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0 mt-0.5" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />}
                <span><strong className={f.severity === "critical" ? "text-red-600" : f.severity === "major" ? "text-yellow-600" : ""}>{f.severity}:</strong> {f.finding}{f.judge_note ? ` — ${f.judge_note}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {judge.missed_issues && judge.missed_issues.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Missed Issues Found by Judge</p>
          <ul className="space-y-1">
            {judge.missed_issues.map((m: any, i: number) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />
                <span><strong>{m.severity}:</strong> {m.finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {judge.removed_findings && judge.removed_findings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Removed (False Positives)</p>
          <ul className="space-y-1">
            {judge.removed_findings.map((r: any, i: number) => (
              <li key={i} className="text-xs text-muted-foreground line-through opacity-60">
                {r.finding} — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


function UxFlowResults({ result }: { result: any }) {
  if (!result) return null;

  const scoreColor = (s: number) =>
    s >= 80 ? "text-green-600 dark:text-green-400" : s >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";

  return (
    <Card className="p-5" data-testid="card-ux-flow-results">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-purple-500/10"><Eye className="h-5 w-5 text-purple-500" /></div>
        <div>
          <h3 className="text-lg font-semibold">UX Flow Analysis</h3>
          <p className="text-xs text-muted-foreground">Cross-screen navigation and user journey assessment</p>
        </div>
        {result.ux_flow_score != null && (
          <div className={`ml-auto text-3xl font-bold ${scoreColor(result.ux_flow_score)}`}>{Math.round(result.ux_flow_score)}%</div>
        )}
      </div>

      {result.flow_findings && result.flow_findings.length > 0 && (
        <div className="space-y-3 mb-4">
          {result.flow_findings.map((f: any, i: number) => (
            <div key={i}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{f.area}</span>
                <span className={scoreColor(f.score)}>{f.score}%</span>
              </div>
              <Progress value={f.score} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{f.finding}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {result.journey_issues && result.journey_issues.length > 0 && (
          <div>
            <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
              <XCircle className="h-4 w-4 text-red-500" /> Journey Issues ({result.journey_issues.length})
            </h4>
            <ul className="space-y-1.5">
              {result.journey_issues.map((issue: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-red-500 shrink-0">•</span>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {result.consistency_notes && result.consistency_notes.length > 0 && (
          <div>
            <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" /> Consistency Notes ({result.consistency_notes.length})
            </h4>
            <ul className="space-y-1.5">
              {result.consistency_notes.map((note: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-yellow-500 shrink-0">•</span>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {result.flow_recommendations && result.flow_recommendations.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-sm flex items-center gap-1.5 mb-2">
            <CheckCircle className="h-4 w-4 text-blue-500" /> Recommendations ({result.flow_recommendations.length})
          </h4>
          <ul className="space-y-1.5">
            {result.flow_recommendations.map((rec: string, i: number) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-blue-500 shrink-0">•</span>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {result.summary && (
        <div className="mt-4 pt-3 border-t">
          <h4 className="font-medium text-sm mb-1">Summary</h4>
          <p className="text-sm text-muted-foreground">{result.summary}</p>
        </div>
      )}
    </Card>
  );
}
