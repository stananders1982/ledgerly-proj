import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { BusinessAssistantChat } from "@/components/business-assistant-chat";

export const Route = createFileRoute("/_authenticated/assistant/business")({
  validateSearch: (search: Record<string, unknown>) => ({
    thread: typeof search.thread === "string" ? search.thread : nanoid(),
  }),
  head: () => ({
    title: "Business assistant — Ledgerly",
    meta: [
      { title: "Business assistant — Ledgerly" },
      {
        property: "og:title",
        content: "Business assistant — Ledgerly",
      },
      {
        name: "description",
        content: "Ask natural-language questions about your Ledgerly workspace.",
      },
      {
        property: "og:description",
        content: "Ask natural-language questions about your Ledgerly workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BusinessAssistantPage,
});

function BusinessAssistantPage() {
  const { thread } = Route.useSearch();
  return (
    <div className="flex h-[calc(100vh-var(--header-height,3rem))] flex-col overflow-hidden">
      <BusinessAssistantChat threadId={thread} initialMessages={[]} />
    </div>
  );
}
