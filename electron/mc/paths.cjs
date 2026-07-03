// Shared filesystem paths for the Minecraft launcher pipeline.
// Every mc/*.cjs module resolves paths through this file so we agree.

const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const ROOT = () => path.join(app.getPath("home"), ".rubix", "minecraft");
const INSTANCES_DIR = () => path.join(ROOT(), "instances");
const INSTANCE_DIR = (name) =>
  path.join(INSTANCES_DIR(), String(name).replace(/[\\/:*?"<>|]+/g, "_").trim());

// Shared caches across all instances.
const VERSIONS_DIR = () => path.join(ROOT(), "versions");
const VERSION_DIR = (id) => path.join(VERSIONS_DIR(), id);
const LIBRARIES_DIR = () => path.join(ROOT(), "libraries");
const ASSETS_DIR = () => path.join(ROOT(), "assets");
const ASSETS_INDEXES_DIR = () => path.join(ASSETS_DIR(), "indexes");
const ASSETS_OBJECTS_DIR = () => path.join(ASSETS_DIR(), "objects");
const RUNTIME_DIR = () => path.join(ROOT(), "runtime");
const RUNTIME_MAJOR_DIR = (major) => path.join(RUNTIME_DIR(), `jre-${major}`);
const INSTALLER_CACHE = () => path.join(ROOT(), "loader-installers");
const ACCOUNT_FILE = () => path.join(ROOT(), "account.bin");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

module.exports = {
  ROOT,
  INSTANCES_DIR,
  INSTANCE_DIR,
  VERSIONS_DIR,
  VERSION_DIR,
  LIBRARIES_DIR,
  ASSETS_DIR,
  ASSETS_INDEXES_DIR,
  ASSETS_OBJECTS_DIR,
  RUNTIME_DIR,
  RUNTIME_MAJOR_DIR,
  INSTALLER_CACHE,
  ACCOUNT_FILE,
  ensureDir,
};
