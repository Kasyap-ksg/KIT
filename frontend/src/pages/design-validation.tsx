import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Palette,
  Plus,
  Eye,
  CheckCircle,
  Clock,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/empty-state";
import type { DesignValidation, Application } from "@/types";

export default function DesignValidationPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [applicationId, setApplicationId] = useState<string>("");
  const [figmaUrl, setFigmaUrl] = useState("");
  const [appUrl, setAppUrl] = useState("");

  const { data: validations, isLoading } = useQuery<DesignValidation[]>({
    queryKey: ["/api/design-validations"],
  });

  const { data: applications } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/design-validations", {
        name,
        application_id: applicationId && applicationId !== "none" ? applicationId : null,
        figma_url: figmaUrl,
        app_url: appUrl,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
      setDialogOpen(false);
      setName("");
      setApplicationId("");
      setFigmaUrl("");
      setAppUrl("");
      toast({ title: "Validation created" });
      navigate(`/design-validation/${data.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/design-validations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-validations"] });
      toast({ title: "Validation deleted" });
    },
  });

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-purple-500/10">
            <Palette className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              Design Validation
            </h1>
            <p className="text-sm text-muted-foreground">
              Compare Figma designs with your application UI
            </p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-validation">
              <Plus className="h-4 w-4 mr-2" />
              New Validation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Design Validation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Validation Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Homepage Redesign Validation"
                  data-testid="input-validation-name"
                />
              </div>
              <div>
                <Label>Application (optional)</Label>
                <Select value={applicationId} onValueChange={setApplicationId}>
                  <SelectTrigger data-testid="select-application">
                    <SelectValue placeholder="Select an application" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No application</SelectItem>
                    {applications?.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Figma URL (optional)</Label>
                <Input
                  value={figmaUrl}
                  onChange={(e) => setFigmaUrl(e.target.value)}
                  placeholder="https://www.figma.com/design/..."
                  data-testid="input-figma-url"
                />
              </div>
              <div>
                <Label>Application URL (optional)</Label>
                <Input
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://your-app.com"
                  data-testid="input-app-url"
                />
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
                className="w-full"
                data-testid="button-create-validation"
              >
                {createMutation.isPending ? "Creating..." : "Create Validation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!validations?.length ? (
        <EmptyState
          icon={<Palette className="h-12 w-12" />}
          title="No design validations yet"
          description="Create your first validation to compare Figma designs with your application"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {validations.map((v) => (
            <Card
              key={v.id}
              className="p-5 hover:shadow-md transition-shadow cursor-pointer group"
              data-testid={`card-validation-${v.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(`/design-validation/${v.id}`)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(v.status)}
                    <h3 className="font-semibold text-sm truncate" data-testid={`text-validation-name-${v.id}`}>
                      {v.name}
                    </h3>
                  </div>
                  {v.application_name && (
                    <p className="text-xs text-muted-foreground mb-2">
                      {v.application_name}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(v.id);
                  }}
                  data-testid={`button-delete-validation-${v.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>

              <div
                className="cursor-pointer"
                onClick={() => navigate(`/design-validation/${v.id}`)}
              >
                {v.overall_score !== null ? (
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`text-3xl font-bold ${getScoreColor(v.overall_score)}`}>
                      {Math.round(v.overall_score)}%
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            v.overall_score >= 80
                              ? "bg-green-500"
                              : v.overall_score >= 60
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${v.overall_score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-3">No comparison run yet</p>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{v.pages.length} page{v.pages.length !== 1 ? "s" : ""}</span>
                  <span className="capitalize">{v.status.replace("_", " ")}</span>
                </div>

                <div className="mt-3 pt-3 border-t">
                  <Button variant="outline" size="sm" className="w-full gap-2" data-testid={`button-view-validation-${v.id}`}>
                    <Eye className="h-3.5 w-3.5" />
                    View Details
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
