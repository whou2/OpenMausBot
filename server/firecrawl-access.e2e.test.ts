import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";

const ADMIN_ID = "firecrawl-fixture-keeper";
const ADMIN_THREAD_ID = "firecrawl-fixture-keeper-thread";
const FAKE_MCP = fileURLToPath(new URL("./testing/fake-mcp-server.ts", import.meta.url));

it("lets only the configured Chief grant and revoke Firecrawl while new bots default off", async () => {
  const fixture = await launchVerificationServer(
    { ...process.env, FAKE_CLAUDE_MODE: "hang", OMB_MCP_NEW_BOT_DENY: "firecrawl", OMB_MCP_GRANT_ADMIN_BOT_ID: ADMIN_ID },
    undefined, undefined, undefined, undefined, undefined, [], undefined,
    (dataDir) => {
      const configFile = join(dataDir, "config.json");
      const config = JSON.parse(readFileSync(configFile, "utf8"));
      const fakeServer = { command: process.execPath, args: ["--experimental-strip-types", FAKE_MCP], enabled: true };
      config.mcpServers = { firecrawl: fakeServer, context7: fakeServer };
      writeFileSync(configFile, JSON.stringify(config));
      writeFileSync(join(dataDir, "bots.json"), JSON.stringify([{
        id: ADMIN_ID, threadId: ADMIN_THREAD_ID, name: "Keeper", title: "Chief of Staff",
        description: "Fixture admin", soul: "", section: "Bots", chiefOfStaff: true,
        notifications: true, color: "blue", unread: false, mcpServers: ["context7"],
        modelSelection: { instanceId: "claude", model: "fixture" }, resumeCursors: {}, createdAt: Date.now(),
      }]));
    },
  );
  const api = async (method: string, path: string, body?: unknown, token?: string) => {
    const response = await fetch(fixture.info.url + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : { origin: fixture.info.url }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };
  const control = (args: string[]) => runControlOmb([...args, "--url", fixture.info.url]);
  try {
    const created = await api("POST", "/api/bots", { name: "Future specialist", section: "Research" });
    expect(created.status).toBe(201);
    const target = created.body.bot;
    expect((await api("GET", "/api/bots?messages=0")).body.bots.find((bot: any) => bot.id === target.id).mcpServers).toEqual(["context7"]);
    await control(["send", "--bot", ADMIN_ID, "--text", "Hold this fixture turn."]);
    await expect.poll(() => existsSync(fixture.fixtureDumpPath), { timeout: 15_000 }).toBe(true);
    const dump = JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8"));
    const token = dump.mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN as string;
    expect(dump.mcpConfig.mcpServers.agents.env.OMB_MCP_GRANT_ADMIN_BOT_ID).toBe(ADMIN_ID);
    const roster = await api("GET", "/api/internal/mcp-access", undefined, token);
    expect(roster.status).toBe(200);
    expect(roster.body.bots.find((bot: any) => bot.id === target.id).enabled).toBe(false);
    expect((await api("POST", "/api/internal/mcp-access", { targetBotId: target.id, action: "grant" }, token)).status).toBe(200);
    expect((await api("GET", "/api/bots?messages=0")).body.bots.find((bot: any) => bot.id === target.id).mcpServers).toEqual(["context7", "firecrawl"]);
    expect((await api("POST", "/api/internal/mcp-access", { targetBotId: target.id, action: "revoke" }, token)).status).toBe(200);
    expect((await api("GET", "/api/bots?messages=0")).body.bots.find((bot: any) => bot.id === target.id).mcpServers).toEqual(["context7"]);
    expect((await api("POST", "/api/internal/mcp-access", { targetBotId: ADMIN_ID, action: "grant" }, token)).status).toBe(409);
    expect((await api("POST", "/api/internal/mcp-access", { targetBotId: target.id, action: "grant" })).status).toBe(401);
    rmSync(fixture.fixtureDumpPath, { force: true });
    await control(["send", "--bot", target.id, "--text", "Hold the second fixture turn."]);
    await expect.poll(() => existsSync(fixture.fixtureDumpPath), { timeout: 15_000 }).toBe(true);
    const nonChiefToken = JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8")).mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN as string;
    expect((await api("GET", "/api/internal/mcp-access", undefined, nonChiefToken)).status).toBe(403);
  } finally {
    await fixture.close();
    expect(existsSync(fixture.info.dataDir)).toBe(false);
  }
}, 60_000);
