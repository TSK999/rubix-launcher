<p align="center">
  <img src="Topbanner.png" width="100%" alt="RUBIX Launcher" />
</p>

<h1 align="center">RUBIX Launcher</h1>

<p align="center">
  <strong>Your games — exactly where you need them.</strong><br/>
  One launcher that unifies Steam, Epic, EA, Xbox / PC Game Pass and Riot, with a built-in mod manager, social layer and clips feed.
</p>

<p align="center">
  <a href="#"><img alt="Version" src="https://img.shields.io/badge/version-1.6.0-3B82F6?style=flat-square" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" /></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-desktop-47848F?style=flat-square&logo=electron&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
</p>

---

## Preview

<table align="center" cellspacing="10">
  <tr>
    <td><img src="preview1.png" width="100%" alt="Library" /></td>
    <td><img src="preview2.png" width="100%" alt="Game detail" /></td>
  </tr>
  <tr>
    <td><img src="preview3.png" width="100%" alt="Mod manager" /></td>
    <td><img src="preview4.png" width="100%" alt="Social" /></td>
  </tr>
</table>

---

## What it does

RUBIX is a desktop launcher that pulls your scattered game library into a single place and adds the things every other launcher leaves out — mods, friends, voice, clips, and a profile that follows you across stores.

### Library
- Steam, Epic Games, EA app, Xbox / PC Game Pass, Riot
- Auto-detected installs, unified banners, descriptions and play actions
- Controller-friendly UI

### Mod Manager
- Unified Setup Wizard with auto-detect across every supported launcher
- **8 install strategies**: KSP folder injection, BepInEx, MelonLoader, SMAPI, tModLoader, WoW AddOns, Mod.io native sync, and a profile-isolated Minecraft mini-launcher
- Loaders bootstrap themselves on first install
- 5-layer dependency resolver (topological sort, semver, circular-dep detection)
- Modpacks with share codes, public/private toggle and one-click redeem
- Browse, search and install from SpaceDock, Thunderstore, Mod.io and CurseForge

### Social
- RUBIX accounts and profiles
- Built-in messaging
- Built-in Steam friend list with instant game launch
- Clips feed
- Spotify integration

---

## Tech stack

| Layer        | Stack                                              |
| ------------ | -------------------------------------------------- |
| Desktop      | Electron                                           |
| Frontend     | React 18, Vite 5, TypeScript 5, Tailwind, shadcn   |
| Backend      | Lovable Cloud (Postgres + Auth + Edge Functions)   |
| State / data | TanStack Query, Zod                                |

---

## Getting started

```bash
bun install
bun run dev          # web preview
bun run electron:dev # desktop app
```

Build a release:

```bash
bun run build
bun run electron:build
```

---

## Roadmap

- Multi-language support
- Built-in theme store
- Public website
- Playtime tracker
- Game Overlay + Rich Presence
- Cloud Modpack Hub
- Cloud Saves & Profile Sync

See [`CHANGELOG.md`](CHANGELOG.md) for release history.

---

## Contributing

Suggestions, bug reports and PRs are all welcome — open an issue and let's talk.

## License

[GPL-3.0-or-later](LICENSE)
