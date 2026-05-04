import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.0.162",
    "192.168.0.162:3000",
    "*.trycloudflare.com",
  ],
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
