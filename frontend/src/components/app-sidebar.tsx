import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Globe,
  FolderKanban,
  AppWindow,
  TestTubes,
  Search,
  Palette,
  Shield,
  Sparkles,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
};

const globalItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Search", url: "/search", icon: Search },
  { title: "Settings", url: "/settings", icon: Settings },
];

const setupItems: NavItem[] = [
  { title: "Domains", url: "/domains", icon: Globe, accent: "accent-dot-domains" },
  { title: "Projects", url: "/projects", icon: FolderKanban, accent: "accent-dot-projects" },
  { title: "Applications", url: "/applications", icon: AppWindow, accent: "accent-dot-applications" },
];

const qualityItems: NavItem[] = [
  { title: "Test Suites", url: "/test-suites", icon: TestTubes, accent: "accent-dot-test-suites" },
  { title: "Design Validation", url: "/design-validation", icon: Palette, accent: "accent-dot-design" },
  { title: "Self-Healing", url: "/self-healing", icon: Shield, accent: "accent-dot-healing" },
];

function NavSection({ items, isActive }: { items: NavItem[]; isActive: (u: string) => boolean }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isActive(item.url);
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              data-active={active}
              className={active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : ""}
            >
              <Link
                href={item.url}
                data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                className="relative"
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.title}</span>
                {item.accent && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${item.accent} ${active ? "live-dot" : "opacity-60"}`}
                    aria-hidden
                  />
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const [location] = useLocation();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" data-testid="link-home">
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="relative aurora-halo rounded-lg">
              <img
                src="/images/kit-logo.png"
                alt="KIT Logo"
                className="w-9 h-9 rounded-lg relative shadow-md"
              />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-none flex items-center gap-1.5">
                KIT
                <Sparkles className="h-3 w-3 text-primary" />
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Ksquare Intelligent Testing
              </p>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavSection items={globalItems} isActive={isActive} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold px-3 mt-2">
            Setup
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavSection items={setupItems} isActive={isActive} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold px-3 mt-2">
            Quality Pipeline
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavSection items={qualityItems} isActive={isActive} />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Pipeline visualization */}
        <div className="mx-3 mt-4 mb-2 p-3 rounded-lg border border-sidebar-border bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-2">
            Flow
          </div>
          <div className="flex items-center gap-1 flex-wrap text-[10px] font-medium">
            <span className="px-1.5 py-0.5 rounded module-chip-applications">App</span>
            <span className="text-muted-foreground/60">→</span>
            <span className="px-1.5 py-0.5 rounded module-chip-test-suites">Tests</span>
            <span className="text-muted-foreground/60">→</span>
            <span className="px-1.5 py-0.5 rounded module-chip-design">Design</span>
            <span className="text-muted-foreground/60">→</span>
            <span className="px-1.5 py-0.5 rounded module-chip-healing">Heal</span>
          </div>
        </div>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 live-dot" />
          KIT v1.0 &middot; AI-Powered QA
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
