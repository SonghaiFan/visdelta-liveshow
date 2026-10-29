const basePath = (process.env.LIVESHOW_BASE_PATH ?? '').replace(/\/$/, '');
const config = { output: 'export', trailingSlash: true, basePath, reactStrictMode: true, images: { unoptimized: true }, env: { NEXT_PUBLIC_BASE_PATH: basePath }, turbopack: { root: import.meta.dirname } };

export default config;
