import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../.next/export-base-path', import.meta.url), (process.env.LIVESHOW_BASE_PATH ?? '').replace(/\/$/, ''));
