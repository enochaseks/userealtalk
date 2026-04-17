import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import logo from "../assets/logo.png";

export function Landing() {
  return (
    <div className="flex-1 realtalk-ambient flex items-center justify-center px-5 py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="max-w-xl text-center"
      >
        <img src={logo} alt="RealTalk" className="h-45 w-auto mx-auto mb-6" />
        <div className="font-serif text-5xl md:text-6xl tracking-tight leading-[1.05]">
          Think clearly.
          <br />
          <span className="italic text-primary">Decide better.</span>
        </div>
        <p className="mt-6 text-muted-foreground text-base md:text-lg leading-relaxed">
          RealTalk is a calm AI companion that helps you cut through overthinking,
          find clarity, and turn what's on your mind into clear plans.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/auth">
            <Button size="lg" className="rounded-full px-7">Start thinking</Button>
          </Link>
        </div>
        <p className="mt-12 text-xs text-muted-foreground/70">
          One quiet space. No noise. No notifications.
        </p>
      </motion.div>
    </div>
  );
}
