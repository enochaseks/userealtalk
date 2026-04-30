import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  helpful_count: number;
  inspiring_count: number;
  practical_count: number;
  supportive_count: number;
  created_at: string;
  slug: string;
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

function AdviceDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<AdvicePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
            .select("id, title, body, category, tags, helpful_count, inspiring_count, practical_count, supportive_count, created_at, slug")
            .eq("id", slug)
            .eq("status", "approved")
            .maybeSingle();
          data = (res.data as AdvicePost | null) ?? null;
          error = res.error;
        } else {
          const res = await client
            .from("advice_posts")
            .select("id, title, body, category, tags, helpful_count, inspiring_count, practical_count, supportive_count, created_at, slug")
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
  }, [slug, navigate]);

  const markReaction = async (reaction: ReactionType) => {
    if (!user) { toast("Sign in to react to advice."); return; }
    if (!post) return;
    try {
      const client = supabase as any;
      const { error } = await client.from("advice_feedback").upsert(
        { advice_post_id: post.id, user_id: user.id, reaction, is_helpful: reaction === "helpful" },
        { onConflict: "advice_post_id,user_id" },
      );
      if (error) throw error;
      toast.success("Thanks for your reaction.");
      // Optimistically update local counts
      setPost((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        for (const r of ["helpful", "inspiring", "practical", "supportive"] as ReactionType[]) {
          (updated as any)[`${r}_count`] = (prev as any)[`${r}_count`] as number;
        }
        (updated as any)[`${reaction}_count`] = ((prev as any)[`${reaction}_count`] as number) + 1;
        return updated;
      });
    } catch (e: any) {
      toast.error(e?.message || "Could not save reaction");
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
          const count = (post as any)[`${key}_count`] as number;
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant="outline"
              className="text-xs px-2 h-7 gap-1"
              title={label}
              onClick={() => void markReaction(key)}
            >
              <span>{emoji}</span>
              {count > 0 && <span>{count}</span>}
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
      </div>
    </article>
  );
}
