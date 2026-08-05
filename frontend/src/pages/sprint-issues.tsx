import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Loader2,
  User,
  Tag,
  FlaskConical,
  ExternalLink,
  Play,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface JiraSprint {
  id: number;
  name: string;
  state: string;
  start_date: string;
  end_date: string;
  complete_date: string;
  goal: string;
}

interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  issue_type: string;
  status: string;
  status_category: string;
  priority: string;
  assignee: string;
  assignee_avatar: string;
  url: string;
}

interface Props {
  projectId: string;
  sprintId: string;
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    Highest: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    High: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    Low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    Lowest: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[priority] || colors.Medium}`}>
      {priority}
    </span>
  );
}

export default function SprintIssues({ projectId, sprintId }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [navigatingKey, setNavigatingKey] = useState<string | null>(null);

  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
  });

  const { data: sprintData } = useQuery<{ sprints: JiraSprint[] }>({
    queryKey: ["/api/jira/boards", "all-sprints", sprintId],
    queryFn: async () => {
      const boardsRes = await fetch(`/api/jira/projects/${project!.jira_project_key}/boards?project_id=${projectId}`);
      if (!boardsRes.ok) throw new Error("Failed");
      const boards = await boardsRes.json();
      const boardId = boards.boards?.[0]?.id;
      if (!boardId) throw new Error("No board");
      const res = await fetch(`/api/jira/boards/${boardId}/sprints?state=active,closed&project_id=${projectId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!project?.jira_project_key,
  });

  const sprint = sprintData?.sprints?.find(s => String(s.id) === sprintId);

  const { data: issuesData, isLoading: issuesLoading } = useQuery<{ issues: JiraIssue[] }>({
    queryKey: ["/api/jira/sprints", sprintId, "issues"],
    queryFn: async () => {
      const res = await fetch(`/api/jira/sprints/${sprintId}/issues?project_id=${projectId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!sprintId,
  });

  const createTestCase = useMutation({
    mutationFn: async (issue: JiraIssue) => {
      const res = await apiRequest("POST", "/api/test-execution/story/get-or-create", {
        project_id: projectId,
        story_key: issue.key,
        story_summary: issue.summary,
        story_description: issue.description || "",
        story_status: issue.status,
        story_priority: issue.priority,
        sprint_id: parseInt(sprintId),
        sprint_name: sprint?.name || "",
      });
      return res.json();
    },
    onSuccess: (data, issue) => {
      setNavigatingKey(null);
      navigate(`/projects/${projectId}/stories/${issue.key}`);
    },
    onError: () => {
      setNavigatingKey(null);
      toast({ title: "Failed to initialize test case", variant: "destructive" });
    },
  });

  const { data: testCaseStatuses } = useQuery<Record<string, any>>({
    queryKey: ["/api/test-execution/sprint-statuses", projectId, sprintId],
    queryFn: async () => {
      const statuses: Record<string, any> = {};
      if (!issuesData?.issues) return statuses;
      for (const issue of issuesData.issues) {
        try {
          const res = await fetch(`/api/test-execution/story/${projectId}/${issue.key}`);
          if (res.ok) {
            const data = await res.json();
            statuses[issue.key] = data;
          }
        } catch {}
      }
      return statuses;
    },
    enabled: !!issuesData?.issues?.length,
  });

  const handleViewTestCases = (issue: JiraIssue) => {
    setNavigatingKey(issue.key);
    createTestCase.mutate(issue);
  };

  if (!project || issuesLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-72" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => navigate(`/projects/${projectId}`)}
        className="gap-2"
        data-testid="button-back-project"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-sprint-name">
          Sprint Issues
        </h1>
        {sprint && (
          <p className="text-muted-foreground mt-1">
            {sprint.name} · {formatDate(sprint.start_date)} – {formatDate(sprint.end_date || sprint.complete_date)}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-0.5">
          {issuesData?.issues?.length || 0} issues in this sprint
        </p>
      </div>

      <Separator />

      <div className="space-y-4">
        {issuesData?.issues?.map((issue) => (
          <Card
            key={issue.key}
            className="p-5 transition-all hover:shadow-md"
            data-testid={`issue-card-${issue.key}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge variant="outline" className="font-mono text-xs" data-testid={`issue-key-${issue.key}`}>
                    {issue.key}
                  </Badge>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {issue.issue_type}
                  </Badge>
                  <PriorityBadge priority={issue.priority} />
                </div>
                <h3 className="font-semibold text-base mb-2" data-testid={`issue-summary-${issue.key}`}>
                  {issue.summary}
                </h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <StatusDot category={issue.status_category} />
                    {issue.status}
                  </span>
                  {issue.assignee && (
                    <span className="flex items-center gap-1.5">
                      {issue.assignee_avatar ? (
                        <img src={issue.assignee_avatar} alt="" className="h-4 w-4 rounded-full" />
                      ) : (
                        <User className="h-3.5 w-3.5" />
                      )}
                      {issue.assignee}
                    </span>
                  )}
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    JIRA
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {testCaseStatuses?.[issue.key] && (
                  <TestStatusBadge status={testCaseStatuses[issue.key].status} />
                )}
                <Button
                  variant="outline"
                  onClick={() => handleViewTestCases(issue)}
                  disabled={navigatingKey === issue.key}
                  className="gap-2"
                  data-testid={`button-test-cases-${issue.key}`}
                >
                  {navigatingKey === issue.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FlaskConical className="h-4 w-4" />
                  )}
                  View / Edit Test Cases
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ category }: { category: string }) {
  const colors: Record<string, string> = {
    "To Do": "bg-gray-400",
    "In Progress": "bg-blue-500",
    "Done": "bg-emerald-500",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[category] || "bg-gray-400"}`} />;
}

function TestStatusBadge({ status }: { status: string }) {
  if (status === "passed") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1" data-testid="badge-test-passed">
        <CheckCircle2 className="h-3 w-3" />
        Passed
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1" data-testid="badge-test-failed">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  if (status === "ready") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs" data-testid="badge-test-ready">
        <Play className="h-3 w-3" />
        Ready
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground" data-testid="badge-test-draft">
        Draft
      </Badge>
    );
  }
  return null;
}
