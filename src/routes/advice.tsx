import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/advice")({
  component: AdvicePage,
  head: () => ({
    meta: [
      { title: "Advice Library - RealTalk" },
      {
        name: "description",
        content:
          "Practical advice from the RealTalk community on overthinking, work, money, relationships, and mental health.",
      },
    ],
    links: [{ rel: "canonical", href: "https://userealtalk.co.uk/advice" }],
  }),
});

const NOTIF_KEY = (uid: string) => `rte_advice_notif_${uid}`;
const SEEN_KEY = (uid: string) => `rte_advice_seen_${uid}`;

function getSeenStatuses(uid: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY(uid)) ?? "{}");
  } catch {
    return {};
  }
}

function saveSeenStatuses(uid: string, map: Record<string, string>) {
  try {
    localStorage.setItem(SEEN_KEY(uid), JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function clearNotif(uid: string) {
  try {
    localStorage.removeItem(NOTIF_KEY(uid));
    // Notify other tabs / nav
    window.dispatchEvent(new StorageEvent("storage", { key: NOTIF_KEY(uid) }));
  } catch {
    // ignore
  }
}

type ReactionType = "helpful" | "inspiring" | "practical" | "supportive";

type AdvicePost = {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  helpful_count: number;
  inspiring_count: number;
  practical_count: number;
  supportive_count: number;
  report_count: number;
  status: "pending" | "approved" | "rejected" | "removed";
  created_at: string;
  is_anonymous: boolean;
  slug?: string;
};

const REACTIONS: { key: ReactionType; emoji: string; label: string }[] = [
  { key: "helpful", emoji: "👍", label: "Helpful" },
  { key: "inspiring", emoji: "💡", label: "Inspiring" },
  { key: "practical", emoji: "🛠️", label: "Practical" },
  { key: "supportive", emoji: "❤️", label: "Supportive" },
];

const CATEGORIES = ["all", "general", "benefits", "money", "mental-health", "work", "relationships"] as const;

function excerpt(text: string, maxChars = 220) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}...`;
}

function AdvicePage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();

  const [posts, setPosts] = useState<AdvicePost[]>([]);
  const [myPosts, setMyPosts] = useState<AdvicePost[]>([]);
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [filterCategory, setFilterCategory] = useState<(typeof CATEGORIES)[number]>("all");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Exclude<(typeof CATEGORIES)[number], "all">>("general");
  const [tagInput, setTagInput] = useState("");
  const [anonymous, setAnonymous] = useState(true);

  // Edit state for own posts
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState<Exclude<(typeof CATEGORIES)[number], "all">>("general");
  const [editTagInput, setEditTagInput] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  // Submit dialog state
  const [submitOpen, setSubmitOpen] = useState(false);

  // Report dialog state
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("Potentially unsafe or misleading");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // User's existing reactions per post (postId -> reaction)
  const [userReactions, setUserReactions] = useState<Record<string, ReactionType>>({});

  // RealTalk clarification state
  const [clarifyPost, setClarifyPost] = useState<AdvicePost | null>(null);
  const [clarifyText, setClarifyText] = useState("");
  const [clarifyLoading, setClarifyLoading] = useState(false);

  const REPORT_REASONS = [
    "Potentially unsafe or misleading",
    "Inappropriate or offensive content",
    "Spam or self-promotion",
    "Contains personal information",
    "Other",
  ] as const;

  const parsedTags = useMemo(() => {
    return tagInput
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
  }, [tagInput]);

  const loadAdvice = async (silent = false) => {
    if (!silent) setBusy(true);
    try {
      const client = supabase as any;
      let query = client
        .from("advice_posts")
        .select("id, title, body, category, tags, helpful_count, inspiring_count, practical_count, supportive_count, report_count, status, created_at, is_anonymous, slug")
        .eq("status", "approved")
        .order("helpful_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (filterCategory !== "all") {
        query = query.eq("category", filterCategory);
      }

      if (searchQuery.trim()) {
        const q = `%${searchQuery.trim()}%`;
        query = query.or(`title.ilike.${q},body.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPosts((data ?? []) as AdvicePost[]);

      if (!user) {
        setMyPosts([]);
        setNewPostIds(new Set());
        setUserReactions({});
        return;
      }

      // Fetch current user's reactions for the loaded posts
      const loadedPostIds = ((data ?? []) as AdvicePost[]).map((p) => p.id);
      if (loadedPostIds.length > 0) {
        const { data: fbData } = await (supabase as any)
          .from("advice_feedback")
          .select("advice_post_id, reaction")
          .eq("user_id", user.id)
          .in("advice_post_id", loadedPostIds);
        const reactions: Record<string, ReactionType> = {};
        for (const row of (fbData ?? [])) {
          reactions[String(row.advice_post_id)] = row.reaction as ReactionType;
        }
        setUserReactions(reactions);
      } else {
        setUserReactions({});
      }

      const { data: mineData, error: mineError } = await client
        .from("advice_posts")
        .select("id, title, body, category, tags, helpful_count, inspiring_count, practical_count, supportive_count, report_count, status, moderation_notes, created_at, is_anonymous, slug")
        .eq("author_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (mineError) throw mineError;

      const mine = (mineData ?? []) as AdvicePost[];
      setMyPosts(mine);

      const seen = getSeenStatuses(user.id);
      const changed = new Set<string>();
      const updated: Record<string, string> = { ...seen };
      for (const p of mine) {
        const prev = seen[p.id];
        if (p.status !== "pending" && prev !== p.status) {
          changed.add(p.id);
        }
        updated[p.id] = p.status;
      }
      saveSeenStatuses(user.id, updated);
      if (changed.size > 0) {
        try {
          localStorage.setItem(NOTIF_KEY(user.id), String(changed.size));
          window.dispatchEvent(new StorageEvent("storage", { key: NOTIF_KEY(user.id), newValue: String(changed.size) }));
        } catch {
          // ignore
        }
      }
      setNewPostIds(changed);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load advice");
    } finally {
      if (!silent) setBusy(false);
    }
  };

  useEffect(() => {
    void loadAdvice();
  }, [user?.id, filterCategory, searchQuery]);

  // Clear notification badge when signed-in user views this page
  useEffect(() => {
    if (user?.id) clearNotif(user.id);
  }, [user?.id]);

  const submitAdvice = async () => {
    if (!user || submitting) return;

    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (cleanTitle.length < 8 || cleanTitle.length > 140) {
      toast.error("Title should be 8-140 characters.");
      return;
    }
    if (cleanBody.length < 30 || cleanBody.length > 4000) {
      toast.error("Advice should be 30-4000 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const client = supabase as any;
      const { data: insertedPost, error } = await client
        .from("advice_posts")
        .insert({
          author_user_id: user.id,
          is_anonymous: anonymous,
          title: cleanTitle,
          body: cleanBody,
          category,
          tags: parsedTags,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) throw error;

      let moderationStatus: "approved" | "rejected" | "pending" = "pending";
      if (insertedPost?.id) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (accessToken) {
            const { data: moderationData, error: moderationError } = await supabase.functions.invoke("advice-admin", {
              body: { action: "auto_moderate", postId: insertedPost.id },
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!moderationError && moderationData?.status) {
              moderationStatus = moderationData.status as "approved" | "rejected" | "pending";
            }
          }
        } catch {
          // If moderation call fails, post stays pending for manual review.
        }
      }

      setTitle("");
      setBody("");
      setTagInput("");
      setCategory("general");
      setAnonymous(true);
      setSubmitOpen(false);
      if (moderationStatus === "approved") {
        toast.success("Advice approved and published.");
      } else if (moderationStatus === "rejected") {
        toast.error("Advice was rejected by safety checks.");
      } else {
        toast.success("Advice submitted for review.");
      }
      await loadAdvice();
    } catch (e: any) {
      toast.error(e?.message || "Could not submit advice");
    } finally {
      setSubmitting(false);
    }
  };

  const markReaction = async (postId: string, reaction: ReactionType) => {
    if (!user) {
      toast("Sign in to react to advice.");
      return;
    }
    // Optimistic update — new reaction increments total, switching keeps total unchanged.
    const prevReaction = userReactions[postId];
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (prevReaction === reaction) {
          return p;
        }

        const updated = { ...p } as AdvicePost & Record<string, number>;
        if (!prevReaction) {
          updated[`${reaction}_count`] = ((p[`${reaction}_count` as keyof AdvicePost] as number) || 0) + 1;
          return updated;
        }

        if (prevReaction !== reaction) {
          updated[`${reaction}_count`] = ((p[`${reaction}_count` as keyof AdvicePost] as number) || 0) + 1;
          (updated as any)[`${prevReaction}_count`] = Math.max(0, (p[`${prevReaction}_count` as keyof AdvicePost] as number) - 1);
        }
        return updated;
      })
    );
    setUserReactions((prev) => ({ ...prev, [postId]: reaction }));
    try {
      const { data, error } = await supabase.functions.invoke("advice-admin", {
        body: {
          action: "react_post",
          postId,
          reaction,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast.success("Thanks for your reaction.");
    } catch (e: any) {
      toast.error(e?.message || "Could not save reaction");
      await loadAdvice(true); // revert optimistic update on error
    }
  };

  const sharePost = async (post: AdvicePost) => {
    const url = `https://userealtalk.co.uk/advice/${post.slug || post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const askAIClarification = async (post: AdvicePost) => {
    setClarifyPost(post);
    setClarifyText("");
    setClarifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("advice-clarify", {
        body: { postId: post.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setClarifyText(String(data?.text ?? ""));
    } catch (e: any) {
      toast.error(e?.message || "Could not get RealTalk clarification");
      setClarifyPost(null);
    } finally {
      setClarifyLoading(false);
    }
  };

  const submitReport = async () => {
    if (!reportingPostId) return;
    setReportSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("advice-admin", {
        body: {
          action: "create_report",
          postId: reportingPostId,
          reason: reportReason,
          details: reportDetails.trim() || "Flagged by user from advice library.",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast.success("Thanks, we will review this advice.");
      setReportingPostId(null);
      setReportDetails("");
      setReportReason("Potentially unsafe or misleading");
      await loadAdvice();
    } catch (e: any) {
      toast.error(e?.message || "Could not submit report");
    } finally {
      setReportSubmitting(false);
    }
  };

  const deleteMyPost = async (postId: string) => {
    if (!user) return;
    setDeletingPostId(postId);
    try {
      const client = supabase as any;
      const { data: deletedPost, error } = await client
        .from("advice_posts")
        .delete()
        .eq("id", postId)
        .eq("author_user_id", user.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!deletedPost) {
        throw new Error("Could not delete this post. The database delete policy may not be applied yet.");
      }
      if (editingPostId === postId) {
        cancelEdit();
      }
      setMyPosts((current) => current.filter((post) => post.id !== postId));
      setPosts((current) => current.filter((post) => post.id !== postId));
      toast.success("Advice post deleted.");
      await loadAdvice();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete post");
    } finally {
      setDeletingPostId(null);
    }
  };

  const startEditPost = (post: AdvicePost) => {
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditCategory(post.category as Exclude<(typeof CATEGORIES)[number], "all">);
    setEditTagInput(Array.isArray(post.tags) ? post.tags.join(", ") : "");
  };

  const cancelEdit = () => {
    setEditingPostId(null);
    setEditTitle("");
    setEditBody("");
    setEditTagInput("");
    setEditCategory("general");
  };

  const saveEditAndResubmit = async () => {
    if (!user || !editingPostId) return;
    const cleanTitle = editTitle.trim();
    const cleanBody = editBody.trim();
    if (cleanTitle.length < 8 || cleanTitle.length > 140) {
      toast.error("Title should be 8-140 characters.");
      return;
    }
    if (cleanBody.length < 30 || cleanBody.length > 4000) {
      toast.error("Advice should be 30-4000 characters.");
      return;
    }
    const editedTags = editTagInput
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);

    setEditSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("advice-admin", {
        body: {
          action: "resubmit_post",
          postId: editingPostId,
          title: cleanTitle,
          body: cleanBody,
          category: editCategory,
          tags: editedTags,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast.success("Resubmitted for review.");
      cancelEdit();
      await loadAdvice();
    } catch (e: any) {
      toast.error(e?.message || "Could not resubmit");
    } finally {
      setEditSubmitting(false);
    }
  };

  const isDetailView = /^\/advice\/[^/]+$/.test(pathname);
  if (isDetailView) {
    return <Outlet />;
  }

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-8 space-y-6">
      <section className="rounded-xl border border-border bg-surface/60 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl tracking-tight">Advice Library</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Read practical community advice. Open any post for a shareable page that can be indexed by search engines.
            </p>
          </div>
          {user && (
            <Button
              type="button"
              size="sm"
              className="shrink-0 mt-1 gap-1.5"
              onClick={() => setSubmitOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Share advice
            </Button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={filterCategory === option ? "default" : "outline"}
              onClick={() => setFilterCategory(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <div className="mt-3">
          <Input
            placeholder="Search advice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </section>

      {!user && (
        <section className="rounded-xl border border-border bg-surface/60 p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
          <span>Want to share your own advice or react to posts?</span>
          <Link to="/auth" className="text-primary font-medium hover:underline shrink-0">Sign in</Link>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Published advice</h2>
        {busy ? (
          <div className="text-sm text-muted-foreground">Loading advice...</div>
        ) : posts.length === 0 ? (
          <div className="text-sm text-muted-foreground">No published advice yet in this category.</div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="rounded-xl border border-border bg-surface/60 p-4 space-y-3 overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold break-words [overflow-wrap:anywhere]">{post.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {post.category} | {new Date(post.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-full border border-border/60 text-muted-foreground shrink-0">
                  {post.helpful_count + post.inspiring_count + post.practical_count + post.supportive_count} reactions
                </span>
              </div>

              <p className="text-sm break-words [overflow-wrap:anywhere]">{excerpt(post.body)}</p>

              <div>
                <Link
                  to="/advice/$slug"
                  params={{ slug: post.slug || post.id }}
                  className="text-sm text-primary hover:underline"
                >
                  Read full advice
                </Link>
              </div>

              {Array.isArray(post.tags) && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {post.tags.slice(0, 8).map((tag) => (
                    <span key={tag} className="max-w-full text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary break-words [overflow-wrap:anywhere]">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                {REACTIONS.map(({ key, emoji, label }) => {
                  const isSelected = userReactions[post.id] === key;
                  return (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      className="text-xs px-2 h-7"
                      title={isSelected ? `Change reaction (currently ${label})` : label}
                      onClick={() => void markReaction(post.id, key)}
                    >
                      {emoji}
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs px-2 h-7"
                  onClick={() => void sharePost(post)}
                >
                  🔗 Share
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs px-2 h-7 gap-1"
                  onClick={() => void askAIClarification(post)}
                >
                  ✨ Ask RealTalk
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs px-2 h-7 text-muted-foreground"
                  onClick={() => {
                    if (!user) { toast("Sign in to report advice."); return; }
                    setReportReason("Potentially unsafe or misleading");
                    setReportDetails("");
                    setReportingPostId(post.id);
                  }}
                >
                  Report
                </Button>
              </div>
            </article>
          ))
        )}
      </section>

      {/* Share advice dialog */}
      <Dialog open={submitOpen} onOpenChange={(open) => { if (!open && !submitting) setSubmitOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share your advice</DialogTitle>
            <DialogDescription>
              Keep it practical and safe. Do not include names, addresses, claim IDs, emails, or phone numbers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="advice-title">Title</Label>
              <Input
                id="advice-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
                placeholder="What advice helped you most?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="advice-body">Advice</Label>
              <Textarea
                id="advice-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Share practical advice in your own words..."
                className="min-h-32 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="advice-category">Category</Label>
                <select
                  id="advice-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Exclude<(typeof CATEGORIES)[number], "all">)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {CATEGORIES.filter((c) => c !== "all").map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="advice-tags">Tags</Label>
                <Input
                  id="advice-tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="rent, interview, confidence"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Post anonymously</p>
                <p className="text-xs text-muted-foreground">Hidden from other users; moderation can still review.</p>
              </div>
              <Switch checked={anonymous} onCheckedChange={setAnonymous} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setSubmitOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitAdvice()} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit for review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {user ? (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Your submissions</h2>
            {myPosts.length === 0 ? (
              <div className="text-sm text-muted-foreground">You have not submitted any advice yet.</div>
            ) : (
              myPosts.map((post) => {
                const isNew = newPostIds.has(post.id);
                const statusMeta = {
                  pending: { label: "Under review", classes: "bg-muted/50 text-muted-foreground border-border/60" },
                  approved: { label: "Published", classes: "bg-green-500/10 text-green-600 border-green-500/30" },
                  rejected: { label: "Not approved", classes: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
                  removed: { label: "Removed", classes: "bg-red-500/10 text-red-600 border-red-500/30" },
                }[post.status] ?? { label: post.status, classes: "bg-muted/50 text-muted-foreground border-border/60" };

                return (
                  <article key={post.id} className={`rounded-xl border p-4 space-y-2 overflow-hidden ${
                    isNew ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"
                  }`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium truncate">{post.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isNew && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${statusMeta.classes}`}>
                          {statusMeta.label}
                        </span>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              disabled={deletingPostId === post.id}
                              aria-label={`Delete ${post.title}`}
                              title="Delete advice post"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete advice post?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this advice post from your submissions and remove it from the library if it was published.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={deletingPostId === post.id}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={deletingPostId === post.id}
                                onClick={() => void deleteMyPost(post.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {(post.status === "rejected" || post.status === "removed") && (post as any).moderation_notes && (
                      <p className="text-xs text-muted-foreground bg-surface rounded-md px-3 py-2 border border-border/60">
                        <span className="font-medium">Reviewer note:</span> {(post as any).moderation_notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(post.created_at).toLocaleString("en-GB")}
                    </p>

                    {editingPostId === post.id ? (
                      <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                        <div className="space-y-1">
                          <Label htmlFor={`edit-title-${post.id}`}>Title</Label>
                          <Input
                            id={`edit-title-${post.id}`}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            maxLength={140}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`edit-body-${post.id}`}>Advice</Label>
                          <Textarea
                            id={`edit-body-${post.id}`}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className="min-h-24"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>Category</Label>
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value as Exclude<(typeof CATEGORIES)[number], "all">)}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                            >
                              {CATEGORIES.filter((c) => c !== "all").map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label>Tags</Label>
                            <Input
                              value={editTagInput}
                              onChange={(e) => setEditTagInput(e.target.value)}
                              placeholder="tag1, tag2"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={() => void saveEditAndResubmit()} disabled={editSubmitting}>
                            {editSubmitting ? "Saving..." : "Save & Resubmit"}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={editSubmitting}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 pt-1">
                        {(post.status === "pending" || post.status === "rejected" || post.status === "removed") && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => startEditPost(post)}
                          >
                            Edit &amp; Resubmit
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-border bg-surface/60 p-5 text-sm text-muted-foreground">
          Want to submit your own advice or vote on posts? <Link to="/auth" className="text-primary hover:underline">Sign in</Link>.
        </section>
      )}

      {/* RealTalk clarification dialog */}
      <Dialog open={!!clarifyPost} onOpenChange={(open) => { if (!open) { setClarifyPost(null); setClarifyText(""); } }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>RealTalk clarification</DialogTitle>
            <DialogDescription className="line-clamp-2">{clarifyPost?.title}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 min-h-16">
            {clarifyLoading ? (
              <p className="text-sm text-muted-foreground animate-pulse">Thinking…</p>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{clarifyText}</p>
            )}
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setClarifyPost(null); setClarifyText(""); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report confirmation dialog */}
      <Dialog open={!!reportingPostId} onOpenChange={(open) => { if (!open) { setReportingPostId(null); setReportDetails(""); setReportReason("Potentially unsafe or misleading"); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Report this advice?</DialogTitle>
            <DialogDescription>
              Let us know why you think this advice should be reviewed. We take all reports seriously.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="report-reason">Reason</Label>
              <select
                id="report-reason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-details">Additional details <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="report-details"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Describe the issue..."
                className="min-h-20 resize-none"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setReportingPostId(null); setReportDetails(""); setReportReason("Potentially unsafe or misleading"); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={reportSubmitting}
              onClick={() => void submitReport()}
            >
              {reportSubmitting ? "Submitting…" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
