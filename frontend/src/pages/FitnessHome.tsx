import { Link } from "react-router-dom";
import { ArrowLeft, Dumbbell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Placeholder for the Fitness tool until the real training app is built.
export default function FitnessHome() {
  return (
    <div className="space-y-6 animate-in">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/dashboard">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to dashboard
        </Link>
      </Button>
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 shadow-[0_0_32px_hsl(var(--primary)/0.35)]">
            <Dumbbell className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Fitness is coming soon</h1>
          <p className="max-w-md text-muted-foreground">
            Workouts, training plans and progress tracking will live here. Until then, your workout
            program is on the Nutrition Plan page.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/tools/nutrition/plan">Open my workout plan</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard/tools">Back to tools</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
