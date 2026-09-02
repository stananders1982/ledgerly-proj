import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { CompanyBanksAdmin } from "@/components/company-banks-admin";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/banks")({
  head: () => ({
    meta: [
      { title: "Bank Settings — Ledgerly" },
      { name: "description", content: "Add and edit the company bank accounts clients deposit into, each with its own invoice numbering." },
      { property: "og:title", content: "Bank Settings — Ledgerly" },
      { property: "og:description", content: "Add and edit the company bank accounts clients deposit into, each with its own invoice numbering." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BanksPage,
});

function BanksPage() {
  const { isAdmin } = useAuth();

  return (
    <div className="p-6">
      <PageHeader
        title="Bank settings"
        description="Company accounts clients pay into. Each bank numbers its own invoices."
      />
      {isAdmin ? (
        <CompanyBanksAdmin />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Only admins can manage bank accounts.</p>
      )}
    </div>
  );
}
