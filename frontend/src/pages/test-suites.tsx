import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { TestTubes } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import type { TestSuite } from "@/types";

export default function TestSuites() {
  const [, navigate] = useLocation();

  const { data: suites, isLoading } = useQuery<TestSuite[]>({
    queryKey: ["/api/test-suites"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-suites-title">Test Suites</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All test suites across projects
        </p>
      </div>

      {!suites || suites.length === 0 ? (
        <EmptyState
          icon={<TestTubes className="h-12 w-12" />}
          title="No test suites yet"
          description="Create test suites from within a project."
        />
      ) : (
        <div className="space-y-3">
          {suites.map((suite) => {
            const progress = suite.total_cases > 0 ? Math.round((suite.passed_cases / suite.total_cases) * 100) : 0;
            return (
              <Card
                key={suite.id}
                className="p-4 cursor-pointer hover-elevate"
                onClick={() => navigate(`/test-suites/${suite.id}`)}
                data-testid={`card-suite-${suite.id}`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-semibold">{suite.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <StatusBadge value={suite.suite_type} variant="suite_type" />
                      <StatusBadge value={suite.status} />
                    </div>
                    {suite.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{suite.description}</p>
                    )}
                  </div>
                  <div className="text-right text-sm min-w-[120px]">
                    <div className="text-muted-foreground">{suite.total_cases} test cases</div>
                    <div className="flex items-center gap-3 mt-1 justify-end">
                      <span className="text-emerald-600 dark:text-emerald-400">{suite.passed_cases} passed</span>
                      <span className="text-red-600 dark:text-red-400">{suite.failed_cases} failed</span>
                    </div>
                    {suite.total_cases > 0 && (
                      <Progress value={progress} className="h-1.5 mt-2" />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
