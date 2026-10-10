import { useEffect, useState } from "react";
import type { Listing, WildfireAssessment } from "@ai-re-agent/contracts";
import { Icon } from "./Icon";
import "../wildfire.css";

export function WildfireDetails({ listing }: { listing: Listing }) {
  const [assessment, setAssessment] = useState<WildfireAssessment | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const realListing = Boolean(listing.discovery);

  useEffect(() => {
    if (!realListing) return;
    const controller = new AbortController();
    setAssessment(null);
    setState("loading");
    void fetch(`/api/listings/${encodeURIComponent(listing.id)}/wildfire`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Wildfire assessment unavailable");
        return response.json() as Promise<WildfireAssessment>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setAssessment(data);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("failed");
      });
    return () => controller.abort();
  }, [listing.id, realListing, attempt]);

  const available = assessment?.status === "available";
  const headline = available
    ? assessment.riskClass === "mixed"
      ? "Area context: mixed risk classes"
      : assessment.riskClass
        ? `Area context: predominantly ${assessment.riskClass} risk`
        : "Area risk class unavailable"
    : assessment?.status === "no-location"
      ? "A reliable location is needed"
      : "Area assessment unavailable";

  return (
    <section className="detail-section wildfire-section" aria-label="Wildfire exposure">
      <h4>Wildfire exposure</h4>
      {!realListing ? (
        <p className="small-note">Not assessed for fictional sample listings.</p>
      ) : state === "loading" ? (
        <p className="small-note" role="status">Checking the EFFIS area assessment…</p>
      ) : state === "failed" ? (
        <div className="wildfire-state" role="status">
          <strong>Area assessment unavailable</strong>
          <p>The local server could not return the assessment. Risk remains unknown.</p>
          <button className="text-button" onClick={() => setAttempt((value) => value + 1)}>
            <Icon name="refresh" size={15} /> Try again
          </button>
        </div>
      ) : assessment && (
        <>
          <div className={"wildfire-state " + (available ? assessment.riskClass ?? "" : "unknown")}>
            <strong>{headline}</strong>
            <p>{assessment.message}</p>
            {assessment.location && (
              <p className="wildfire-location">
                <Icon name="pin" size={14} />
                <span>
                  {assessment.location.label}
                  {assessment.location.accuracy === "settlement"
                    ? " · village area, exact property position unknown"
                    : assessment.location.accuracy === "approximate"
                      ? " · approximate listing position"
                      : " · source-reported property position"}
                </span>
              </p>
            )}
          </div>
          {assessment.stale && (
            <p className="wildfire-stale" role="status">
              Showing a saved assessment; the latest refresh was unavailable.
            </p>
          )}
          <p className="small-note">
            {assessment.modelYear} model · {assessment.resolutionKm} km grid.
            This describes the surrounding area, not the individual plot or
            today’s fire danger. It is shown separately from the fit score.
          </p>
          {available && assessment.classShares && (
            <details className="wildfire-method">
              <summary>What the area classification means</summary>
              <p>
                Shares of the modelled area in each risk class. These percentages
                are not the chance that this property will burn.
              </p>
              <dl className="evidence-list">
                {(["high", "intermediate", "low"] as const).map((level) => (
                  <div key={level}>
                    <dt>{level.charAt(0).toUpperCase() + level.slice(1)} risk class</dt>
                    <dd>{assessment.classShares![level]}%</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <div className="wildfire-sources">
            <a href={assessment.sourceUrl} target="_blank" rel="noreferrer">{assessment.provider}: {assessment.dataset}</a>
            <a href={assessment.methodologyUrl} target="_blank" rel="noreferrer">Read the methodology</a>
            <a href={assessment.dailyForecastUrl} target="_blank" rel="noreferrer">Greek Civil Protection: daily fire-danger maps</a>
          </div>
          <p className="small-note wildfire-attribution">
            {assessment.attribution}{" "}
            <a href={assessment.licenseUrl} target="_blank" rel="noreferrer">Data licence</a>
            {assessment.checkedAt && <> · Retrieved {new Date(assessment.checkedAt).toLocaleDateString("en-GB")}</>}
          </p>
        </>
      )}
    </section>
  );
}
