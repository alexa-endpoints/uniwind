import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8081',
    },
    webServer: {
        command: 'bun run --cwd ./eager-host start -- --web --port 8081 --clear',
        env: {
            ...process.env,
            CI: '1',
        },
        reuseExistingServer: false,
        timeout: 120_000,
        url: 'http://localhost:8081',
    },
})
