export const config = {
  port: Number(process.env.PORT ?? 3001),
  dataDir: process.env.DATA_DIR ?? "/data",
  buildkitHost: process.env.BUILDKIT_HOST ?? "tcp://buildkit:1234",
  caddyAdminUrl: process.env.CADDY_ADMIN_URL ?? "http://caddy:2019",
  appsNetwork: process.env.APPS_NETWORK ?? "brimble-pipeline_apps",
  publicHostSuffix: process.env.PUBLIC_HOST_SUFFIX ?? "localhost",
  appPort: 8080,
} as const;
