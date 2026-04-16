import { Outlet, createRootRoute, HeadContent, Scripts, Link, useRouterState } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RealTalk — Think clearly. Decide better." },
      { name: "description", content: "RealTalk is a calm AI companion that helps you reduce overthinking, find clarity, and turn your thoughts into clear plans." },
      { name: "author", content: "RealTalk" },
      { property: "og:title", content: "RealTalk — Think clearly. Decide better." },
      { property: "og:description", content: "A calm AI companion for clarity and better decisions." },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <AppFrame />
      <Toaster />
    </AuthProvider>
  );
}

function AppFrame() {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const showNav = user && path !== "/auth";

  return (
    <div className="min-h-screen flex flex-col">
      {showNav && <TopNav />}
      <main className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            …
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function TopNav() {
  return (
    <header className="border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30">
      <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link to="/" className="font-serif text-xl tracking-tight">RealTalk</Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavItem to="/">Chat</NavItem>
          <NavItem to="/profile">Profile</NavItem>
        </nav>
      </div>
    </header>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
      activeProps={{ className: "px-3 py-1.5 rounded-md text-foreground bg-surface" }}
      activeOptions={{ exact: true }}
    >
      {children}
    </Link>
  );
}

function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="font-serif text-6xl">404</h1>
        <p className="mt-3 text-muted-foreground">This page drifted off.</p>
        <Link to="/" className="inline-block mt-6 text-primary hover:underline">Back to RealTalk</Link>
      </div>
    </div>
  );
}
