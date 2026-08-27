// Pylon's Account-level "Sentiment" custom field — a 5-point scale observed
// in the actual data (advocate/positive/neutral/frustrated/high_risk_detractor).
// Kept as a plain string on Brand.PYLON_SENTIMENT (see lib/metabase.ts) rather than
// this narrower type, since Pylon's option set could change independent of
// this codebase — this module is just the display layer over whatever comes back.

export type Sentiment = "advocate" | "positive" | "neutral" | "frustrated" | "high_risk_detractor";

export const SENTIMENT_STYLES: Record<Sentiment, { label: string; color: string }> = {
  advocate:             { label: "Advocate",             color: "#4caf82" },
  positive:             { label: "Positive",             color: "#72a4bf" },
  neutral:              { label: "Neutral",              color: "#5a6b78" },
  frustrated:           { label: "Frustrated",           color: "#e9a84c" },
  high_risk_detractor:  { label: "High Risk / Detractor", color: "#e05c5c" },
};

// Best-to-worst — matches SENTIMENT_STYLES' own key order, used for chip display order.
export const SENTIMENT_ORDER: Sentiment[] = ["advocate", "positive", "neutral", "frustrated", "high_risk_detractor"];

export function isKnownSentiment(sentiment: string | null): sentiment is Sentiment {
  return sentiment !== null && sentiment in SENTIMENT_STYLES;
}
