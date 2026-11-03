const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Metro watches the whole workspace, so generated output has to be excluded. Without this a
// Gradle or Xcode build rewrites thousands of files and every write reloads the app, which
// shows up as the app "Refreshing" over and over.
config.resolver.blockList = [
  path.join(projectRoot, "android"),
  path.join(projectRoot, "ios"),
  path.join(projectRoot, ".expo"),
  path.join(projectRoot, "dist"),
  path.join(projectRoot, "dist-ios"),
  path.join(workspaceRoot, ".git"),
  path.join(workspaceRoot, "spikes", "out"),
].map(directoryPattern);

module.exports = config;

function directoryPattern(dir) {
  const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}[/\\\\]`);
}
