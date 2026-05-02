import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/journal")({
  component: JournalPage,
});

type Mood = "Good" | "Okay" | "Hard";

const MOOD_EMOJI: Record<Mood, string> = { Good: "😊", Okay: "😐", Hard: "😔" };
const MOOD_COLOURS: Record<Mood, string> = {
  Good: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Okay: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Hard: "bg-rose-100 text-rose-800 border-rose-300",
};

const AVAILABLE_TAGS = ["money", "career", "mental health", "relationships", "health", "family", "goals"];

type JournalEntry = {
  id: string;
  content: string;
  note: string;
  mood: Mood | null;
  tags: string[];
  created_at: string;
};

export default function JournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // New freeform entry state
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newMood, setNewMood] = useState<Mood | null>(null);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [savingNew, setSavingNew] = useState(false);
  const newTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Per-entry note editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  const load = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { data } = await (supabase as any)
        .from("journal_entries")
        .select("id, content, note, mood, tags, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
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

  const saveNewEntry = async () => {
    const content = newContent.trim();
    if (!content || !user) return;
    setSavingNew(true);
    try {
      const { data, error } = await (supabase as any)
        .from("journal_entries")
        .insert({
          user_id: user.id,
          content,
          note: "",
          mood: newMood,
          tags: newTags,
        })
        .select("id, content, note, mood, tags, created_at")
        .single();
      if (error) throw error;
      setEntries((prev) => [data as JournalEntry, ...prev]);
      setNewContent("");
      setNewMood(null);
      setNewTags([]);
      setShowNewEntry(false);
      toast.success("Entry saved");
    } catch {
      toast.error("Could not save entry");
    } finally {
      setSavingNew(false);
    }
  };

  const startEditNote = (entry: JournalEntry) => {
    setEditingNoteId(entry.id);
    setEditingNoteText(entry.note ?? "");
  };

  const saveNote = async (id: string) => {
    const note = editingNoteText.trim();
    try {
      const { error } = await (supabase as any)
        .from("journal_entries")
        .update({ note })
        .eq("id", id);
      if (error) throw error;
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, note } : e)));
      setEditingNoteId(null);
    } catch {
      toast.error("Could not save note");
    }
  };

  const updateMood = async (id: string, mood: Mood | null) => {
    try {
      const { error } = await (supabase as any)
        .from("journal_entries")
        .update({ mood })
        .eq("id", id);
      if (error) throw error;
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, mood } : e)));
    } catch {
      toast.error("Could not update mood");
    }
  };

  const toggleTag = async (id: string, tag: string, currentTags: string[]) => {
    const next = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    try {
      const { error } = await (supabase as any)
        .from("journal_entries")
        .update({ tags: next })
        .eq("id", id);
      if (error) throw error;
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, tags: next } : e)));
    } catch {
      toast.error("Could not update tags");
    }
  };

  const filteredEntries = search.trim()
    ? entries.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.content.toLowerCase().includes(q) ||
          (e.note && e.note.toLowerCase().includes(q)) ||
          (e.tags && e.tags.some((t) => t.toLowerCase().includes(q)))
        );
      })
    : entries;

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Journal</h1>
        <Button
          size="sm"
          onClick={() => {
            setShowNewEntry((v) => !v);
            if (!showNewEntry) setTimeout(() => newTextareaRef.current?.focus(), 50);
          }}
          className="gap-1.5"
        >
          {showNewEntry ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showNewEntry ? "Cancel" : "New entry"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        AI replies you've saved, plus your own thoughts.
      </p>

      {/* New freeform entry form */}
      {showNewEntry && (
        <div className="rounded-xl border border-border bg-surface/60 px-5 py-4 mb-5 space-y-3">
          <textarea
            ref={newTextareaRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="What's on your mind today?"
            className="w-full min-h-[120px] bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground"
          />
          {/* Mood picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Mood:</span>
            {(["Good", "Okay", "Hard"] as Mood[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setNewMood(newMood === m ? null : m)}
                className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                  newMood === m
                    ? MOOD_COLOURS[m]
                    : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {MOOD_EMOJI[m]} {m}
              </button>
            ))}
          </div>
          {/* Tag picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Tags:</span>
            {AVAILABLE_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setNewTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
                className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                  newTags.includes(tag)
                    ? "bg-primary/10 text-primary border-primary/40"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={!newContent.trim() || savingNew} onClick={() => void saveNewEntry()}>
              Save entry
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries…"
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-transparent outline-none focus:border-foreground/30 placeholder:text-muted-foreground"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!busy && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No entries yet. Write one above or hit <strong>Save to Journal</strong> under any AI reply in chat.
        </p>
      )}

      {!busy && entries.length > 0 && filteredEntries.length === 0 && (
        <p className="text-sm text-muted-foreground">No entries match your search.</p>
      )}

      <div className="space-y-4">
        {filteredEntries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-xl border border-border bg-surface/60 px-5 py-4"
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                {/* Mood badge */}
                {entry.mood && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${MOOD_COLOURS[entry.mood]}`}>
                    {MOOD_EMOJI[entry.mood]} {entry.mood}
                  </span>
                )}
                {/* Topic tags */}
                {entry.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/40"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void deleteEntry(entry.id)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Content */}
            <div className="prose-realtalk text-sm mb-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
            </div>

            {/* Mood picker inline */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-xs text-muted-foreground">Mood:</span>
              {(["Good", "Okay", "Hard"] as Mood[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => void updateMood(entry.id, entry.mood === m ? null : m)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    entry.mood === m
                      ? MOOD_COLOURS[m]
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {MOOD_EMOJI[m]} {m}
                </button>
              ))}
            </div>

            {/* Tag picker inline */}
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <span className="text-xs text-muted-foreground">Tags:</span>
              {AVAILABLE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => void toggleTag(entry.id, tag, entry.tags ?? [])}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    entry.tags?.includes(tag)
                      ? "bg-primary/10 text-primary border-primary/40"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Personal note */}
            {editingNoteId === entry.id ? (
              <div className="mt-1 space-y-1.5">
                <textarea
                  autoFocus
                  value={editingNoteText}
                  onChange={(e) => setEditingNoteText(e.target.value)}
                  placeholder="Add a reflection…"
                  className="w-full min-h-[72px] bg-muted/40 text-sm rounded-lg px-3 py-2 resize-none outline-none border border-border focus:border-foreground/30 placeholder:text-muted-foreground"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void saveNote(entry.id)}>Save note</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startEditNote(entry)}
                className="flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground group w-full text-left"
              >
                <Pencil className="h-3 w-3 mt-0.5 shrink-0 opacity-50 group-hover:opacity-100" />
                <span className={entry.note ? "italic" : "opacity-50"}>
                  {entry.note || "Add a personal note…"}
                </span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
