import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  iconColor?: string;
}

export function MetricCard({ icon: Icon, label, value, subtitle, iconColor = 'text-primary' }: MetricCardProps) {
  return (
    <Card className="hover-lift transition-all duration-300 hover:shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl bg-primary/10 ${iconColor}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
        <div className="text-3xl font-bold mb-1">{value}</div>
        <div className="text-sm text-muted-foreground mb-1">{label}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground/70">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}
