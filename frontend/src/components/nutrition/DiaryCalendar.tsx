import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import { useDiaryCalendar } from "@/hooks/use-nutrition";
import { isoDateToLocalDate, localDateToIsoDate } from "@/lib/nutrition";

type Props = {
  selected: string;
  onSelect: (date: string) => void;
  // A day that can't be picked, e.g. the day being copied from.
  disabledDate?: string;
};

/** Month calendar with the days that have food logged marked. */
export function DiaryCalendar({ selected, onSelect, disabledDate }: Props) {
  const [month, setMonth] = useState(() => isoDateToLocalDate(selected));
  const monthKey = localDateToIsoDate(month).slice(0, 7);
  const calendarQuery = useDiaryCalendar(monthKey);
  const logged = (calendarQuery.data?.days ?? []).map((day) => isoDateToLocalDate(day.date));
  const caloriesByDate = new Map((calendarQuery.data?.days ?? []).map((day) => [day.date, day.calories]));

  return (
    <div>
      <Calendar
        mode="single"
        month={month}
        onMonthChange={setMonth}
        selected={isoDateToLocalDate(selected)}
        onSelect={(date) => date && onSelect(localDateToIsoDate(date))}
        disabled={disabledDate ? isoDateToLocalDate(disabledDate) : undefined}
        modifiers={{ logged }}
        modifiersClassNames={{
          logged: "relative font-semibold after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
        }}
        components={{
          DayContent: ({ date }) => {
            const calories = caloriesByDate.get(localDateToIsoDate(date));
            return (
              <span title={calories !== undefined ? `${calories} kcal logged` : undefined}>{date.getDate()}</span>
            );
          },
        }}
      />
      <p className="px-3 pb-3 text-xs text-muted-foreground">Dots mark days with food logged.</p>
    </div>
  );
}
