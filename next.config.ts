import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The old admin page only forwarded to the retired /owner/accounts.
      { source: "/admin", destination: "/owner", permanent: false },
      // The GrailScan server dashboard moved to its own site. The
      // /api/grailscan/* routes stay here for the Loop Dashboard iOS app.
      { source: "/grailscan", destination: "https://grail.loopstudio.tech", permanent: false },
    ];
  },
};

export default nextConfig;
