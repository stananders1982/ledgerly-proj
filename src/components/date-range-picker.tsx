import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

export type RangeKey = "today" | "week" | "month" | "quarter" | "year" | "custom";

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function getRange(
  key: RangeKey,
  custom?: { start?: string; end?: string },
): { start: Date; end: Date; label: string } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  switch (key) {
    case "today":
      return { start, end, label: "Today" };
    case "week": {
      const s = new Date(start);
      s.setDate(s.getDate() - 6);
      return { start: s, end, label: "Last 7 days" };
    }
    case "month": {
      const s = new Date(start.getFullYear(), start.getMonth(), 1);
      return { start: s, end, label: "This month" };
    }
    case "quarter": {
      const q = Math.floor(start.getMonth() / 3);
      const s = new Date(start.getFullYear(), q * 3, 1);
      return { start: s, end, label: "This quarter" };
    }
    case "year": {
      const s = new Date(start.getFullYear(), 0, 1);
      return { start: s, end, label: "This year" };
    }
    case "custom": {
      const s = custom?.start ? new Date(custom.start + "T00:00:00") : start;
      const e = custom?.end ? new Date(custom.end + "T23:59:59") : end;
      const a = s.getTime() <= e.getTime() ? s : e;
      const b = s.getTime() <= e.getTime() ? e : s;
      return { start: a, end: b, label: `${iso(a)} → ${iso(b)}` };
    }
  }
}

export function DateRangePicker({
  value,
  onChange,
  customStart,
  customEnd,
  onCustomChange,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
  customStart?: string;
  customEnd?: string;
  onCustomChange?: (start: string, end: string) => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Tabs value={value} onValueChange={(v) => onChange(v as RangeKey)} className="max-w-full overflow-x-auto">
        <TabsList className="w-max">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="quarter">Quarter</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
      </Tabs>

      {value === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={customStart ?? ""}
            onChange={(e) => onCustomChange?.(e.target.value, customEnd ?? e.target.value)}
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={customEnd ?? ""}
            onChange={(e) => onCustomChange?.(customStart ?? e.target.value, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
