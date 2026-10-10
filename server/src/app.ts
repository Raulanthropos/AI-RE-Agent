import express from "express";
import type { Collection } from "@ai-re-agent/contracts";
import { searchStatus } from "./discovery/state.js";
import type { ErrorRequestHandler } from "express";
import type { DatabaseSync } from "node:sqlite";
import { readListings, type ListingStatus } from "./repository.js";

import { wildfireService, type WildfireOptions } from "./wildfire/service.js";

export function createApp(db: DatabaseSync, options: { wildfire?: WildfireOptions } = {}) {
  const app = express();
  const assessWildfire = wildfireService(db, options.wildfire);
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
      res.status(400).json({
        error: "status must be eligible, needs-checking, excluded, or all.",
      });
      return;
    }
    const collection = req.query.collection ?? "live";
    if (
      typeof collection !== "string" ||
      !["live", "demo", "all"].includes(collection)
    ) {
      res.status(400).json({ error: "collection must be live, demo, or all." });
      return;
    }
    res.json(
      readListings(db, status as ListingStatus, collection as Collection),
    );
  });
  app.get("/api/listings/:id/wildfire", async (req, res) => {
    const listing = readListings(db, "all", "all").listings.find(p => p.id === req.params.id);
    if (!listing) {
      res.status(404).json({ error: "Listing not available." });
      return;
    }
    res.json(await assessWildfire(listing));
  });
  app.get("/api/search/status", (_req, res) => res.json(searchStatus(db)));
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
