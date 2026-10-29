const basePath = (process.env.LIVESHOW_BASE_PATH ?? '').replace(/\/$/, '');
export default function config(phase) {
 const dev = phase === 'phase-development-server';
 return { ...(dev ? { async rewrites() { return [{ source: '/api/liveshow/:path*', destination: 'http://127.0.0.1:4325/api/liveshow/:path*' }]; } } : { output: 'export' }),
 trailingSlash: true, basePath, reactStrictMode: true, images: { unoptimized: true },
 env: { NEXT_PUBLIC_BASE_PATH: basePath }, turbopack: { root: import.meta.dirname } };
}
