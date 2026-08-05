import { Card } from "@/components/ui/card";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center p-12 text-center">
      <div className="text-muted-foreground mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-title">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md" data-testid="text-empty-description">{description}</p>
      {action}
    </Card>
  );
}
