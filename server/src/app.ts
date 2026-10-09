import express from "express";
import type { ErrorRequestHandler } from "express";
import type { DatabaseSync } from "node:sqlite";
import { readListings, type ListingStatus } from "./repository.js";

export function createApp(db: DatabaseSync) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", database: "sqlite" });
  });
  app.get("/api/listings", (req, res) => {
    const status = req.query.status ?? "eligible";
    if (
      typeof status !== "string" ||
      !["eligible", "needs-checking", "excluded", "all"].includes(status)
    ) {
      res
        .status(400)
        .json({
          error: "status must be eligible, needs-checking, excluded, or all.",
        });
      return;
    }
    res.json(readListings(db, status as ListingStatus));
  });
  app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
  });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error(error);
    res
      .status(500)
      .json({ error: "Unable to read listings. Check the server log." });
  };
  app.use(handleError);
  return app;
}
