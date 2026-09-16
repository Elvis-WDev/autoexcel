import { createRequire } from 'node:module';

const requireFromHere = createRequire(import.meta.url);
const manifest = requireFromHere('../package.json') as { version?: string };

export const APP_VERSION = manifest.version ?? '0.0.0';
