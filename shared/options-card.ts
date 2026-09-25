/** The existing Watcher card owner. */
export const WATCHER_OPTIONS_CARD_BOT_ID = "f08dd8e3-f942-4eb4-8783-df32b26b88a4";
/** WorkinIT may also create passive cards for its ClickUp action flow. */
export const WORKINIT_OPTIONS_CARD_BOT_ID = "18a9c1a0-8d70-49aa-9ee6-eb411ebd7a4c";

/** Keep the card capability limited to these exact two bots at every gate. */
export function canCreateOptionsCard(botId: string): boolean {
  return botId === WATCHER_OPTIONS_CARD_BOT_ID || botId === WORKINIT_OPTIONS_CARD_BOT_ID;
}

/** Keep agent-authored cards small enough to remain useful on desktop and mobile. */
export const OPTIONS_CARD_LIMITS = {
  title: 120,
  subtitle: 1_000,
  option: 120,
  description: 300,
  minOptions: 2,
  maxOptions: 6,
} as const;

/** The value is the existing answer/selection ID; label is presentation only. */
export interface OptionDetail {
  value: string;
  label: string;
  description: string;
}

export interface OptionsCardInput {
  title: string;
  subtitle: string;
  options: string[];
  optionDetails: OptionDetail[];
}

/** Shared by persistence and the viewer, including cards saved before details existed. */
export function describeOption(label: string, title: string): string {
  const subject = title.trim() || "this request";
  switch (label.trim().toLowerCase()) {
    case "aggressive": return `Take the broadest fast safe path for ${subject}, then verify the result.`;
    case "recommended": return `Review the facts for ${subject}, take the best balanced next step, and verify its result.`;
    case "safe": return `Take the smallest reversible, verified step for ${subject}.`;
    case "do nothing": return `Take no action on ${subject}.`;
    case "other": return `Enter a custom instruction for ${subject}.`;
    case "allow once": return `Allow the requested action for ${subject} one time.`;
    case "always allow": return `Allow the requested action for ${subject} and remember this choice for its stated scope.`;
    case "deny": case "cancel": return `Decline the requested action for ${subject}.`;
    case "confirm": return `Confirm the proposed action for ${subject}.`;
    default: return `Send “${label}” as your choice for ${subject}; the bot will handle that selected path.`;
  }
}

export function optionDetailsForCard(card: {
  title: string;
  subtitle?: string;
  options: readonly string[];
  optionDetails?: readonly OptionDetail[];
  optionHints?: Record<string, string>;
}): OptionDetail[] {
  return card.options.map((value) => {
    const supplied = card.optionDetails?.find((detail) => detail.value === value);
    const label = supplied?.label?.trim() || value;
    const description = supplied?.description?.trim() || card.optionHints?.[value]?.trim()
      || describeOption(label, card.title);
    return { value, label, description };
  });
}

export type ParsedOptionsCardInput =
  | { ok: true; value: OptionsCardInput }
  | { ok: false; error: string };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, field: string, maximum: number): string | { error: string } {
  if (typeof value !== "string") return { error: `${field} must be a string.` };
  const text = value.trim();
  if (!text) return { error: `${field} must not be blank.` };
  if (text.length > maximum) return { error: `${field} must be at most ${maximum} characters.` };
  return text;
}

/** Normalize untrusted model input before it is persisted into a native card. */
export function parseOptionsCardInput(value: unknown): ParsedOptionsCardInput {
  if (!record(value)) return { ok: false, error: "create_options_card needs an object." };

  const title = boundedText(value.title, "title", OPTIONS_CARD_LIMITS.title);
  if (typeof title !== "string") return { ok: false, error: title.error };
  const subtitle = boundedText(value.subtitle, "subtitle", OPTIONS_CARD_LIMITS.subtitle);
  if (typeof subtitle !== "string") return { ok: false, error: subtitle.error };
  if (!Array.isArray(value.options)) return { ok: false, error: "options must be an array of strings." };
  if (value.options.length < OPTIONS_CARD_LIMITS.minOptions || value.options.length > OPTIONS_CARD_LIMITS.maxOptions) {
    return { ok: false, error: `options must contain ${OPTIONS_CARD_LIMITS.minOptions}-${OPTIONS_CARD_LIMITS.maxOptions} items.` };
  }

  const options: string[] = [];
  const optionDetails: OptionDetail[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.options.length; index += 1) {
    const raw = value.options[index];
    const rich = record(raw);
    const label = boundedText(rich ? raw.label : raw, `options[${index}]${rich ? ".label" : ""}`, OPTIONS_CARD_LIMITS.option);
    if (typeof label !== "string") return { ok: false, error: label.error };
    const selected = rich && raw.value !== undefined
      ? boundedText(raw.value, `options[${index}].value`, OPTIONS_CARD_LIMITS.option) : label;
    if (typeof selected !== "string") return { ok: false, error: selected.error };
    const description = rich
      ? boundedText(raw.description, `options[${index}].description`, OPTIONS_CARD_LIMITS.description)
      : describeOption(label, title);
    if (typeof description !== "string") return { ok: false, error: description.error };
    if (seen.has(selected)) return { ok: false, error: `options must be unique; "${selected}" is repeated.` };
    seen.add(selected);
    options.push(selected);
    optionDetails.push({ value: selected, label, description });
  }
  // The proxy sends its already-normalized payload to the server. Validate
  // the companion details again there without changing answer values.
  if (value.optionDetails !== undefined) {
    if (!Array.isArray(value.optionDetails) || value.optionDetails.length !== options.length) {
      return { ok: false, error: "optionDetails must match options." };
    }
    for (let index = 0; index < options.length; index += 1) {
      const detail = value.optionDetails[index];
      if (!record(detail) || detail.value !== options[index]) {
        return { ok: false, error: "optionDetails must match options." };
      }
      const label = boundedText(detail.label, `optionDetails[${index}].label`, OPTIONS_CARD_LIMITS.option);
      const description = boundedText(detail.description, `optionDetails[${index}].description`, OPTIONS_CARD_LIMITS.description);
      if (typeof label !== "string") return { ok: false, error: label.error };
      if (typeof description !== "string") return { ok: false, error: description.error };
      optionDetails[index] = { value: options[index]!, label, description };
    }
  }
  return { ok: true, value: { title, subtitle, options, optionDetails } };
}
