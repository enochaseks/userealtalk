import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AdvicePost = {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  helpful_count: number;
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
        const { data, error } = await client
          .from("advice_posts")
          .select("id, title, body, category, tags, helpful_count, created_at, slug")
          .eq("slug", slug)
          .eq("status", "approved")
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          if (!cancelled) setNotFound(true);
          return;
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
  }, [slug]);

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
          {post.category} • {new Date(post.created_at).toLocaleDateString("en-GB")} • {post.helpful_count} helpful
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
    </article>
  );
}
