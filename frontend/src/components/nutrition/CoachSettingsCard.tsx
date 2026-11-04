import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEmailDailyReport } from "@/hooks/use-insight-ai";
import { useNutritionProfile, useUpdateNutritionProfile } from "@/hooks/use-nutrition";
import { useToast } from "@/hooks/use-toast";
import { setCoachBubbleEnabled, useCoachBubbleEnabled } from "@/components/neon/CoachBubble";

const REPORT_HOURS = [18, 19, 20, 21, 22];

// Check-ins and the evening email live on the account, so the phone app shares them.
export function CoachSettingsCard() {
  const { data: profile } = useNutritionProfile();
  const updateProfile = useUpdateNutritionProfile();
  const emailReport = useEmailDailyReport();
  const { toast } = useToast();
  const bubbleEnabled = useCoachBubbleEnabled();

  const save = (patch: { logging_reminders?: boolean; daily_report_email?: boolean; daily_report_hour?: number }) =>
    updateProfile.mutate(patch, {
      onError: (error) =>
        toast({
          title: "Could not save",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        }),
    });

  const sendNow = () =>
    emailReport.mutate(undefined, {
      onSuccess: ({ sent_to }) => toast({ title: "Report sent", description: `Today's report is on its way to ${sent_to}.` }),
      onError: (error) =>
        toast({
          title: "Could not send",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        }),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coach check-ins</CardTitle>
        <CardDescription>How the AI coach reaches out to you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="coach-bubble" className="space-y-1">
            <span className="block font-medium">Floating coach bubble</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Chat with the coach from any nutrition page.
            </span>
          </Label>
          <Switch id="coach-bubble" checked={bubbleEnabled} onCheckedChange={setCoachBubbleEnabled} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="coach-reminders" className="space-y-1">
            <span className="block font-medium">Missed-day check-ins</span>
            <span className="block text-xs font-normal text-muted-foreground">
              A pop-up after 2 days without logging.
            </span>
          </Label>
          <Switch
            id="coach-reminders"
            checked={profile?.logging_reminders ?? false}
            disabled={!profile}
            onCheckedChange={(checked) => save({ logging_reminders: checked })}
          />
        </div>
        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="coach-email" className="space-y-1">
            <span className="block font-medium">Daily email report</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Food, water, exercise and a coach's note.
            </span>
          </Label>
          <Switch
            id="coach-email"
            checked={profile?.daily_report_email ?? false}
            disabled={!profile}
            onCheckedChange={(checked) => save({ daily_report_email: checked })}
          />
        </div>
        {profile?.daily_report_email && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Send at</span>
            <Select
              value={String(profile.daily_report_hour ?? 20)}
              onValueChange={(value) => save({ daily_report_hour: Number(value) })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_HOURS.map((hour) => (
                  <SelectItem key={hour} value={String(hour)}>
                    {hour}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button type="button" variant="outline" className="w-full" disabled={emailReport.isPending} onClick={sendNow}>
          {emailReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          Email me today's report
        </Button>
      </CardContent>
    </Card>
  );
}
