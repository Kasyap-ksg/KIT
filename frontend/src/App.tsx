import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Domains from "@/pages/domains";
import DomainDetail from "@/pages/domain-detail";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Applications from "@/pages/applications";
import ApplicationDetail from "@/pages/application-detail";
import TestSuites from "@/pages/test-suites";
import TestSuiteDetail from "@/pages/test-suite-detail";
import SearchPage from "@/pages/search-page";
import DesignValidationPage from "@/pages/design-validation";
import DesignValidationDetail from "@/pages/design-validation-detail";
import SprintIssues from "@/pages/sprint-issues";
import StoryTestCase from "@/pages/story-test-case";
import SelfHealing from "@/pages/self-healing";
import ProductionDefects from "@/pages/production-defects";
import ReleaseReadiness from "@/pages/release-readiness";
import Settings from "@/pages/settings";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/domains" component={Domains} />
      <Route path="/domains/:id">{(params) => <DomainDetail id={params.id} />}</Route>
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:id">{(params) => <ProjectDetail id={params.id} />}</Route>
      <Route path="/projects/:id/defects">{(params) => <ProductionDefects id={params.id} />}</Route>
      <Route path="/projects/:id/readiness">{(params) => <ReleaseReadiness id={params.id} />}</Route>
      <Route path="/applications" component={Applications} />
      <Route path="/applications/:id">{(params) => <ApplicationDetail id={params.id} />}</Route>
      <Route path="/test-suites" component={TestSuites} />
      <Route path="/test-suites/:id">{(params) => <TestSuiteDetail id={params.id} />}</Route>
      <Route path="/design-validation" component={DesignValidationPage} />
      <Route path="/design-validation/:id">{(params) => <DesignValidationDetail id={params.id} />}</Route>
      <Route path="/projects/:projectId/sprints/:sprintId">{(params) => <SprintIssues projectId={params.projectId} sprintId={params.sprintId} />}</Route>
      <Route path="/projects/:projectId/stories/:storyKey">{(params) => <StoryTestCase projectId={params.projectId} storyKey={params.storyKey} />}</Route>
      <Route path="/self-healing" component={SelfHealing} />
      <Route path="/search" component={SearchPage} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 z-50 bg-background">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <ThemeToggle />
                </header>
                <main className="flex-1 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
