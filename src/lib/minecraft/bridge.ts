// Thin wrapper around window.rubix.minecraft so components can call it
// without typing `(window as any)` everywhere, and so the rest of the
// app can run in the web preview (returns "desktop required" results).

import type { Loader } from "./api";

export type Instance = {
  name: string;
  mcVersion: string;
  loader: Loader;
  loaderVersion: string;
  createdAt: string;
  lastPlayed: string | null;
  ramMb: number;
  javaPath: string;
  dir: string;
  modCount: number;
  sizeBytes: number;
  installerPath?: string | null;
};

export type InstalledMod = {
  projectId: number;
  fileId: number;
  fileName: string;
  name: string;
  enabled: boolean;
  installedAt: string;
  dependencies: number[];
};

function api() {
  if (typeof window === "undefined") return null;
  const r = (window as any).rubix;
  if (!r?.isElectron || !r.minecraft) return null;
  return r.minecraft;
}

export const isDesktop = () => api() !== null;

const fail = (error = "Minecraft instances require the RUBIX desktop app.") =>
  ({ ok: false, error } as const);

export async function envInfo() {
  return api()?.env() ?? fail();
}
export async function listInstances(): Promise<{ ok: boolean; instances: Instance[]; error?: string }> {
  const r = await api()?.listInstances();
  return r ?? { ok: false, instances: [], error: "Desktop required" };
}
export async function getInstance(name: string): Promise<{ ok: boolean; instance?: Instance; installed?: Record<string, InstalledMod>; error?: string }> {
  return api()?.getInstance(name) ?? fail();
}
export async function createInstance(p: {
  name: string; mcVersion: string; loader: Loader; loaderVersion: string;
}) {
  return api()?.createInstance(p) ?? fail();
}
export async function renameInstance(from: string, to: string) {
  return api()?.renameInstance(from, to) ?? fail();
}
export async function duplicateInstance(name: string, newName: string) {
  return api()?.duplicateInstance(name, newName) ?? fail();
}
export async function deleteInstance(name: string) {
  return api()?.deleteInstance(name) ?? fail();
}
export async function openInstanceFolder(name: string) {
  return api()?.openInstanceFolder(name) ?? fail();
}
export async function updateInstance(name: string, patch: Partial<Instance>) {
  return api()?.updateInstance(name, patch) ?? fail();
}
export async function installMod(p: {
  instance: string; projectId: number; fileId: number; fileName: string;
  name: string; downloadUrl: string; dependencies?: number[];
}) {
  return api()?.installMod(p) ?? fail();
}
export async function uninstallMod(instance: string, projectId: number) {
  return api()?.uninstallMod(instance, projectId) ?? fail();
}
export async function toggleMod(instance: string, projectId: number, enabled: boolean) {
  return api()?.toggleMod(instance, projectId, enabled) ?? fail();
}
export async function importModpack(instanceName?: string) {
  return api()?.importModpack(instanceName) ?? fail();
}

// ---------- Resource / shader packs ----------
export type PackKind = "resourcepack" | "shader";
export type InstalledPack = {
  projectId: string | null;
  versionId: string | null;
  fileName: string;
  name: string;
  installedAt: string;
  enabled: boolean;
  kind: PackKind;
};
export async function listPacks(
  instance: string, kind: PackKind,
): Promise<{ ok: boolean; packs: InstalledPack[]; folder?: string; error?: string }> {
  return api()?.listPacks(instance, kind) ?? { ok: false, packs: [], error: "Desktop required" };
}
export async function installPack(p: {
  instance: string; kind: PackKind;
  projectId?: string | null; versionId?: string | null;
  fileName: string; name: string; downloadUrl: string;
  replace?: "replace" | "keep-both";
}): Promise<{ ok: boolean; conflict?: boolean; fileName?: string; error?: string }> {
  return api()?.installPack(p) ?? fail();
}
export async function uninstallPack(instance: string, kind: PackKind, key: string) {
  return api()?.uninstallPack(instance, kind, key) ?? fail();
}
export async function togglePack(instance: string, kind: PackKind, key: string, enabled: boolean) {
  return api()?.togglePack(instance, kind, key, enabled) ?? fail();
}
export async function detectShaderRenderer(
  instance: string,
): Promise<{ ok: boolean; hasRenderer: boolean; renderers: string[]; error?: string }> {
  return api()?.detectShaderRenderer(instance) ?? { ok: false, hasRenderer: false, renderers: [] };
}

export async function launch(name: string) {
  return api()?.launch(name) ?? fail();
}

// ---------- Microsoft auth + progress ----------
export type McAccount = { uuid: string; name: string };
export type McProgress = { phase: string; done: number; total: number; current?: string; logPath?: string };

export async function whoami(): Promise<{ ok: boolean; account: McAccount | null; error?: string }> {
  return api()?.whoami() ?? { ok: false, account: null, error: "Desktop required" };
}
export async function signInStart() {
  return api()?.signInStart() ?? fail();
}
export async function signInCancel() {
  return api()?.signInCancel() ?? fail();
}
export async function signOut() {
  return api()?.signOut() ?? fail();
}
export function onSignInComplete(cb: (data: { ok: boolean; account?: McAccount; error?: string }) => void) {
  return api()?.onSignInComplete(cb) ?? (() => {});
}
export function onProgress(cb: (data: McProgress) => void) {
  return api()?.onProgress(cb) ?? (() => {});
}
