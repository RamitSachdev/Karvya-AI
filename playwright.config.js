import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const LEADS_FILE = path.join(tmpdir(), 'karvya-e2e-leads.json');
export const AGENT_DB_FILE = path.join(tmpdir(), 'karvya-e2e-agent.json');
export const SPEND_FILE = path.join(tmpdir(), 'karvya-e2e-spend.json');
export const ADMIN_TOKEN = 'e2e-token';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.js',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: [
    {
      command: 'node tests/fake-anthropic.js 4180',
      port: 4180,
      reuseExistingServer: false,
    },
    {
      command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      // Blank Supabase and fake API values, so a real .env.local is never used by tests.
      env: {
        LEADS_STORE: 'file', LEADS_FILE, AGENT_DB_FILE, SPEND_FILE, SPEND_LIMIT_USD: '4', ADMIN_TOKEN,
        AGENT_LINK_SECRET: 'e2e-secret', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:4180',
        SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', TRIAL_WEBHOOK_URL: '', PUBLIC_SITE_URL: '', AGENT_MODEL: '', AGENT_EFFORT: '',
      },
    },
  ],
});
