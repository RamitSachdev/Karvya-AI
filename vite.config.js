import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const root = process.cwd();
const ROUTES = {
  '/api/leads': 'api/leads.js',
  '/api/admin/leads': 'api/admin/leads.js',
  '/api/admin/approve': 'api/admin/approve.js',
  '/api/agent/workspace': 'api/agent/workspace.js',
  '/api/agent/session': 'api/agent/session.js',
  '/api/agent/chat': 'api/agent/chat.js',
};
const PAGES = new Set(['/start', '/agent', '/admin']);

// Mirrors the hosting setup locally: the real API handlers and clean URLs, plus
// the production security headers in `preview` (Vite's dev server injects inline
// scripts that the policy would block).
function hostingParity({ applyHeaders }) {
  const { headers } = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')).headers[0];
  const middleware = async (req, res, next) => {
    const pathname = new URL(req.url, 'http://x').pathname;
    if (applyHeaders) headers.forEach(({ key, value }) => res.setHeader(key, value));
    if (ROUTES[pathname]) {
      const url = pathToFileURL(resolve(root, ROUTES[pathname])).href;
      const { default: handler } = await import(url);
      return handler(req, res);
    }
    if (PAGES.has(pathname)) req.url = req.url.replace(pathname, `${pathname}.html`);
    next();
  };
  return {
    name: 'karvya-hosting-parity',
    configureServer: (server) => { server.middlewares.use(middleware); },
    configurePreviewServer: (server) => { server.middlewares.use(middleware); },
  };
}

export default defineConfig(({ mode, command, isPreview }) => {
  if (command === 'serve') {
    // Values already set win over .env files, so tests can't pick up real credentials.
    for (const [key, value] of Object.entries(loadEnv(mode, root, ''))) process.env[key] ??= value;
    process.env.LEADS_STORE ||= 'file';
  }
  return {
    appType: 'mpa',
    preview: { allowedHosts: ['.trycloudflare.com'] }, // npm run demo:share serves through one of these.
    plugins: [hostingParity({ applyHeaders: Boolean(isPreview) })],
    build: {
      rollupOptions: { input: { main: resolve(root, 'index.html'), start: resolve(root, 'start.html'), agent: resolve(root, 'agent.html'), admin: resolve(root, 'admin.html') } },
    },
  };
});
