/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // El compositor/editor usa APIs del navegador; nada especial en server components.
  experimental: {
    serverComponentsExternalPackages: ["bcryptjs"],
  },
  webpack: (config) => {
    // La voz IA (@xenova/transformers) corre SOLO en el navegador (WASM). Su build
    // por defecto resuelve `onnxruntime-node` y `sharp`, binarios nativos de Node que
    // rompen el bundle. Los anulamos para que use el backend WASM.
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node$": false,
      sharp$: false,
    };
    return config;
  },
};

export default nextConfig;
