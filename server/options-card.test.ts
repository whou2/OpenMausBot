import { describe, expect, it, vi } from "vitest";

import { WATCHER_OPTIONS_CARD_BOT_ID, WORKINIT_OPTIONS_CARD_BOT_ID } from "../shared/options-card.ts";
import { createOptionsCard, type OptionsCardStore } from "./options-card.ts";

function watcher() {
  return { id: WATCHER_OPTIONS_CARD_BOT_ID, name: "Watcher", color: "blue" as const };
}

describe("createOptionsCard", () => {
  it("persists a passive legacy options card in the current thread", () => {
    let appendedCard: Record<string, unknown> | undefined;
    const appendMessage: OptionsCardStore["appendMessage"] = vi.fn((_threadId, message) => {
      appendedCard = message.card;
      return { id: "message-1" };
    });
    const result = createOptionsCard({
      store: { appendMessage } satisfies OptionsCardStore,
      bot: watcher(),
      threadId: "thread-watcher",
      input: { title: "Possible match", subtitle: "Choose the next step", options: ["Ignore", "Draft"] },
    });

    expect(result).toEqual({ ok: true, messageId: "message-1" });
    expect(appendMessage).toHaveBeenCalledWith("thread-watcher", {
      role: "bot",
      kind: "options",
      from: { botId: WATCHER_OPTIONS_CARD_BOT_ID, name: "Watcher", color: "blue" },
      card: expect.objectContaining({ title: "Possible match", subtitle: "Choose the next step", options: ["Ignore", "Draft"] }),
    });
    expect((appendedCard?.optionDetails as Array<{ description: string }>).every((detail) => detail.description.length > 0)).toBe(true);
    expect(appendedCard).not.toHaveProperty("requestId");
    expect(appendedCard).not.toHaveProperty("tool");
  });

  it("persists WorkinIT's exact five choices in its own thread", () => {
    const appendMessage = vi.fn(() => ({ id: "workinit-card" }));
    const result = createOptionsCard({
      store: { appendMessage } satisfies OptionsCardStore,
      bot: { id: WORKINIT_OPTIONS_CARD_BOT_ID, name: "WorkinIT", color: "blue" },
      threadId: "thread-workinit",
      input: { title: "DJ Products task", subtitle: "Choose a next step", options: ["Aggressive", "Recommended", "Safe", "Do nothing", "Other"] },
    });
    expect(result).toEqual({ ok: true, messageId: "workinit-card" });
    expect(appendMessage).toHaveBeenCalledWith("thread-workinit", expect.objectContaining({
      card: expect.objectContaining({ title: "DJ Products task", subtitle: "Choose a next step", options: ["Aggressive", "Recommended", "Safe", "Do nothing", "Other"] }),
    }));
  });

  it("refuses every bot outside the two-ID allowlist without writing", () => {
    const appendMessage = vi.fn(() => ({ id: "should-not-exist" }));
    expect(createOptionsCard({
      store: { appendMessage } satisfies OptionsCardStore,
      bot: { ...watcher(), id: "another-bot" },
      threadId: "thread",
      input: { title: "Title", subtitle: "Subtitle", options: ["A", "B"] },
    })).toEqual({ ok: false, status: 403, error: "create_options_card is not enabled for this bot." });
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("refuses malformed cards without writing", () => {
    const appendMessage = vi.fn(() => ({ id: "should-not-exist" }));
    expect(createOptionsCard({
      store: { appendMessage } satisfies OptionsCardStore,
      bot: watcher(),
      threadId: "thread",
      input: { title: "Title", subtitle: "Subtitle", options: ["Only one"] },
    })).toEqual({ ok: false, status: 400, error: "options must contain 2-6 items." });
    expect(appendMessage).not.toHaveBeenCalled();
  });
});
