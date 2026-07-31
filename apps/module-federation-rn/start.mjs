import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const platform = process.argv[2] ?? 'servers'
const supportedPlatforms = new Set(['android', 'ios', 'servers'])
const reactNativeCli = fileURLToPath(
    new URL('../../node_modules/react-native/cli.js', import.meta.url),
)
const pidFile = fileURLToPath(new URL('./.servers.pid', import.meta.url))

if (!supportedPlatforms.has(platform)) {
    console.error('Usage: bun start.mjs <android|ios|servers>')
    process.exit(1)
}

const getManagedLauncher = () => {
    let activePid

    try {
        activePid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10)
        process.kill(activePid, 0)
    } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ESRCH') {
            return null
        }

        throw error
    }

    const processInfo = spawnSync('ps', ['-p', String(activePid), '-o', 'command='], {
        encoding: 'utf8',
    })

    if (processInfo.error) {
        throw processInfo.error
    }

    return processInfo.status === 0 && processInfo.stdout.includes('start.mjs')
        ? activePid
        : null
}

const activePid = getManagedLauncher()

if (activePid) {
    console.error(`[module-federation-rn] Servers are already managed by PID ${activePid}`)
    process.exit(1)
}

try {
    rmSync(pidFile)
} catch (error) {
    if (error?.code !== 'ENOENT') {
        throw error
    }
}

writeFileSync(pidFile, `${process.pid}\n`)

const projects = [
    {
        name: 'Remote A',
        cwd: new URL('./remote-a', import.meta.url),
        port: 8082,
    },
    {
        name: 'Remote B',
        cwd: new URL('./remote-b', import.meta.url),
        port: 8083,
    },
    {
        name: 'Host',
        cwd: new URL('./host', import.meta.url),
        port: 8081,
    },
]

const children = []
const settledChildren = new Set()
let stopping = false

const cleanupPidFile = () => {
    try {
        if (Number.parseInt(readFileSync(pidFile, 'utf8'), 10) === process.pid) {
            rmSync(pidFile)
        }
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            throw error
        }
    }
}

const exitWhenChildrenStop = () => {
    if (stopping && children.every(child => settledChildren.has(child))) {
        process.exit(process.exitCode ?? 0)
    }
}

const stopAll = signal => {
    if (stopping) {
        exitWhenChildrenStop()
        return
    }

    stopping = true

    for (const child of children) {
        if (!child.pid) {
            continue
        }

        try {
            process.kill(child.pid, signal)
        } catch (error) {
            if (error?.code !== 'ESRCH') {
                throw error
            }
        }
    }
}

const startChild = (name, args, cwd, env = process.env) => {
    console.log(`[module-federation-rn] Starting ${name}`)

    const child = spawn('node', [reactNativeCli, ...args], {
        cwd,
        env,
        stdio: 'inherit',
    })

    children.push(child)

    child.on('error', error => {
        settledChildren.add(child)

        if (!stopping) {
            console.error(`[module-federation-rn] ${name} failed to start: ${error.message}`)
            process.exitCode = 1
            stopAll('SIGTERM')
        }

        exitWhenChildrenStop()
    })

    child.on('exit', code => {
        settledChildren.add(child)

        if (!stopping && code !== 0) {
            console.error(`[module-federation-rn] ${name} exited with code ${code}`)
            process.exitCode = code ?? 1
            stopAll('SIGTERM')
        }

        exitWhenChildrenStop()
    })

    return child
}

for (const project of projects) {
    startChild(
        project.name,
        ['start', '--port', String(project.port), '--reset-cache', '--no-interactive'],
        project.cwd,
        {
            ...process.env,
            MF_DEV_SERVER_HOST: process.env.MF_DEV_SERVER_HOST ?? 'localhost',
        },
    )
}

const waitForUrl = async (name, url) => {
    const deadline = Date.now() + 60_000

    while (Date.now() < deadline) {
        try {
            const response = await fetch(url)

            if (response.ok) {
                console.log(`[module-federation-rn] ${name} is ready`)
                return
            }
        } catch {
            // Metro has not opened its listener yet.
        }

        await new Promise(resolve => setTimeout(resolve, 250))
    }

    throw new Error(`Timed out waiting for ${name} at ${url}`)
}

const reverseAndroidPorts = () => {
    for (const port of [8081, 8082, 8083]) {
        const result = spawnSync('adb', ['reverse', `tcp:${port}`, `tcp:${port}`], {
            stdio: 'inherit',
        })

        if (result.error || result.status !== 0) {
            throw result.error ?? new Error(`adb reverse failed for port ${port}`)
        }
    }
}

if (platform !== 'servers') {
    try {
        await Promise.all([
            waitForUrl('Host', 'http://localhost:8081/status'),
            waitForUrl('Remote A manifest', 'http://localhost:8082/mf-manifest.json'),
            waitForUrl('Remote B manifest', 'http://localhost:8083/mf-manifest.json'),
        ])

        if (platform === 'android' && !process.env.MF_DEV_SERVER_HOST) {
            reverseAndroidPorts()
        }

        startChild(
            `local ${platform} host`,
            [`run-${platform}`, '--no-packager', '--port', '8081'],
            new URL('./host', import.meta.url),
            {
                ...process.env,
                RCT_METRO_PORT: '8081',
            },
        )
    } catch (error) {
        console.error(`[module-federation-rn] ${platform} startup failed: ${error.message}`)
        process.exitCode = 1
        stopAll('SIGTERM')
    }
}

process.on('SIGINT', () => stopAll('SIGTERM'))
process.on('SIGTERM', () => stopAll('SIGTERM'))
process.on('exit', cleanupPidFile)
