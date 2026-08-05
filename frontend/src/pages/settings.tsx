import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, Plus, Loader2 } from "lucide-react";
import type { JiraConnection } from "@/types";

export default function Settings() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");

  const { data: connections, isLoading } = useQuery<JiraConnection[]>({
    queryKey: ["/api/jira-connections"],
  });

  const createConnection = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jira-connections", {
        name,
        base_url: baseUrl,
        email,
        api_token: apiToken,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jira-connections"] });
      setName("");
      setBaseUrl("");
      setEmail("");
      setApiToken("");
      toast({ title: "Jira connection added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add connection", description: error.message, variant: "destructive" });
    }
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/jira-connections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jira-connections"] });
      toast({ title: "Connection deleted" });
    },
  });

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1.5">Manage global application settings and integrations.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Jira Connections</h2>
        
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-4">Add New Connection</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Connection Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Company Jira" />
            </div>
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-company.atlassian.net" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="space-y-2">
              <Label>API Token</Label>
              <Input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="Your Jira API token" />
            </div>
          </div>
          <Button 
            className="mt-4" 
            onClick={() => createConnection.mutate()} 
            disabled={!name || !baseUrl || !email || !apiToken || createConnection.isPending}
          >
            {createConnection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Connection
          </Button>
        </Card>

        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading connections...
            </div>
          ) : connections?.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-sm text-muted-foreground">No Jira connections configured yet.</p>
            </Card>
          ) : (
            connections?.map((conn) => (
              <Card key={conn.id} className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{conn.name}</h4>
                  <p className="text-sm text-muted-foreground">{conn.base_url}</p>
                  <p className="text-xs text-muted-foreground">{conn.email}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteConnection.mutate(conn.id)} disabled={deleteConnection.isPending}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
