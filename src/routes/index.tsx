import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { Chat } from "@/components/chat/Chat";
import { Landing } from "@/components/Landing";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // During SSR, render the public landing page so crawlers/review bots can
  // always access homepage legal links without client auth initialization.
  if (typeof window === "undefined") {
    return <Landing />;
  }

  useEffect(() => {
    // no-op: Landing has its own CTA
  }, [user, loading, navigate]);

  if (loading) return null;
  if (!user) return <Landing />;
  return <Chat />;
}
