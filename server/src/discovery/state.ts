import type { DatabaseSync } from "node:sqlite";
import type { SearchRun, SearchStatus } from "@ai-re-agent/contracts";
import { websites } from "./sites/registry.js";

export const intervalHours = 24;
export const intervalMs = intervalHours * 60 * 60 * 1000;
export const leaseMs = 20 * 60 * 1000;
export function heartbeat(db: DatabaseSync, now = new Date()) {
  db.prepare("UPDATE discovery_state SET heartbeat_at = ? WHERE id = 1").run(
    now.toISOString(),
  );
}
export function searchStatus(db: DatabaseSync, now = new Date()): SearchStatus {
  const state = db.prepare("SELECT * FROM discovery_state WHERE id = 1").get()!;
  const row = db
    .prepare("SELECT payload FROM discovery_runs ORDER BY id DESC LIMIT 1")
    .get();
  const latestRun: SearchRun | null = row
    ? JSON.parse(row.payload as string)
    : null;
  if (
    latestRun?.status === "running" &&
    (!state.lease_until || String(state.lease_until) <= now.toISOString())
  ) {
    latestRun.status = "interrupted";
    latestRun.issues = [
      ...latestRun.issues,
      "The previous worker stopped before completing this search.",
    ];
  }
  return {
    intervalHours,
    nextRunAt: state.next_run_at as string | null,
    workerRunning:
      !!state.heartbeat_at &&
      now.getTime() - Date.parse(String(state.heartbeat_at)) < 120000,
    latestRun,
    sources: websites.map(({ name, domain }) => ({ name, domain })),
  };
}
export function claimRun(
  db: DatabaseSync,
  force = false,
  now = new Date(),
): SearchRun | null {
  const stamp = now.toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const state = db
      .prepare("SELECT * FROM discovery_state WHERE id = 1")
      .get()!;
    if (
      (state.lease_until && String(state.lease_until) > stamp) ||
      (!force && state.next_run_at && String(state.next_run_at) > stamp)
    ) {
      db.exec("COMMIT");
      return null;
    }
    const run: SearchRun = {
      id: 0,
      startedAt: stamp,
      finishedAt: null,
      status: "running",
      queries: 0,
      found: 0,
      imported: 0,
      pagesRead: 0,
      issues: [],
    };
    run.id = Number(
      db
        .prepare("INSERT INTO discovery_runs (payload) VALUES (?)")
        .run(JSON.stringify(run)).lastInsertRowid,
    );
    db.prepare("UPDATE discovery_runs SET payload = ? WHERE id = ?").run(
      JSON.stringify(run),
      run.id,
    );
    db.prepare(
      "UPDATE discovery_state SET lease_until = ?, next_run_at = ? WHERE id = 1",
    ).run(
      new Date(now.getTime() + leaseMs).toISOString(),
      new Date(now.getTime() + intervalMs).toISOString(),
    );
    db.exec("COMMIT");
    return run;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function saveRun(db: DatabaseSync, run: SearchRun) {
  if (run.status === "running")
    db.prepare("UPDATE discovery_state SET lease_until = ? WHERE id = 1").run(
      new Date(Date.now() + leaseMs).toISOString(),
    );
  db.prepare("UPDATE discovery_runs SET payload = ? WHERE id = ?").run(
    JSON.stringify(run),
    run.id,
  );
}
export function finishRun(db: DatabaseSync, run: SearchRun) {
  db.exec("BEGIN IMMEDIATE");
  try {
    saveRun(db, run);
    db.prepare(
      "UPDATE discovery_state SET lease_until = NULL, next_run_at = ? WHERE id = 1",
    ).run(new Date(Date.parse(run.finishedAt!) + intervalMs).toISOString());
    db.exec(
      "DELETE FROM discovery_runs WHERE id NOT IN (SELECT id FROM discovery_runs ORDER BY id DESC LIMIT 60)",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
