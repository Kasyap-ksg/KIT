import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Globe, FolderKanban, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/empty-state";
import type { Domain } from "@/types";

export default function Domains() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: domains, isLoading } = useQuery<Domain[]>({
    queryKey: ["/api/domains"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/domains", { name, description });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setOpen(false);
      setName("");
      setDescription("");
      toast({ title: "Domain created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/domains/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      toast({ title: "Domain deleted" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-domains-title">Domains</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize projects under business domains
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-domain">
              <Plus className="h-4 w-4 mr-2" />
              New Domain
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Domain</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Financial Services"
                  data-testid="input-domain-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this domain..."
                  data-testid="input-domain-description"
                />
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
                className="w-full"
                data-testid="button-submit-domain"
              >
                {createMutation.isPending ? "Creating..." : "Create Domain"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!domains || domains.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-12 w-12" />}
          title="No domains yet"
          description="Create your first domain to start organizing your testing projects."
          action={
            <Button onClick={() => setOpen(true)} data-testid="button-empty-create-domain">
              <Plus className="h-4 w-4 mr-2" />
              Create Domain
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {domains.map((domain) => (
            <Card
              key={domain.id}
              className="p-5 cursor-pointer hover-elevate"
              onClick={() => navigate(`/domains/${domain.id}`)}
              data-testid={`card-domain-${domain.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold" data-testid={`text-domain-name-${domain.id}`}>{domain.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {domain.description || "No description"}
                    </p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(domain.id);
                  }}
                  data-testid={`button-delete-domain-${domain.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                <FolderKanban className="h-3.5 w-3.5" />
                <span>{domain.project_count} project{domain.project_count !== 1 ? "s" : ""}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
