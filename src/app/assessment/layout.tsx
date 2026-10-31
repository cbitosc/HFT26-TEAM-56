/**
 * Focused chrome for taking an assessment: no sidebar, and the workspace
 * draws its own top bar (stage, question, timers). The proxy redirects
 * signed-out visitors; pages re-verify the session and ownership on the server.
 */
export default function AssessmentLayout({ children }: LayoutProps<"/assessment">) {
  return <div className="flex min-h-full flex-1 flex-col bg-background">{children}</div>;
}
