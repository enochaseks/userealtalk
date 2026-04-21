import { createFileRoute } from "@tanstack/react-router";

import { PasswordRecoveryPage } from "./reset-password";

export const Route = createFileRoute("/recover")({
  component: PasswordRecoveryPage,
  head: () => ({ meta: [{ title: "Recover your password - RealTalk" }] }),
});