import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/api-docs")({
  head: () => ({
    meta: [
      { title: "API Documentation — Ledgerly" },
      { name: "description", content: "REST endpoints, authentication and curl examples for pushing leads and deposits into Ledgerly." },
      { property: "og:title", content: "API Documentation — Ledgerly" },
      { property: "og:description", content: "REST endpoints, authentication and curl examples for pushing leads and deposits into Ledgerly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApiDocsPage,
});

const BASE = typeof window === "undefined" ? "https://your-app.lovable.app" : window.location.origin;

type Endpoint = {
  method: "GET" | "POST";
  path: string;
  permission: string;
  summary: string;
  request?: string;
  response: string;
  curl: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/api/public/v1/leads",
    permission: "write_leads",
    summary: "Create a daily lead entry (received / activated / reported counts and cost).",
    request: `{
  "entry_date": "2026-08-07",
  "source": "FTDhub",          // or "source_id": "<uuid>"
  "campaign": "Facebook-EU",
  "received": 40,
  "activated": 6,
  "reported": 5,
  "cost": 1200,
  "notes": "Pushed by CRM"
}`,
    response: `{
  "data": {
    "id": "…", "entry_date": "2026-08-07",
    "received": 40, "activated": 6, "reported": 5,
    "converted": 0, "cost": 1200
  }
}`,
    curl: `curl -X POST "${BASE}/api/public/v1/leads" \\
  -H "Authorization: Bearer $LEDGERLY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"entry_date":"2026-08-07","source":"FTDhub","received":40,"activated":6,"reported":5,"cost":1200}'`,
  },
  {
    method: "POST",
    path: "/api/public/v1/deposits",
    permission: "write_deposits",
    summary:
      "Record a client deposit. Links to an activated client by activation_id, or by customer_name (most recent activation wins).",
    request: `{
  "customer_name": "Carol Lane",   // or "activation_id": "<uuid>"
  "amount": 500,
  "date": "2026-08-07",
  "method": "card",
  "method_provider": "Stripe",
  "notes": "API push"
}`,
    response: `{
  "data": {
    "id": "…", "customer_name": "Carol Lane", "amount": 500,
    "date": "2026-08-07", "activation_id": "…",
    "method": "card", "method_provider": "Stripe"
  }
}`,
    curl: `curl -X POST "${BASE}/api/public/v1/deposits" \\
  -H "Authorization: Bearer $LEDGERLY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"customer_name":"Carol Lane","amount":500,"date":"2026-08-07","method":"card"}'`,
  },
  {
    method: "GET",
    path: "/api/public/v1/leads",
    permission: "read_leads",
    summary: "List daily lead entries. Query params: from, to (YYYY-MM-DD), limit (max 500), offset.",
    response: `{
  "data": [{ "id": "…", "entry_date": "2026-08-07", "received": 40, "activated": 6, "reported": 5, "cost": 1200 }],
  "total": 128, "limit": 100, "offset": 0
}`,
    curl: `curl "${BASE}/api/public/v1/leads?from=2026-08-01&to=2026-08-31&limit=50" \\
  -H "Authorization: Bearer $LEDGERLY_API_KEY"`,
  },
  {
    method: "GET",
    path: "/api/public/v1/activations",
    permission: "read_leads",
    summary: "List activated clients. Query params: from, to (activation date), limit, offset.",
    response: `{
  "data": [{ "id": "…", "lead_name": "Carol Lane", "activation_date": "2026-08-03",
             "qualified_at": "2026-08-04", "balance": 250, "potential": "high", "answered": true }],
  "total": 57, "limit": 100, "offset": 0
}`,
    curl: `curl "${BASE}/api/public/v1/activations?from=2026-08-01&to=2026-08-31" \\
  -H "Authorization: Bearer $LEDGERLY_API_KEY"`,
  },
  {
    method: "GET",
    path: "/api/public/v1/reports/summary",
    permission: "read_reports",
    summary: "P&L summary for a period (defaults to the current month).",
    response: `{
  "period": { "from": "2026-08-01", "to": "2026-08-31" },
  "revenue": { "gross": 120500, "withdrawals": 8200, "net": 112300, "deposits_count": 214 },
  "costs": { "expenses": 24000, "lead_cost": 31000, "total": 55000 },
  "leads": { "received": 820, "activated": 96, "reported": 88 },
  "activations": { "total": 96, "qualified": 74 },
  "net_profit": 57300
}`,
    curl: `curl "${BASE}/api/public/v1/reports/summary?from=2026-08-01&to=2026-08-31" \\
  -H "Authorization: Bearer $LEDGERLY_API_KEY"`,
  },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        toast.success("Copied");
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Copy className="h-3.5 w-3.5" /> {done ? "Copied" : "Copy"}
    </Button>
  );
}

function ApiDocsPage() {
  return (
    <div>
      <PageHeader
        title="API documentation"
        description="Push leads and deposits into Ledgerly from any external system."
        actions={
          <Button variant="outline" asChild>
            <Link to="/settings">
              <ArrowLeft className="h-4 w-4" /> Back to settings
            </Link>
          </Button>
        }
      />

      <div className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-semibold">Authentication</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a key in Settings → API keys and send it on every request. Requests are scoped to the workspace that
          owns the key, and each call is written to the security log.
        </p>
        <div className="mt-3">
          <Code>{`Authorization: Bearer ldg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Base URL: <code className="font-mono">{BASE}</code> · Errors return{" "}
          <code className="font-mono">{`{ "error": "…" }`}</code> with status 400, 401, 403, 404 or 500.
        </p>
      </div>

      <div className="grid gap-4">
        {ENDPOINTS.map((e) => (
          <section key={`${e.method} ${e.path}`} className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={e.method === "POST" ? "default" : "secondary"}>{e.method}</Badge>
              <code className="font-mono text-sm">{e.path}</code>
              <Badge variant="outline" className="text-[10px]">
                {e.permission}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{e.summary}</p>

            {e.request && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Request body</div>
                <Code>{e.request}</Code>
              </div>
            )}

            <div className="mt-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Response</div>
              <Code>{e.response}</Code>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Try it</span>
                <CopyButton value={e.curl} />
              </div>
              <Code>{e.curl}</Code>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
