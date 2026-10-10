import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchStatus } from "@ai-re-agent/contracts";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

export function SearchActivity({ onUpdated }: { onUpdated: () => void }) {
  const [status, setStatus] = useState<SearchStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const previous = useRef<string | undefined>(undefined);
  const updateRef = useRef(onUpdated);
  updateRef.current = onUpdated;
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/search/status", { signal });
      if (!response.ok) throw new Error("Status unavailable");
      const result = (await response.json()) as SearchStatus;
      if (signal.aborted) return;
      setStatus(result);
      setUnavailable(false);
      const stamp = result.latestRun?.finishedAt ?? "";
      if (previous.current !== undefined && stamp && stamp !== previous.current)
        updateRef.current();
      previous.current = stamp;
    } catch {
      if (!signal.aborted) setUnavailable(true);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => {
      void load(controller.signal);
    }, 15000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [load]);
  const run = status?.latestRun;
  const label = unavailable
    ? "Search status unavailable"
    : run?.status === "running"
      ? "Searching the web…"
      : !run
        ? "Daily search · waiting for the first run"
        : run.status === "failed"
          ? "Last search could not complete"
          : run.status === "interrupted"
            ? "Last search was interrupted"
            : run.status === "partial"
              ? "Search updated · some sources unavailable"
              : "Search updated " +
                new Date(run.finishedAt!).toLocaleDateString("en-GB");
  return (
    <>
      <button className="search-activity" onClick={() => setOpen(true)}>
        <Icon name="clock" size={14} />
        <span>{label}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <Modal title="Internet search" onClose={() => setOpen(false)}>
          <div className="panel-content search-panel">
            <p>
              Searches run every 24 hours while the local app is running and
              your computer is awake. Public search results can be incomplete or
              out of date.
            </p>
            <dl className="evidence-list">
              <div>
                <dt>Worker</dt>
                <dd>
                  {status?.workerRunning
                    ? "Running locally"
                    : "Not running continuously"}
                </dd>
              </div>
              <div>
                <dt>Last search</dt>
                <dd>
                  {run
                    ? new Date(run.startedAt).toLocaleString("en-GB")
                    : "Not run yet"}
                </dd>
              </div>
              <div>
                <dt>Next search due</dt>
                <dd>
                  {status?.nextRunAt
                    ? new Date(status.nextRunAt).toLocaleString("en-GB")
                    : "When the worker starts"}
                </dd>
              </div>
              {run && (
                <div>
                  <dt>Latest result</dt>
                  <dd>
                    {run.found} links found · {run.imported} listings processed
                    · {run.pagesRead} source pages read
                  </dd>
                </div>
              )}
            </dl>
            <p className="small-note">
              The app uses public DuckDuckGo search, with no account, key or
              paid service. Search snippets remain unconfirmed leads. A blocked
              page does not mean a property was sold.
            </p>
            <h3>Sources searched</h3>
            <p>
              {status?.sources.map((s) => s.name).join(" · ") ||
                "Plot.gr · Indomio · Spitogatos · XE · Spiti24"}
            </p>
            {!!run?.issues.length && (
              <details open>
                <summary>What could not be checked</summary>
                <ul>
                  {run.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="small-note">
              Missing map locations, road access, utilities and permits are
              never inferred. Fit uses reported facts; the assessed percentage
              shows how much of your priorities can currently be evaluated.
            </p>
            <p className="small-note">
              Start the local app with <code>npm run dev</code>. For an
              immediate search use <code>npm run search:once</code> in the
              project folder.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
