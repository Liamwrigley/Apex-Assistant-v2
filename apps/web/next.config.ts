import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@apex-assistant/cache", "@apex-assistant/core", "@apex-assistant/db"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    config.resolve.conditionNames = [
      "source",
      ...(config.resolve.conditionNames ?? [
        "import",
        "module",
        "require",
        "default",
      ]),
    ];
    return config;
  },
};

export default nextConfig;
