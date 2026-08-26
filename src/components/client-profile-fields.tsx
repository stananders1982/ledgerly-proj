/**
 * The CRM profile block for a client: personal details plus the commercial
 * follow-up fields. Used by the client page and the client edit dialog.
 */
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CLIENT_STATUSES, CONTACT_TIMES, GENDERS, STATUS_TONE, riskTone,
  type ClientProfile,
} from "@/lib/client-profile";

const NONE = "_none";

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_TONE[status] ?? "", className)}>
      {status}
    </Badge>
  );
}

export function RiskBadge({
  score, label, className,
}: { score?: number | null; label?: string | null; className?: string }) {
  if (score == null && !label) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("capitalize", riskTone(score), className)}>
      {score != null ? `${score}` : ""}{score != null && label ? " · " : ""}{label ?? ""}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function ClientProfileFields({
  value,
  onChange,
  className,
}: {
  value: ClientProfile;
  onChange: (patch: Partial<ClientProfile>) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <Field label="Date of birth">
        <Input
          type="date"
          className="h-9"
          value={value.date_of_birth ?? ""}
          onChange={(e) => onChange({ date_of_birth: e.target.value || null })}
        />
      </Field>
      <Field label="Age (if no birth date)">
        <Input
          type="number"
          min={0}
          className="h-9"
          value={value.age ?? ""}
          onChange={(e) => onChange({ age: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </Field>
      <Field label="Gender">
        <Select
          value={value.gender ?? NONE}
          onValueChange={(v) => onChange({ gender: v === NONE ? null : v })}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {GENDERS.map((g) => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Status">
        <Select
          value={value.status ?? NONE}
          onValueChange={(v) => onChange({ status: v === NONE ? null : v })}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {CLIENT_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Country">
        <Input className="h-9" value={value.country ?? ""} onChange={(e) => onChange({ country: e.target.value || null })} />
      </Field>
      <Field label="City">
        <Input className="h-9" value={value.city ?? ""} onChange={(e) => onChange({ city: e.target.value || null })} />
      </Field>
      <Field label="Language">
        <Input className="h-9" value={value.language ?? ""} onChange={(e) => onChange({ language: e.target.value || null })} />
      </Field>
      <Field label="Occupation">
        <Input className="h-9" value={value.occupation ?? ""} onChange={(e) => onChange({ occupation: e.target.value || null })} />
      </Field>
      <Field label="Phone">
        <Input className="h-9" value={value.phone ?? ""} onChange={(e) => onChange({ phone: e.target.value || null })} />
      </Field>
      <Field label="Email">
        <Input className="h-9" type="email" value={value.email ?? ""} onChange={(e) => onChange({ email: e.target.value || null })} />
      </Field>
      <Field label="Next follow-up">
        <Input
          type="date"
          className="h-9"
          value={value.next_follow_up ?? ""}
          onChange={(e) => onChange({ next_follow_up: e.target.value || null })}
        />
      </Field>
      <Field label="Best time to call">
        <Select
          value={value.preferred_contact_time ?? NONE}
          onValueChange={(v) => onChange({ preferred_contact_time: v === NONE ? null : v })}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {CONTACT_TIMES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
