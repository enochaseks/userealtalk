import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type ReactionType = "helpful" | "inspiring" | "practical" | "supportive";

const REACTIONS: { key: ReactionType; emoji: string; label: string }[] = [
  { key: "helpful", emoji: "👍", label: "Helpful" },
  { key: "inspiring", emoji: "💡", label: "Inspiring" },
  { key: "practical", emoji: "🛠️", label: "Practical" },
  { key: "supportive", emoji: "❤️", label: "Supportive" },
];

type AdvicePost = {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  author_user_id: string;
  helpful_count: number;
  inspiring_count: number;
  practical_count: number;
  supportive_count: number;
  created_at: string;
  slug: string;
};

type AdviceComment = {
  id: string;
  advice_post_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  parent_comment_id: string | null;
};

export const Route = createFileRoute("/advice/$slug")({
  component: AdviceDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: "Advice - RealTalk" },
      {
        name: "description",
        content: "Read practical, search-friendly advice from the RealTalk community.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "article" },
      { property: "og:title", content: "Advice - RealTalk" },
      { property: "og:url", content: `https://userealtalk.co.uk/advice/${params.slug}` },
    ],
    links: [{ rel: "canonical", href: `https://userealtalk.co.uk/advice/${params.slug}` }],
  }),
});

const COMMENT_REPORT_REASONS = [
  "Inappropriate or offensive",
  "Harassment or bullying",
  "Spam or self-promotion",
  "Contains personal information",
  "Other",
] as const;

function AdviceDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<AdvicePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [userReaction, setUserReaction] = useState<ReactionType | null>(null);
  const [comments, setComments] = useState<AdviceComment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [commentReportReason, setCommentReportReason] = useState("Inappropriate or offensive");
  const [commentReportDetails, setCommentReportDetails] = useState("");
  const [commentReportSubmitting, setCommentReportSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [userCommentReactions, setUserCommentReactions] = useState<Set<string>>(new Set());
  const [commentReactionCounts, setCommentReactionCounts] = useState<Record<string, number>>({});
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyText, setClarifyText] = useState("");
  const [clarifyLoading, setClarifyLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadPost = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const client = supabase as any;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);

        let data: AdvicePost | null = null;
        let error: any = null;

        if (isUuid) {
          const res = await client
            .from("advice_posts")
            .select("id, title, body, category, tags, author_user_id, helpful_count, inspiring_count, practical_count, supportive_count, created_at, slug")
            .eq("id", slug)
            .eq("status", "approved")
            .maybeSingle();
          data = (res.data as AdvicePost | null) ?? null;
          error = res.error;
        } else {
          const res = await client
            .from("advice_posts")
            .select("id, title, body, category, tags, author_user_id, helpful_count, inspiring_count, practical_count, supportive_count, created_at, slug")
            .eq("slug", slug)
            .eq("status", "approved")
            .maybeSingle();
          data = (res.data as AdvicePost | null) ?? null;
          error = res.error;
        }

        if (error) throw error;
        if (!data) {
          if (!cancelled) setNotFound(true);
          return;
        }

        if (isUuid && data.slug && data.slug !== slug) {
          void navigate({ to: "/advice/$slug", params: { slug: data.slug }, replace: true });
        }

        if (!cancelled) {
          setPost(data as AdvicePost);

          const { data: commentsData } = await client
            .from("advice_comments")
            .select("id, advice_post_id, author_user_id, body, created_at, parent_comment_id")
            .eq("advice_post_id", data.id)
            .order("created_at", { ascending: true })
            .limit(50);
          const loadedComments = (commentsData ?? []) as AdviceComment[];
          setComments(loadedComments);
          setHasMoreComments(loadedComments.length >= 50);
          if (loadedComments.length > 0) {
            const cIds = loadedComments.map((c) => c.id);
            const [cReactAll, cReactMine] = await Promise.all([
              client.from("advice_comment_reactions").select("comment_id").in("comment_id", cIds),
              user
                ? client.from("advice_comment_reactions").select("comment_id").eq("user_id", user.id).in("comment_id", cIds)
                : Promise.resolve({ data: [] }),
            ]);
            const counts: Record<string, number> = {};
            for (const r of (cReactAll.data ?? [])) {
              const id = String(r.comment_id);
              counts[id] = (counts[id] ?? 0) + 1;
            }
            setCommentReactionCounts(counts);
            setUserCommentReactions(new Set((cReactMine.data ?? []).map((r: any) => String(r.comment_id))));
          } else {
            setCommentReactionCounts({});
            setUserCommentReactions(new Set());
          }

          if (user) {
            const { data: feedbackData } = await client
              .from("advice_feedback")
              .select("reaction")
              .eq("advice_post_id", data.id)
              .eq("user_id", user.id)
              .maybeSingle();
            setUserReaction((feedbackData?.reaction as ReactionType | undefined) ?? null);
          } else {
            setUserReaction(null);
          }
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [slug, navigate, user?.id]);

  const markReaction = async (reaction: ReactionType) => {
    if (!user) { toast("Sign in to react to advice."); return; }
    if (!post) return;

    const prevReaction = userReaction;
    setPost((prev) => {
      if (!prev) return prev;
      const updated = { ...prev } as AdvicePost & Record<string, number>;

      if (prevReaction === reaction) {
        updated[`${reaction}_count`] = Math.max(0, ((prev[`${reaction}_count` as keyof AdvicePost] as number) || 0) - 1);
        return updated;
      }

      updated[`${reaction}_count`] = ((prev[`${reaction}_count` as keyof AdvicePost] as number) || 0) + 1;
      if (prevReaction) {
        updated[`${prevReaction}_count`] = Math.max(0, ((prev[`${prevReaction}_count` as keyof AdvicePost] as number) || 0) - 1);
      }
      return updated;
    });
    setUserReaction(prevReaction === reaction ? null : reaction);

    try {
      const { data, error } = await supabase.functions.invoke("advice-admin", {
        body: {
          action: "react_post",
          postId: post.id,
          reaction,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast.success("Thanks for your reaction.");
    } catch (e: any) {
      toast.error(e?.message || "Could not save reaction");
      const client = supabase as any;
      const { data: refreshed } = await client
        .from("advice_posts")
        .select("id, title, body, category, tags, helpful_count, inspiring_count, practical_count, supportive_count, created_at, slug")
        .eq("id", post.id)
        .maybeSingle();
      if (refreshed) setPost(refreshed as AdvicePost);
      setUserReaction(prevReaction ?? null);
    }
  };

  const askRealTalkClarification = async () => {
    if (!post) return;
    setClarifyOpen(true);
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
      setClarifyOpen(false);
    } finally {
      setClarifyLoading(false);
    }
  };

  const submitComment = async () => {
    if (!user || !post || commentSubmitting) {
      if (!user) toast("Sign in to comment.");
      return;
    }

    const body = commentInput.trim();
    if (body.length < 1 || body.length > 800) {
      toast.error("Comment should be 1-800 characters.");
      return;
    }

    setCommentSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("advice-admin", {
        body: { action: "add_comment", postId: post.id, body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      setComments((prev) => [...prev, data.comment as AdviceComment]);
      setCommentInput("");
      toast.success("Comment posted.");
    } catch (e: any) {
      toast.error(e?.message || "Could not post comment");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!user || !post) return;
    setDeletingCommentId(commentId);
    try {
      const client = supabase as any;
      const { error } = await client
        .from("advice_comments")
        .delete()
        .eq("id", commentId)
        .eq("advice_post_id", post.id);
      if (error) throw error;

      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId));
      toast.success("Comment deleted.");
    } catch (e: any) {
      toast.error(e?.message || "Could not delete comment");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const loadMoreComments = async () => {
    if (!post || loadingMoreComments) return;
    setLoadingMoreComments(true);
    try {
      const client = supabase as any;
      const offset = comments.length;
      const { data: moreData, error } = await client
        .from("advice_comments")
        .select("id, advice_post_id, author_user_id, body, created_at, parent_comment_id")
        .eq("advice_post_id", post.id)
        .order("created_at", { ascending: true })
        .range(offset, offset + 49);
      if (error) throw error;
      const newComments = (moreData ?? []) as AdviceComment[];
      setComments((prev) => [...prev, ...newComments]);
      setHasMoreComments(newComments.length >= 50);
      if (newComments.length > 0) {
        const cIds = newComments.map((c) => c.id);
        const [cReactAll, cReactMine] = await Promise.all([
          client.from("advice_comment_reactions").select("comment_id").in("comment_id", cIds),
          user
            ? client.from("advice_comment_reactions").select("comment_id").eq("user_id", user.id).in("comment_id", cIds)
            : Promise.resolve({ data: [] }),
        ]);
        const counts: Record<string, number> = {};
        for (const r of (cReactAll.data ?? [])) {
          const id = String(r.comment_id);
          counts[id] = (counts[id] ?? 0) + 1;
        }
        setCommentReactionCounts((prev) => ({ ...prev, ...counts }));
        setUserCommentReactions((prev) => {
          const next = new Set(prev);
          for (const r of (cReactMine.data ?? [])) next.add(String(r.comment_id));
          return next;
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not load more comments");
    } finally {
      setLoadingMoreComments(false);
    }
  };

  const submitCommentReport = async () => {
    if (!reportingCommentId) return;
    setCommentReportSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("advice-admin", {
        body: {
          action: "report_comment",
          commentId: reportingCommentId,
          reason: commentReportReason,
          details: commentReportDetails.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast.success("Thanks, we will review this comment.");
      setReportingCommentId(null);
      setCommentReportDetails("");
      setCommentReportReason("Inappropriate or offensive");
    } catch (e: any) {
      toast.error(e?.message || "Could not submit report");
    } finally {
      setCommentReportSubmitting(false);
    }
  };

  const reactComment = async (commentId: string) => {
    if (!user) { toast("Sign in to react."); return; }
    const hasReacted = userCommentReactions.has(commentId);
    setUserCommentReactions((prev) => {
      const next = new Set(prev);
      if (hasReacted) next.delete(commentId); else next.add(commentId);
      return next;
    });
    setCommentReactionCounts((prev) => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] ?? 0) + (hasReacted ? -1 : 1)),
    }));
    try {
      const { data, error } = await supabase.functions.invoke("advice-admin", {
        body: { action: "react_comment", commentId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
    } catch (e: any) {
      toast.error(e?.message || "Could not save reaction");
      setUserCommentReactions((prev) => {
        const next = new Set(prev);
        if (hasReacted) next.add(commentId); else next.delete(commentId);
        return next;
      });
      setCommentReactionCounts((prev) => ({
        ...prev,
        [commentId]: Math.max(0, (prev[commentId] ?? 0) + (hasReacted ? 1 : -1)),
      }));
    }
  };

  const submitReply = async (parentCommentId: string) => {
    if (!user || !post || replySubmitting) {
      if (!user) toast("Sign in to reply.");
      return;
    }
    const replyBody = replyInput.trim();
    if (replyBody.length < 1 || replyBody.length > 800) {
      toast.error("Reply should be 1-800 characters.");
      return;
    }
    setReplySubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("advice-admin", {
        body: { action: "add_comment", postId: post.id, body: replyBody, parentCommentId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setComments((prev) => [...prev, data.comment as AdviceComment]);
      setReplyInput("");
      setReplyingToId(null);
      toast.success("Reply posted.");
    } catch (e: any) {
      toast.error(e?.message || "Could not post reply");
    } finally {
      setReplySubmitting(false);
    }
  };

  const sharePost = async () => {
    if (!post) return;
    const url = `https://userealtalk.co.uk/advice/${post.slug || post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const structuredData = useMemo(() => {
    if (!post) return "";
    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      datePublished: post.created_at,
      dateModified: post.created_at,
      author: {
        "@type": "Organization",
        name: "RealTalk Community",
      },
      publisher: {
        "@type": "Organization",
        name: "RealTalk",
      },
      mainEntityOfPage: `https://userealtalk.co.uk/advice/${post.slug}`,
      articleSection: post.category,
      keywords: Array.isArray(post.tags) ? post.tags.join(", ") : "",
      description: post.body.slice(0, 200),
    });
  }, [post]);

  // Build comment thread tree
  const topLevelComments = comments.filter((c) => !c.parent_comment_id);
  const repliesByParent: Record<string, AdviceComment[]> = {};
  for (const c of comments) {
    if (c.parent_comment_id) {
      const pid = c.parent_comment_id;
      if (!repliesByParent[pid]) repliesByParent[pid] = [];
      repliesByParent[pid].push(c);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-10 text-sm text-muted-foreground">
        Loading advice...
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-10 space-y-4">
        <h1 className="font-serif text-3xl tracking-tight">Advice not found</h1>
        <p className="text-sm text-muted-foreground">This advice post may have been removed or is not publicly available.</p>
        <Link to="/advice" className="text-sm text-primary hover:underline">
          Back to Advice Library
        </Link>
      </div>
    );
  }

  return (
    <article className="flex-1 max-w-3xl w-full mx-auto px-5 py-10 space-y-5">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      <Link to="/advice" className="text-sm text-primary hover:underline">
        Back to Advice Library
      </Link>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">{post.title}</h1>
        <p className="text-xs text-muted-foreground">
          {post.category} • {new Date(post.created_at).toLocaleDateString("en-GB")} •{" "}
          {post.helpful_count + post.inspiring_count + post.practical_count + post.supportive_count} reactions
        </p>
      </header>

      <div className="rounded-xl border border-border bg-surface/60 p-5">
        <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{post.body}</p>
      </div>

      {Array.isArray(post.tags) && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.tags.slice(0, 10).map((tag) => (
            <span key={tag} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {REACTIONS.map(({ key, emoji, label }) => {
          const isSelected = userReaction === key;
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={isSelected ? "default" : "outline"}
              className="text-xs px-2 h-7"
              title={isSelected ? `Change reaction (currently ${label})` : label}
              onClick={() => void markReaction(key)}
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
          onClick={() => void sharePost()}
        >
          🔗 Share
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-xs px-2 h-7 gap-1"
          onClick={() => void askRealTalkClarification()}
        >
          ✨ Ask RealTalk
        </Button>
      </div>

      <section className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Comments ({topLevelComments.length}{comments.length > topLevelComments.length ? ` + ${comments.length - topLevelComments.length} replies` : ""})
          </h2>
          {!user && (
            <Link to="/auth" className="text-xs text-primary hover:underline">
              Sign in to comment
            </Link>
          )}
        </div>

        {user && (
          <div className="space-y-2">
            <Textarea
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Add a comment or ask a question..."
              className="min-h-20 resize-none"
              maxLength={800}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{commentInput.trim().length}/800</span>
              <Button type="button" size="sm" onClick={() => void submitComment()} disabled={commentSubmitting || !commentInput.trim()}>
                {commentSubmitting ? "Posting..." : "Post comment"}
              </Button>
            </div>
          </div>
        )}

        {topLevelComments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment or ask a question.</p>
        ) : (
          <div className="space-y-3">
            {topLevelComments.map((comment) => {
              const canDeleteTop = !!user && (user.id === comment.author_user_id || user.id === post.author_user_id);
              const topReactionCount = commentReactionCounts[comment.id] ?? 0;
              const topHasReacted = userCommentReactions.has(comment.id);
              const replies = repliesByParent[comment.id] ?? [];
              return (
                <div key={comment.id} className="space-y-2">
                  <article className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {user?.id === comment.author_user_id ? "You" : "Community member"} • {new Date(comment.created_at).toLocaleString("en-GB")}
                      </p>
                      <div className="flex items-center gap-1">
                        {user && user.id !== comment.author_user_id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-muted-foreground"
                            onClick={() => { setCommentReportReason("Inappropriate or offensive"); setCommentReportDetails(""); setReportingCommentId(comment.id); }}
                          >
                            Report
                          </Button>
                        )}
                        {canDeleteTop && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-muted-foreground"
                            disabled={deletingCommentId === comment.id}
                            onClick={() => void deleteComment(comment.id)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{comment.body}</p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={topHasReacted ? "default" : "ghost"}
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => void reactComment(comment.id)}
                      >
                        👍{topReactionCount > 0 ? ` ${topReactionCount}` : ""}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          if (!user) { toast("Sign in to reply."); return; }
                          setReplyingToId(replyingToId === comment.id ? null : comment.id);
                          setReplyInput("");
                        }}
                      >
                        {replyingToId === comment.id ? "Cancel" : `Reply${replies.length > 0 ? ` (${replies.length})` : ""}`}
                      </Button>
                    </div>
                  </article>

                  {replies.length > 0 && (
                    <div className="ml-5 pl-3 border-l-2 border-border/40 space-y-2">
                      {replies.map((reply) => {
                        const canDeleteReply = !!user && (user.id === reply.author_user_id || user.id === post.author_user_id);
                        const replyReactionCount = commentReactionCounts[reply.id] ?? 0;
                        const replyHasReacted = userCommentReactions.has(reply.id);
                        return (
                          <article key={reply.id} className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground">
                                {user?.id === reply.author_user_id ? "You" : "Community member"} • {new Date(reply.created_at).toLocaleString("en-GB")}
                              </p>
                              <div className="flex items-center gap-1">
                                {user && user.id !== reply.author_user_id && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs text-muted-foreground"
                                    onClick={() => { setCommentReportReason("Inappropriate or offensive"); setCommentReportDetails(""); setReportingCommentId(reply.id); }}
                                  >
                                    Report
                                  </Button>
                                )}
                                {canDeleteReply && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs text-muted-foreground"
                                    disabled={deletingCommentId === reply.id}
                                    onClick={() => void deleteComment(reply.id)}
                                  >
                                    Delete
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{reply.body}</p>
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <Button
                                type="button"
                                size="sm"
                                variant={replyHasReacted ? "default" : "ghost"}
                                className="h-6 px-2 text-xs gap-1"
                                onClick={() => void reactComment(reply.id)}
                              >
                                👍{replyReactionCount > 0 ? ` ${replyReactionCount}` : ""}
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {replyingToId === comment.id && (
                    <div className="ml-5 space-y-2">
                      <Textarea
                        value={replyInput}
                        onChange={(e) => setReplyInput(e.target.value)}
                        placeholder="Write a reply..."
                        className="min-h-16 resize-none"
                        maxLength={800}
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void submitReply(comment.id)}
                          disabled={replySubmitting || !replyInput.trim()}
                        >
                          {replySubmitting ? "Posting..." : "Post reply"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => { setReplyingToId(null); setReplyInput(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hasMoreComments && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground mt-1"
            onClick={() => void loadMoreComments()}
            disabled={loadingMoreComments}
          >
            {loadingMoreComments ? "Loading..." : "Load more comments"}
          </Button>
        )}
      </section>

      {/* Comment report dialog */}
      <Dialog open={!!reportingCommentId} onOpenChange={(open) => { if (!open) { setReportingCommentId(null); setCommentReportDetails(""); setCommentReportReason("Inappropriate or offensive"); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Report this comment?</DialogTitle>
            <DialogDescription>
              Let us know why you think this comment should be reviewed. We take all reports seriously.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="comment-report-reason">Reason</Label>
              <select
                id="comment-report-reason"
                value={commentReportReason}
                onChange={(e) => setCommentReportReason(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {COMMENT_REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comment-report-details">Additional details <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="comment-report-details"
                value={commentReportDetails}
                onChange={(e) => setCommentReportDetails(e.target.value)}
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
              onClick={() => { setReportingCommentId(null); setCommentReportDetails(""); setCommentReportReason("Inappropriate or offensive"); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={commentReportSubmitting}
              onClick={() => void submitCommentReport()}
            >
              {commentReportSubmitting ? "Submitting…" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clarifyOpen} onOpenChange={setClarifyOpen}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>RealTalk clarification</DialogTitle>
            <DialogDescription className="line-clamp-2">{post.title}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 min-h-16">
            {clarifyLoading ? (
              <p className="text-sm text-muted-foreground animate-pulse">Thinking...</p>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{clarifyText}</p>
            )}
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setClarifyOpen(false); setClarifyText(""); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
