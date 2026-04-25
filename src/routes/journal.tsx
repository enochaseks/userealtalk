import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/journal")({
  component: JournalPage,
});

type JournalEntry = {
  id: string;
  content: string;
  note: string;
  created_at: string;
};

export default function JournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { data } = await (supabase as any)
        .from("journal_entries")
        .select("id, content, note, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      setEntries((data as JournalEntry[]) ?? []);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id]);

  const deleteEntry = async (id: string) => {
    try {
      await (supabase as any).from("journal_entries").delete().eq("id", id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Entry removed");
    } catch {
      toast.error("Could not remove entry");
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className="text-2xl font-bold mb-1">Journal</h1>
      <p className="text-sm text-muted-foreground mb-6">
        AI replies you've saved for later.
      </p>

      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!busy && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No entries yet. Hit <strong>Save to Journal</strong> under any AI reply in chat.
        </p>
      )}

      <div className="space-y-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-xl border border-border bg-surface/60 px-5 py-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void deleteEntry(entry.id)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="prose-realtalk text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {entry.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
