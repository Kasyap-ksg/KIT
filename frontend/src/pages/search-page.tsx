import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Search,
  Globe,
  FolderKanban,
  AppWindow,
  TestTubes,
  FileCheck,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { SearchResult } from "@/types";

const typeIcons: Record<string, any> = {
  domain: Globe,
  project: FolderKanban,
  application: AppWindow,
  test_suite: TestTubes,
  test_case: FileCheck,
};

const typeLabels: Record<string, string> = {
  domain: "Domain",
  project: "Project",
  application: "Application",
  test_suite: "Test Suite",
  test_case: "Test Case",
};

const typeRoutes: Record<string, string> = {
  domain: "/domains",
  project: "/projects",
  application: "/applications",
  test_suite: "/test-suites",
  test_case: "/test-suites",
};

export default function SearchPage() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const doSearch = async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
      setSearched(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (result: SearchResult) => {
    if (result.type === "test_case" && result.test_suite_id) {
      navigate(`/test-suites/${result.test_suite_id}`);
    } else {
      navigate(`${typeRoutes[result.type]}/${result.id}`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-search-title">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search across domains, projects, applications, test suites, and test cases
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            doSearch(e.target.value);
          }}
          placeholder="Search by name, description, or content..."
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Searching...</div>
      )}

      {searched && results.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No results found for "{query}"</p>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result, i) => {
            const Icon = typeIcons[result.type] || FileCheck;
            return (
              <Card
                key={`${result.type}-${result.id}-${i}`}
                className="p-4 cursor-pointer hover-elevate"
                onClick={() => handleNavigate(result)}
                data-testid={`card-search-result-${i}`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm">{result.name}</h4>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {typeLabels[result.type]}
                      </span>
                      {result.suite_type && <StatusBadge value={result.suite_type} variant="suite_type" />}
                    </div>
                    {result.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {result.description}
                      </p>
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
