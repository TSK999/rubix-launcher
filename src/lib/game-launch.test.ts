import { describe, expect, it, vi } from "vitest";
import { getGameLaunchTarget, getSteamProtocolFallbackUrl, isExternalProtocol, openExternalProtocol, steamLaunchTarget } from "./game-launch";

describe("game launch helpers", () => {
  it("uses Steam's browser-safe run protocol for Steam games", () => {
    expect(steamLaunchTarget(1172470)).toBe("steam://run/1172470");
    expect(getGameLaunchTarget({ id: "1", title: "Apex Legends", addedAt: 1, path: "steam://rungameid/1172470", steamAppId: 1172470 })).toBe(
      "steam://run/1172470",
    );
  });

  it("opens custom protocols with an anchor click instead of a popup", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const remove = vi.spyOn(HTMLAnchorElement.prototype, "remove").mockImplementation(() => undefined);

    expect(isExternalProtocol("steam://run/1172470")).toBe(true);
    expect(openExternalProtocol("steam://run/1172470")).toMatchObject({
      ok: true,
      method: "direct-anchor",
      url: "steam://run/1172470",
    });
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();

    click.mockRestore();
    remove.mockRestore();
  });

  it("provides a Steam HTTPS handoff for sandboxed previews", () => {
    expect(getSteamProtocolFallbackUrl("steam://run/1172470")).toBe(
      "https://steamcommunity.com/linkfilter/?url=steam%3A%2F%2Frun%2F1172470",
    );
  });
});