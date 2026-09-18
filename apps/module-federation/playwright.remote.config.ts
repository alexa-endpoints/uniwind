import { defineConfig, devices } from '@playwright/test'

const environment = {
    ...process.env,
    CI: '1',
}

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
    webServer: [
        {
            command: 'bun run --cwd ./eager-remote start -- --port 8082 --clear',
            env: environment,
            reuseExistingServer: false,
            timeout: 120_000,
            url: 'http://localhost:8082/mf-manifest.json',
        },
        {
            command: 'bun run --cwd ./eager-remote-host start -- --web --port 8081 --clear',
            env: environment,
            reuseExistingServer: false,
            timeout: 120_000,
            url: 'http://localhost:8081',
        },
    ],
})
