import { ContentType } from "./types";

interface TopicInput {
  titleTemplate: string;
  promptSeed: string;
}

const BASE_STYLE = [
  "Professional Pinterest infographic pin, 1024x1536 pixels, 2:3 aspect ratio.",
  "Bold modern sans-serif typography (clean geometric headings, readable body text).",
  "Warm neutral color palette — soft beige, cream, warm gray, muted terracotta — with high contrast text.",
  "Clean minimalist layout with generous white space.",
  "No stock photos — use flat illustration style with subtle shadows.",
  "Soft call-to-action bar at the very bottom of the pin reading: 'Download Roomy AI — Available on the App Store' in small elegant text.",
].join(" ");

const CONTENT_TEMPLATES: Record<ContentType, (topic: TopicInput) => string> = {
  before_after: (topic) =>
    [
      BASE_STYLE,
      "",
      `LAYOUT: Split the pin vertically into two halves — LEFT labeled "BEFORE" and RIGHT labeled "AFTER".`,
      `Title overlay centered at the top in a bold banner: "${topic.titleTemplate}".`,
      `The BEFORE side shows a cluttered, disorganized, or outdated version of the space/concept.`,
      `The AFTER side shows a clean, styled, elevated transformation.`,
      `Use a thin vertical divider or subtle gradient transition between the two halves.`,
      `Each side has 2-3 small caption labels pointing out key differences.`,
      "",
      `Topic context: ${topic.promptSeed}`,
      "",
      "Style: editorial, aspirational, magazine-quality interior/lifestyle design.",
      "Text must be fully legible and not overlap with illustration details.",
    ].join("\n"),

  listicle: (topic) =>
    [
      BASE_STYLE,
      "",
      `LAYOUT: Numbered list infographic with a colored banner title at the top: "${topic.titleTemplate}".`,
      `List 5-7 tips, each as a numbered row with a small icon on the left and a short tip on the right.`,
      `Use alternating row backgrounds (white and very light warm gray) for readability.`,
      `Numbers are displayed in large bold colored circles.`,
      `Each tip is one concise sentence — no paragraphs.`,
      "",
      `Topic context: ${topic.promptSeed}`,
      "",
      "Style: clean editorial infographic, easy to scan, save-worthy.",
      "All text must be sharp, readable, and properly contained within its row.",
    ].join("\n"),

  visual_guide: (topic) =>
    [
      BASE_STYLE,
      "",
      `LAYOUT: Step-by-step visual guide with the title at the top: "${topic.titleTemplate}".`,
      `Divide the pin into 3-5 clearly numbered sections/steps flowing top to bottom.`,
      `Each section has a step number, a short heading, and a small flat illustration or icon.`,
      `Use subtle arrows or flow lines connecting the steps to show progression.`,
      `Optionally include a small comparison grid or before/after mini-panel within one step.`,
      "",
      `Topic context: ${topic.promptSeed}`,
      "",
      "Style: instructional, clear visual hierarchy, tutorial-like.",
      "All text must be legible and not obscured by illustrations.",
    ].join("\n"),
};

/**
 * Build a complete image-generation prompt for a Pinterest infographic pin.
 */
export function buildPinPrompt(
  contentType: ContentType,
  topic: TopicInput
): string {
  const builder = CONTENT_TEMPLATES[contentType];
  if (!builder) {
    throw new Error(`Unknown content type: ${contentType}`);
  }
  return builder(topic);
}
