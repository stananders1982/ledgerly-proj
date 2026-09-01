/**
 * The CRM profile block for a client: personal details plus the commercial
 * follow-up fields. Used by the client page and the client edit dialog.
 */
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import {
  TIER_LABEL, TIER_TONE, isWhale, normaliseOpportunityTier, opportunityTone,
  valueTier, type TierThresholds,
} from "@/lib/whales";
import {
  CLIENT_STATUSES, CONTACT_TIMES, GENDERS, STATUS_TONE, riskTone,
  type ClientProfile,
} from "@/lib/client-profile";

const NONE = "_none";

export function StatusBadge({ status, className, prefix }: { status?: string | null; className?: string; prefix?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_TONE[status] ?? "", className)} title="Where the client sits in the sales pipeline">
      {prefix ? <span className="font-normal normal-case opacity-70">{prefix} </span> : null}
      {status}
    </Badge>
  );
}

export function RiskBadge({
  score, label, className, prefix,
}: { score?: number | null; label?: string | null; className?: string; prefix?: string }) {
  if (score == null && !label) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("capitalize", riskTone(score), className)} title="AI churn-risk read (0–100)">
      {prefix ? <span className="font-normal normal-case opacity-70">{prefix} </span> : null}
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
      <Field label="Potential value ($)">
        <Input
          type="number"
          min={0}
          step={1000}
          placeholder="e.g. 100000"
          className="h-9"
          value={value.potential_value ?? ""}
          onChange={(e) => onChange({ potential_value: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </Field>
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

/** Shown next to a client name when their potential value clears the threshold. */
export function WhaleBadge({
  value, threshold, className,
}: { value?: number | null; threshold: number; className?: string }) {
  if (!isWhale(value, threshold)) return null;
  return (
    <Badge
      variant="outline"
      className={cn("border-sky-500/50 text-sky-600 dark:text-sky-400", className)}
      title={`Potential ${fmtMoney(Number(value))}`}
    >
      Whale
    </Badge>
  );
}

/** The value band a client's potential value falls into. */
export function TierBadge({
  value, thresholds, className, showUnrated = false,
}: { value?: number | null; thresholds: TierThresholds; className?: string; showUnrated?: boolean }) {
  const tier = valueTier(value, thresholds);
  if (tier === "unrated" && !showUnrated) return null;
  return (
    <Badge
      variant="outline"
      className={cn(TIER_TONE[tier], className)}
      title={value ? `Potential ${fmtMoney(Number(value))}` : "No potential value recorded"}
    >
      {TIER_LABEL[tier]}
    </Badge>
  );
}

/** AI read of how much more money this client can realistically put in. */
export function OpportunityBadge({
  score, label, className,
}: { score?: number | null; label?: string | null; className?: string }) {
  if (score == null && !label) return <span className="text-muted-foreground">—</span>;
  const tier = normaliseOpportunityTier(label);
  return (
    <Badge variant="outline" className={cn("capitalize", opportunityTone(score), className)}>
      {score != null ? `${score}` : ""}{score != null && label ? " · " : ""}{tier !== "unknown" ? tier : (label ?? "")}
    </Badge>
  );
}

const APPETITE = [
  { v: 1, l: "1 · none" },
  { v: 2, l: "2 · low" },
  { v: 3, l: "3 · medium" },
  { v: 4, l: "4 · high" },
  { v: 5, l: "5 · ready now" },
];

/**
 * Financial KYC: what we know about the money behind the client. This is what
 * the potential value and the AI opportunity score are judged against.
 */
export function ClientKycFields({
  value, onChange, className,
}: {
  value: ClientProfile;
  onChange: (patch: Partial<ClientProfile>) => void;
  className?: string;
}) {
  const numField = (key: keyof ClientProfile, label: string, placeholder?: string) => (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        step={1000}
        placeholder={placeholder}
        className="h-9"
        value={(value[key] as number | null | undefined) ?? ""}
        onChange={(e) => onChange({ [key]: e.target.value === "" ? null : Number(e.target.value) } as Partial<ClientProfile>)}
      />
    </Field>
  );
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {numField("net_worth", "Net worth ($)", "e.g. 400000")}
      {numField("liquid_funds", "Liquid funds ($)", "cash they can move now")}
      {numField("monthly_income", "Monthly income ($)", "e.g. 8000")}
      {numField("exposure_elsewhere", "Invested elsewhere ($)", "with other brokers")}
      <Field label="Source of funds">
        <Input
          className="h-9"
          placeholder="salary, business, inheritance, crypto…"
          value={value.source_of_funds ?? ""}
          onChange={(e) => onChange({ source_of_funds: e.target.value || null })}
        />
      </Field>
      <Field label="Deposit appetite">
        <Select
          value={value.deposit_appetite != null ? String(value.deposit_appetite) : NONE}
          onValueChange={(v) => onChange({ deposit_appetite: v === NONE ? null : Number(v) })}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {APPETITE.map((a) => <SelectItem key={a.v} value={String(a.v)}>{a.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
