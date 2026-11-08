import path from "node:path";

/** Reads settings from the environment. On server1 the systemd unit sets them. */
export function loadConfig() {
  const dataDir = path.resolve(process.env.PINILLALIST_DATA ?? "data");
  return {
    port: Number(process.env.PORT ?? 3100),
    host: process.env.HOST ?? "127.0.0.1",
    dataDir,
    dbFile: path.join(dataDir, "pinillalist.db"),
    photosDir: path.join(dataDir, "photos"),
    distDir: path.resolve(process.env.PINILLALIST_DIST ?? "dist"),
    secureCookie: process.env.NODE_ENV === "production",
  };
}
