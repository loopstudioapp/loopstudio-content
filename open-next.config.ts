import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Every page is either static (served read-only from Workers Static Assets)
// or dynamic; nothing uses ISR/revalidation, so no R2/KV cache is needed.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
