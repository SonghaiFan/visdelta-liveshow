import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import 'visdelta/style.css';
import './global.css';
export const metadata: Metadata = { title: 'VisDelta Liveshow', description: 'Real-time visualization updates for AI agents.' };
export default function Layout({ children }: { children: ReactNode }) {
 return <html lang="en"><body className="flex min-h-screen flex-col font-sans"><header className="flex h-11 shrink-0 items-center gap-4 border-b px-4 text-sm"><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`} aria-current="page">Liveshow</a><a href="https://songhaifan.github.io/visdelta/">VisDelta</a><a href="https://github.com/SonghaiFan/visdelta-liveshow">GitHub</a></header>{children}</body></html>;
}
