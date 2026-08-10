/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Las imágenes de historias viven en blob:/data: o en APIs propias.
    // No abrimos el optimizador a internet arbitrario.
    remotePatterns: [],
  },
  // El compositor/editor usa APIs del navegador; nada especial en server components.
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["bcryptjs"],
    // La biblioteca de audio vive en assets/, fuera de public/, para que no se
    // pueda descargar sin sesión. Next solo empaqueta public/ y .next, así que
    // hay que decirle que esta carpeta también hace falta en el servidor.
    outputFileTracingIncludes: {
      "/api/story/audio/**": ["./assets/**"],
    },
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
