import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// The SDK comes from this repository through a file: dependency, a symlink to ../../node.
// Next only follows it when the repository root is the project root. An app that installs
// @neuraltrust/trustguard-sdk from npm needs none of this.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
