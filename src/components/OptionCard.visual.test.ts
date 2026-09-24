import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { Message } from "@/state/store";

const fixture = vi.hoisted(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  return { dispatch: vi.fn() };
});

vi.mock("@/state/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/state/store")>()),
  useStore: () => ({ state: { bots: [] }, dispatch: fixture.dispatch }),
}));

const { OptionCard } = await import("./OptionCard");

afterAll(() => vi.unstubAllGlobals());

function message(subtitle: string): Message {
  return {
    id: "m-1",
    role: "bot",
    kind: "options",
    at: 1,
    card: {
      title: "Work on ROI with current information",
      subtitle,
      options: ["Aggressive", "Recommended", "Safe", "Do nothing", "Other"],
    },
  } as Message;
}

const render = (subtitle: string) =>
  renderToStaticMarkup(createElement(OptionCard, { botId: "workinit", message: message(subtitle) }));

describe("OptionCard task presentation", () => {
  it("uses the accessible accent color for the card heading", () => {
    expect(render("Choose a path")).toContain("font-semibold text-accent-text");
  });

  it("turns HTTP links in subtitles into safe, visible anchors", () => {
    const markup = render("https://app.clickup.com/t/86aggb37n · I can calculate ROI.");
    expect(markup).toContain('href="https://app.clickup.com/t/86aggb37n"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("text-accent-text underline");
    expect(markup).toContain("· I can calculate ROI.");
  });

  it("keeps sentence punctuation outside the clickable URL", () => {
    const markup = render("Open https://example.com/task, then review it.");
    expect(markup).toContain('href="https://example.com/task"');
    expect(markup).not.toContain('href="https://example.com/task,"');
  });
});
