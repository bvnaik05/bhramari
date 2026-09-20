import { Suspense } from "react";
import { WorkspaceClient } from "@/components/workspace-client";

export default function WorkspacePage() {
  return <Suspense fallback={<main className="workspace-loading">Opening Bhramari…</main>}><WorkspaceClient /></Suspense>;
}
