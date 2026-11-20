/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/quran", destination: "https://onlyquran.org/publicquran", permanent: true },
      { source: "/quran/:path*", destination: "https://onlyquran.org/quran/:path*", permanent: true },
      { source: "/publicquran", destination: "https://onlyquran.org/publicquran", permanent: true },
      { source: "/research", destination: "https://onlyquran.org/quran", permanent: true },
    ];
  },
};
module.exports = nextConfig;