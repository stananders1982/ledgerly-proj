import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type RangeKey = "today" | "week" | "month" | "quarter" | "year";

export function getRange(key: RangeKey): { start: Date; end: Date; label: string } {
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
  }
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as RangeKey)}>
      <TabsList>
        <TabsTrigger value="today">Today</TabsTrigger>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
        <TabsTrigger value="quarter">Quarter</TabsTrigger>
        <TabsTrigger value="year">Year</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
