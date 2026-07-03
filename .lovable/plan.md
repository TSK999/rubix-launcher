
# Full Minecraft Launch Pipeline

Replace the "spawn the official Launcher" shim with a real headless launcher: sign the user in with Microsoft, download the game from Mojang, run the loader installer, and spawn `java` ourselves.

## What we're building

```text
Sign in (MSAL device code)
  → Xbox Live → XSTS → Minecraft services token → profile (uuid + name)
Download game (Mojang piston-meta)
  → version manifest → version JSON → client.jar + libraries + asset index + assets
Java runtime
  → detect system java; if missing, download Adoptium Temurin JRE for the MC version
Loader install (headless)
  → java -jar <installer>.jar --installClient  (Fabric / Quilt / NeoForge / Forge)
  → merge loader's version JSON into ours (extra libs + main class + args)
Launch
  → build classpath, expand argument templates, spawn java with auth + game dir
```

## New files

**`electron/mc/msal.cjs`** — Microsoft device-code login
- Client ID `00000000402b5328` (Xbox community client used by every third-party launcher)
- `POST devicecode` → return user_code + verification_uri, open in browser
- Poll `POST token` until success → MS access token + refresh token
- Xbox Live auth (`user.auth.xboxlive.com/user/authenticate`)
- XSTS (`xsts.auth.xboxlive.com/xsts/authorize`) — handle 401 with XErr codes (child account, no Xbox account) with friendly errors
- Minecraft services (`api.minecraftservices.com/authentication/login_with_xbox`)
- Profile (`api.minecraftservices.com/minecraft/profile`) → `{ uuid, name, accessToken }`
- Persist encrypted token blob at `<userData>/rubix/mc/account.json` (Electron `safeStorage`), auto-refresh on expiry

**`electron/mc/mojang.cjs`** — Mojang asset pipeline
- `version_manifest_v2.json` → resolve version id → fetch version JSON
- Download `client.jar` → `<root>/versions/<id>/<id>.jar` (sha1 verify)
- Walk `libraries[]`, honour `rules` (os/arch), skip natives we don't need (modern MC bundles LWJGL natives via classifiers — download + extract to `<root>/versions/<id>/natives/`)
- Fetch asset index → `<root>/assets/indexes/<idx>.json`
- Download every object into `<root>/assets/objects/<xx>/<hash>` — parallel with a small pool (8 workers), skip existing by sha1
- Progress reporter → IPC event `mc:progress` `{ phase, done, total, current }`

**`electron/mc/java.cjs`** — Java runtime
- If `detectJava()` returns a version compatible with the MC version (17+ for 1.18+, 8 for ≤1.16), use it
- Else fetch Adoptium API: `https://api.adoptium.net/v3/assets/latest/<major>/hotspot?os=<os>&architecture=<arch>&image_type=jre`
- Download `.tar.gz` / `.zip` to `<root>/runtime/jre-<major>/`, extract, return path to `bin/java(.exe)`
- Cache by major version

**`electron/mc/loader.cjs`** — Headless loader install
- Fabric / Quilt: `java -jar installer.jar client -dir <root> -mcversion <mc> -loader <lv> -noprofile`
- NeoForge / Forge: `java -jar installer.jar --installClient <root>` (writes a `<mc>-forge-<lv>` version JSON that inherits from vanilla)
- Read the resulting loader version JSON, merge `libraries` + `mainClass` + `arguments` into the vanilla version JSON in memory → cache as `<id>-rubix.json`
- Report progress; surface installer stderr on failure

**`electron/mc/launch.cjs`** — Actually launch
- Build classpath: all lib jars + client.jar (or loader-merged jars)
- Expand Mojang argument templates: `${auth_player_name} ${version_name} ${game_directory} ${assets_root} ${assets_index_name} ${auth_uuid} ${auth_access_token} ${user_type} ${version_type} ${natives_directory} ${launcher_name} ${launcher_version} ${classpath}`
- JVM args: `-Xmx<ramMb>M -Djava.library.path=<natives> -cp <cp>` + version JSON jvm args
- Spawn detached `java`, pipe stdout/stderr to `<instance>/logs/latest.log`
- Non-zero exit → emit crash event with tail of log

**`electron/mc/paths.cjs`** — Shared path helpers so all mc/*.cjs modules agree on ROOT, versions dir, assets dir, libraries dir, runtime dir.

## Files to edit

**`electron/minecraft.cjs`**
- Remove `findMinecraftLauncher()` + `mc:launch` external-spawn body
- New `mc:launch` calls `mojang.ensureVersion() → loader.ensureLoader() → java.ensureRuntime() → launch.spawn()`
- New IPC handlers: `mc:signIn`, `mc:signOut`, `mc:whoami`, `mc:refreshAccount`
- Wire `mc:progress` events (BrowserWindow.webContents.send)

**`electron/preload.cjs`**
- Expose `rubix.minecraft.signIn/signOut/whoami/onProgress`

**`src/lib/minecraft/bridge.ts`**
- Add `signIn / signOut / whoami / onProgress` wrappers

**`src/components/minecraft/InstanceDetail.tsx`** (or new `AccountBadge.tsx`)
- Header shows signed-in MS account + "Sign in with Microsoft" button
- Launch button disabled until signed in
- Progress bar bound to `onProgress`, with phase label ("Downloading assets 812/1400")

**`src/types/electron.d.ts`** — new bridge methods

## Technical notes

- **No secrets to add.** The Xbox community client ID is public; no Azure registration, no `add_secret`. Mojang + Adoptium APIs are unauthenticated.
- **Piracy check:** if `POST /authentication/login_with_xbox` returns 200 but `/minecraft/profile` returns 404, the account doesn't own Minecraft. Return a clean error, not a crash.
- **Concurrency:** asset download uses a bounded pool (8) — Mojang's CDN handles this fine, and we already do it for CF mods.
- **Retries:** every HTTP call gets 3 retries with exponential backoff. Existing `downloadTo()` gets a sha1-verify variant.
- **Cache is shared across instances.** `versions/`, `libraries/`, `assets/`, `runtime/` live under `<userData>/rubix/mc/`, not per-instance. Only the world/mods/config are per-instance (already the case).
- **Legacy assets** (pre-1.6, virtual assets): out of scope — we launch 1.13+ only. Guard in `createInstance`.
- **Token storage:** Electron `safeStorage.encryptString` (OS keychain-backed). Falls back to plaintext with a warning on unsupported Linux setups.

## Out of scope for this pass

- Skin rendering / cape support (needs GL, not worth it in-launcher)
- Server-list import
- Microsoft account switching UI beyond sign-in / sign-out
- Legacy Mojang-account login (Yggdrasil) — Microsoft-migration deadline has long passed

## Rollout

One PR. `pnpm/npm run build && npm run electron:package` still works — no new native deps. Bump to **1.7.0** — this is a genuinely new capability.
