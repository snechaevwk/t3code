"use strict";

// OM Code: launcher label. Expo derives `app_name` from `name`, which stays
// upstream's so native project names and build scripts keep working.
const { withStringsXml } = require("expo/config-plugins");

module.exports = function withOmAndroidAppLabel(config, { label }) {
  return withStringsXml(config, (nextConfig) => {
    const strings = (nextConfig.modResults.resources.string ??= []);
    const existing = strings.find((entry) => entry.$?.name === "app_name");
    if (existing) existing._ = label;
    else strings.push({ $: { name: "app_name" }, _: label });
    return nextConfig;
  });
};
