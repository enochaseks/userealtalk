import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Your space — RealTalk" }] }),
});

type Plan = { id: string; title: string; content: string; created_at: string };
type Conv = { id: string; title: string; updated_at: string };

function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"plans" | "chats" | "insights">("plans");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [openPlan, setOpenPlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("plans").select("*").order("created_at", { ascending: false }).then(({ data }) => setPlans(data ?? []));
    supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).then(({ data }) => setConvs(data ?? []));
  }, [user]);

  if (!user) return null;

  const deletePlan = async (id: string) => {
    await supabase.from("plans").delete().eq("id", id);
    setPlans((p) => p.filter((x) => x.id !== id));
    setOpenPlan(null);
    toast.success("Plan removed");
  };

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Your space</h1>
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
      </div>

      <div className="flex gap-1 border-b border-border mb-6 -mx-1">
        {(["plans", "chats", "insights"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm capitalize transition-colors relative ${
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
            {tab === t && <motion.div layoutId="tab-underline" className="absolute left-0 right-0 -bottom-px h-px bg-primary" />}
          </button>
        ))}
      </div>

      {tab === "plans" && (
        <div className="space-y-3">
          {plans.length === 0 && (
            <EmptyState text="No saved plans yet. After a meaningful answer in chat, tap “Save as Plan”." />
          )}
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpenPlan(p)}
              className="w-full text-left rounded-xl border border-border bg-surface/60 hover:bg-surface-elevated transition-colors p-5"
            >
              <div className="font-serif text-lg">{p.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{new Date(p.created_at).toLocaleDateString()}</div>
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2 whitespace-pre-line">
                {p.content.replace(/[#*_`>]/g, "").trim()}
              </p>
            </button>
          ))}
        </div>
      )}

      {tab === "chats" && (
        <div className="space-y-2">
          {convs.length === 0 && <EmptyState text="No conversations yet. Head to chat to begin." />}
          {convs.map((c) => (
            <Link
              key={c.id}
              to="/"
              search={{ c: c.id } as never}
              className="block rounded-xl border border-border bg-surface/60 hover:bg-surface-elevated transition-colors p-4"
            >
              <div className="text-sm">{c.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{new Date(c.updated_at).toLocaleString()}</div>
            </Link>
          ))}
        </div>
      )}

      {tab === "insights" && (
        <EmptyState text="Insights coming soon — RealTalk will surface patterns it notices in how you think." />
      )}

      {openPlan && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpenPlan(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border border-border rounded-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto p-7"
          >
            <h2 className="font-serif text-2xl mb-4">{openPlan.title}</h2>
            <div className="prose-realtalk">
              <ReactMarkdown>{openPlan.content}</ReactMarkdown>
            </div>
            <div className="flex justify-between mt-6 pt-4 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => deletePlan(openPlan.id)}>Delete</Button>
              <Button variant="secondary" size="sm" onClick={() => setOpenPlan(null)}>Close</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
