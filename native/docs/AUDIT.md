# Original launcher audit

Reference: `TSK999/rubix-launcher`, branch `main`, commit `039ae8d0bb40f06195039fc8cc558f3e88c761b6`.
Audit date: 2026-11-11. This is a source audit, not a claim that the old application's online services were exercised.

## Version and scope

The README badge identifies v1.6.0. `package.json` identifies v1.8.5. The rewrite uses the current commit, rather than assuming the README describes an exact v1.6 release. `source-inventory.json` inventories all 312 source, configuration and documentation files (53,871 lines), excluding lockfiles, binary assets, `.env`, and Git internals. Focused inspection covered Electron IPC, provider discovery and launching, library models, all eight mod strategies, dependency registry/resolver, Minecraft modules, social/API boundaries, clips, controller input, settings, and migration sources.

The existing Electron/React application and backend remain at their original paths. New executable application code is isolated in `native/`. No old database or account token is read automatically.

## Findings and migration map

| Subsystem | Existing evidence | Rewrite decision |
| --- | --- | --- |
| Desktop | `electron/main.cjs`, `electron/preload.cjs`, `src/types/electron.d.ts`: Electron IPC and browser renderer | Replace with iced update/view/subscription and typed Rust service calls. |
| Branding | `src/index.css`: charcoal surfaces, purple primary (280°, 90%, 60%), rounded cards; `Sidebar.tsx`; `public/favicon.ico` | Keep the palette, persistent sidebar and original application icon. No promotional storefront. |
| Local library | `src/lib/game-types.ts`, `src/pages/Index.tsx`: localStorage key `rubix-launcher-games`; `src/pages/Library.tsx` is also a separate cloud purchase library | SQLite games and installations; no automatic account requirement. Purchase entitlements are not inferred from local files. |
| Providers | `electron/main.cjs`: Epic `.item`, EA registry/manifests, Riot metadata, Xbox package enumeration; Steam library helpers and cloud Steam import | Implement read-only Steam and Epic adapters first. EA, Xbox and Riot remain explicitly unavailable pending native adapter tests. |
| Launch/playtime | Electron opens a path or URI; `src/lib/passport.ts` contains local-session/cloud playtime logic; README still lists playtime tracking on its roadmap | Track actual direct child processes with monotonic elapsed time and persistent checkpoints. Storefront URI dispatch is not proof that a game is running. |
| Mod installation | `src/lib/mods/strategies/` contains eight strategies; Electron downloads ZIPs and writes game files | Do not reuse first-install automatic loader bootstrapping or non-transactional file replacement. Native installation requires staging, path validation, backups and rollback tests first. |
| Dependencies | `dependencies/registry.ts` describes system and loader layers; `getLayerDeps` returns the loader layer. `resolver.ts` uses topological traversal and a small custom semver comparison | Preserve the intended layers but implement strict semver and blocking unknown references before claiming parity. The existing caret/wildcard approximation is not a complete semver implementation. |
| Mod.io | Strategy sends `subscribe`/`unsubscribe` to `mods-api`; the current edge-function dispatcher handles `mod` versus browsing, not those mutations | Existing success responses cannot establish that subscription happened. Leave native synchronization unavailable until authenticated mutation and game sync are verified. |
| Mod sources | `mod-adapters.ts`, `mod-games.ts`, `supabase/functions/mods-api/index.ts`: SpaceDock, Thunderstore, mod.io, CurseForge and Minecraft-specific resolution | Preserve source contracts as reference; do not ship provider keys or assume a public browsing endpoint grants download rights. |
| Minecraft | `electron/minecraft.cjs`, `electron/mc/{msal,mojang,java,launch,loader,http,paths}.cjs`: substantial instance, Microsoft/Xbox/Minecraft token, version, loader and JVM code | Must be ported as a real subsystem. Keep it disabled until registered OAuth client configuration and legitimate entitlement/download/launch flows are tested. |
| Minecraft secrets | `mc/msal.cjs` falls back to a `PLAIN:` account file when Electron encryption is unavailable. `mc/launch.cjs` writes expanded Java arguments, including access-token substitutions, to a log | Never import that token cache or copy the logging behavior. Future native auth must fail closed on unavailable secure credential storage and redact credentials. |
| Account/social | Supabase migrations, `rubix-accounts` and `rubix-messaging` edge functions, profile/friends/message/presence modules | Existing HTTPS APIs offer a migration path. Keep service-role access server-side, review participant authorization/RLS, then add a credential-store-backed native client. This alpha makes no account requests. |
| Voice | `call-controller.ts`, `calls.ts`, `webrtc.ts`: browser media/WebRTC with signaling | Browser audio/RTC cannot be retained in a native-only UI. Rust audio, encryption, NAT traversal and reconnect behavior need end-to-end tests. |
| Clips | Electron `desktopCapturer`, FFmpeg manager, segmented replay buffer, encoders, renderer clips/sharing | Substantial prior implementation, not a portable Rust capture backend. Native Windows capture/encoding and permission handling are still required. |
| Controller | `useControllerMode.tsx`: browser Gamepad API, polling and DOM focus navigation | Replace with native input; controller support is not claimed in this alpha. |
| Extra old features | Spotify control, theme loading, community channels/LFG/events, developer/admin pages and cloud store | Record as separate backlog items. Do not turn old cloud-store promotions into the new Discover page. |

## Persistent state boundaries

| Source | Data | Migration policy |
| --- | --- | --- |
| Browser localStorage | `rubix-launcher-games`, Steam linkage, controller mode, keybinds, clip preferences and local session data | Require an explicit structured export. Do not open Chromium LevelDB while Electron owns it. |
| Electron userData | `rubix-mods/config.json`, `installed-<gameKey>.json`, update notes, clip state | Preview and validate paths; native transaction manifests are a different format. No automatic import. |
| Home `.rubix/minecraft` | Instances, registry, version/library/assets caches, loader installers and `account.bin` | Copy selected instances only after preview. Never migrate the account token file; require sign-in again. |
| Supabase | Profiles, purchases, friends, conversations, messages, modpacks, playtime, stamps, artwork and clip storage | Use authenticated APIs with the existing user's authorization. Do not scrape or copy database administration credentials. |

Migration execution, rollback and import reports are not implemented in this alpha. Keeping old files untouched is the current migration guarantee.

## Phase gates

1. Build a working, tested native foundation.
2. Establish real local discovery/launch/session behavior and Windows packaging.
3. Add transactional mod installation and profile management before enabling mod writes.
4. Register/configure auth and test Minecraft ownership/version/loader flows.
5. Connect the existing account/social backend with authorization and privacy tests.
6. Verify Windows capture and encrypted voice with actual devices and peers.
7. Complete controllers, accessibility, tray/startup, updates and measured Windows performance.

No integration is considered preserved merely because a navigation entry or a domain type exists.
