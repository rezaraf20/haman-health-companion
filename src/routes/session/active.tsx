import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { api, type CoughEvent } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/session/active")({
  head: () => ({
    meta: [
      { title: "Session active — Haman Health" },
      { name: "description", content: "Your night session is running. Only cough counts are recorded — never audio." },
      { property: "og:title", content: "Session active — Haman Health" },
      { property: "og:description", content: "Your night session is running. Only cough counts are recorded — never audio." },
    ],
  }),
  component: ActiveSessionPage,
});

function useElapsed(startedAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!startedAt) return "00:00:00";
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

function ActiveSessionPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session, isFetched, isFetching } = useQuery({ queryKey: ["session", "current"], queryFn: api.sessions.current });
  const [localCount, setLocalCount] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const queue = useRef<CoughEvent[]>([]);
  const elapsed = useElapsed(session?.startedAt);

  useEffect(() => {
    if (isFetched && !isFetching && !session) navigate({ to: "/session" });
  }, [isFetched, isFetching, session, navigate]);

  // Flush queued cough events (timestamp, count, session_id) periodically. No audio is ever captured here.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      if (queue.current.length) {
        const batch = queue.current.splice(0);
        void api.sessions.pushEvents(batch);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [session]);

  function logCough() {
    if (!session) return;
    const ts = new Date().toISOString();
    queue.current.push({ session_id: session.id, timestamp: ts, count: 1 });
    setLocalCount((c) => c + 1);
    setRecent((r) => [ts, ...r].slice(0, 5));
  }

  async function end() {
    if (!session) return;
    if (queue.current.length) await api.sessions.pushEvents(queue.current.splice(0));
    await api.sessions.end(session.id);
    await qc.invalidateQueries({ queryKey: ["session"] });
    toast.success("Session saved. Your morning summary is ready.");
    navigate({ to: "/" });
  }

  return (
    <AppShell night hideChrome>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-12 pb-10 text-foreground">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            {t("session_active")}
          </span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">{elapsed}</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative mb-10 grid size-56 place-items-center">
            <div className="absolute inset-0 animate-breathe rounded-full orb opacity-80" />
            <div className="relative">
              <p className="text-6xl font-semibold tracking-tight">{(session?.coughCount ?? 0) + localCount}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("cough_events")}</p>
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sleep well</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Listening on-device for coughs. Keep the phone nearby; the screen can stay off.
          </p>

          {recent.length > 0 && (
            <div className="mt-8 w-full space-y-1.5 text-left">
              {recent.map((ts) => (
                <div key={ts} className="flex items-center justify-between rounded-2xl bg-card px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Cough event</span>
                  <span className="tabular-nums">{new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-[var(--radius)] bg-card p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
            <p>Only the time and count of each cough is stored. Audio never leaves your device.</p>
          </div>
          <button
            onClick={logCough}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border text-sm font-medium hover:bg-card"
          >
            <Mic className="size-4" /> Simulate a detected cough
          </button>
          <button onClick={end} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {t("end_session")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
