import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNutritionInsights } from "@/hooks/use-nutrition";
import { formatIsoDate } from "@/lib/nutrition";

export default function NutritionInsights() {
  const [days, setDays] = useState(7);
  const insightsQuery = useNutritionInsights(days);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Nutrition Insights</h1>
          <p className="text-muted-foreground">
            Review your calorie consistency, macro averages, and weight trend over time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={days === 7 ? "default" : "outline"}
            onClick={() => setDays(7)}
          >
            7 days
          </Button>
          <Button
            variant={days === 30 ? "default" : "outline"}
            onClick={() => setDays(30)}
          >
            30 days
          </Button>
        </div>
      </div>

      {insightsQuery.isLoading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Loading insights...</p>
          </CardContent>
        </Card>
      )}

      {insightsQuery.data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Days with logs</CardDescription>
                <CardTitle>{insightsQuery.data.days_with_logs}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Out of the last {insightsQuery.data.days} day(s)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Adherence</CardDescription>
                <CardTitle>{insightsQuery.data.adherence_pct.toFixed(0)}%</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {insightsQuery.data.days_on_target} day(s) within calorie target
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Average calories</CardDescription>
                <CardTitle>{insightsQuery.data.averages.calories.toFixed(0)} kcal</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Average over logged days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Weight change</CardDescription>
                <CardTitle>{insightsQuery.data.weight_change_kg.toFixed(1)} kg</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{insightsQuery.data.headline}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Calories by day</CardTitle>
                <CardDescription>
                  Compare your logged intake across the last {insightsQuery.data.days} day(s).
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insightsQuery.data.daily_series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => formatIsoDate(value)}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value} kcal`, "Calories"]}
                      labelFormatter={(label) => formatIsoDate(label)}
                    />
                    <Bar dataKey="calories" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weight trend</CardTitle>
                <CardDescription>
                  Weight entries are optional, but they make long-term patterns easier to see.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                {insightsQuery.data.weight_series.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                    No weight entries in this window yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={insightsQuery.data.weight_series}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="entry_date"
                        tickFormatter={(value) => formatIsoDate(value)}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis tick={{ fontSize: 12 }} domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip
                        formatter={(value: number) => [`${value} kg`, "Weight"]}
                        labelFormatter={(label) => formatIsoDate(label)}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight_kg"
                        stroke="#16a34a"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily breakdown</CardTitle>
              <CardDescription>
                Useful when you want to see consistency instead of just averages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {insightsQuery.data.daily_series.map((day) => (
                  <div
                    key={day.date}
                    className="grid gap-2 rounded-xl border border-border px-4 py-3 text-sm md:grid-cols-5"
                  >
                    <span className="font-medium">{formatIsoDate(day.date)}</span>
                    <span className="text-muted-foreground">{day.calories.toFixed(0)} kcal</span>
                    <span className="text-muted-foreground">P {day.protein_grams.toFixed(0)}g</span>
                    <span className="text-muted-foreground">C {day.carbs_grams.toFixed(0)}g</span>
                    <span className="text-muted-foreground">F {day.fat_grams.toFixed(0)}g</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
