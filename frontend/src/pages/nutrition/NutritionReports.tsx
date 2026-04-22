import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNutritionInsights } from "@/hooks/use-nutrition";
import { nutritionTotalsToCsvRows } from "@/lib/nutrition";

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function NutritionReports() {
  const weekInsights = useNutritionInsights(7);
  const monthInsights = useNutritionInsights(30);

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Nutrition Reports</h1>
        <p className="text-muted-foreground">
          Export your diary trends or use these summaries as lightweight weekly and monthly reports.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly report</CardTitle>
            <CardDescription>
              Snapshot of the last 7 days with a CSV export of the daily totals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {weekInsights.data && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Average calories</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {weekInsights.data.averages.calories.toFixed(0)} kcal
                    </p>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Adherence</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {weekInsights.data.adherence_pct.toFixed(0)}%
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{weekInsights.data.headline}</p>
                <Button
                  onClick={() =>
                    downloadCsv(
                      "nutrition-weekly-report.csv",
                      nutritionTotalsToCsvRows(weekInsights.data.daily_series),
                    )
                  }
                >
                  Download weekly CSV
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly report</CardTitle>
            <CardDescription>
              Higher-level view of the last 30 days, including weight movement when available.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {monthInsights.data && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Logged days</p>
                    <p className="mt-2 text-2xl font-semibold">{monthInsights.data.days_with_logs}</p>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Weight change</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {monthInsights.data.weight_change_kg.toFixed(1)} kg
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{monthInsights.data.headline}</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadCsv(
                      "nutrition-monthly-report.csv",
                      nutritionTotalsToCsvRows(monthInsights.data.daily_series),
                    )
                  }
                >
                  Download monthly CSV
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
