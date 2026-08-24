/** @type {import('next').NextConfig} */
const nextConfig = {
  // Las tarjetas de cumpleaños/aniversario (app/api/cron/celebraciones)
  // leen las fuentes .ttf de lib/fonts en tiempo de ejecución con fs, no
  // con import — Next no las detecta solo al empaquetar la función
  // serverless, así que hay que indicárselo explícitamente o en Vercel
  // faltarían esos archivos y el cron fallaría. En Next 14 esta opción
  // todavía vive bajo "experimental".
  experimental: {
    outputFileTracingIncludes: {
      '/api/cron/celebraciones': ['./lib/fonts/**'],
    },
  },
};

module.exports = nextConfig;
