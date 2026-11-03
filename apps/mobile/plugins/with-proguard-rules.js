const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const RULE = `
# PDFBox references an optional JPEG2000 decoder. Text extraction never calls it,
# so suppressing the missing class is safe.
-dontwarn com.gemalto.jp2.**
`;

function withProguardRules(config) {
  return withDangerousMod(config, ["android", async (config) => {
    const file = path.join(
      config.modRequest.platformProjectRoot,
      "app",
      "proguard-rules.pro",
    );
    const current = fs.readFileSync(file, "utf8");
    if (!current.includes("com.gemalto.jp2")) {
      fs.appendFileSync(file, RULE);
    }
    return config;
  }]);
}

module.exports = withProguardRules;
