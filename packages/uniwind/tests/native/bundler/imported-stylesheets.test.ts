import type { JsTransformOptions } from 'metro-transform-worker'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { transform } from '../../../src/bundler/adapters/metro/transformer'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import type { UniwindMetroConfig } from '../../../src/bundler/types'

const mockWorkerTransform = jest.fn(
    async (_config: unknown, _projectRoot: string, _filePath: string, data: Buffer) => ({
        output: [{ data: { code: data.toString('utf8') } }],
    }),
)

jest.mock('metro-transform-worker', () => ({
    transform: (...args: Parameters<typeof mockWorkerTransform>) => mockWorkerTransform(...args),
}))

jest.mock('@expo/metro-config', () => ({
    unstable_transformerPath: '/virtual/expo-transform-worker.js',
}))

jest.mock('/virtual/expo-transform-worker.js', () => ({
    transform: (...args: Parameters<typeof mockWorkerTransform>) => mockWorkerTransform(...args),
}), { virtual: true })

jest.mock('../../../src/bundler/adapters/metro/artifact-paths', () => require('./temporaryArtifactPaths'))

let directory = ''

// Stands in for artifact generation, which these tests don't exercise: the project's artifact is a
// copy of the package stylesheet, followed by any extra CSS.
const mockArtifacts = (extraCSS = '') =>
    jest.spyOn(UniwindBundlerConfig.prototype, 'generateArtifacts').mockImplementation(async artifactPath => {
        copyFileSync(path.resolve('uniwind.css'), artifactPath)
        writeFileSync(artifactPath, `${readFileSync(artifactPath, 'utf-8')}\n${extraCSS}`)
    })

beforeEach(() => {
    directory = mkdtempSync(path.join(process.cwd(), '.tmp-imported-stylesheets-'))
    mockWorkerTransform.mockClear()
    mockArtifacts()
})

afterEach(() => {
    jest.restoreAllMocks()
    rmSync(directory, { force: true, recursive: true })
})

const writeFiles = (files: Record<string, string>) => {
    Object.entries(files).forEach(([file, content]) => {
        const filePath = path.join(directory, file)

        mkdirSync(path.dirname(filePath), { recursive: true })
        writeFileSync(filePath, content)
    })
}

// An entry with a nested import, an import from outside its directory, and Tailwind from node_modules.
const createProject = () => {
    writeFiles({
        'app/global.css': [
            '@import "tailwindcss";',
            '@import "./theme/tokens.css";',
            '@import "../shared/brand.css";',
        ].join('\n'),
        'app/theme/tokens.css': ['@import "./colors.css";', '@theme { --spacing-gutter: 12px; }'].join('\n'),
        'app/theme/colors.css': '@theme { --color-brand: #ff0000; }',
        'shared/brand.css': '@theme { --color-accent: #00ff00; }',
        'app/App.tsx': `export const className = 'bg-brand p-gutter'`,
    })

    return path.join(directory, 'app', 'global.css')
}

const createOptions = (platform: string, dev: boolean) =>
    ({
        customTransformOptions: {},
        dev,
        inlinePlatform: true,
        inlineRequires: false,
        minify: false,
        platform,
        type: 'module',
        unstable_transformProfile: 'default',
    }) as unknown as JsTransformOptions

const transformFile = (uniwind: UniwindMetroConfig, filePath: string, platform = 'ios', dev = true) =>
    transform(
        { uniwind } as unknown as Parameters<typeof transform>[0],
        process.cwd(),
        path.relative(process.cwd(), filePath),
        Buffer.from('/* source */'),
        createOptions(platform, dev),
    )

const transformEntry = async (uniwind: UniwindMetroConfig, platform = 'ios', dev = true) => {
    const result = await transformFile(uniwind, path.resolve(process.cwd(), uniwind.cssEntryFile), platform, dev)

    return result.output[0]?.data.code as string
}

// Stylesheet requires use double quotes; the module's own `require('uniwind')` uses single ones.
const stylesheetRequires = (code: string) => Array.from(code.matchAll(/require\("([^"]+)"\);/g), match => match[1])

const NESTED_REQUIRES = ['./theme/colors.css', './theme/tokens.css', '../shared/brand.css']

describe('imported stylesheets', () => {
    test.each(['ios', 'android'])('a development %s entry requires the local stylesheets it imports', async platform => {
        const code = await transformEntry({ cssEntryFile: path.relative(process.cwd(), createProject()) }, platform)

        expect(stylesheetRequires(code)).toEqual(NESTED_REQUIRES)
        expect(code.indexOf('require("')).toBeLessThan(code.indexOf(`require('uniwind')`))
        expect(code).toContain('Uniwind.__reinit(')
        expect(code).not.toContain('node_modules')
    })

    test('a federated remote registration requires them too', async () => {
        const code = await transformEntry({
            cssEntryFile: path.relative(process.cwd(), createProject()),
            experimental: { federation: { role: 'remote', id: 'remote-a' } },
        })

        expect(stylesheetRequires(code)).toEqual(NESTED_REQUIRES)
        expect(code.indexOf('require("')).toBeLessThan(code.indexOf('Uniwind.__mergeStyles("remote-a"'))
    })

    test('an inlined remote requires its own imports, relative to itself', async () => {
        const hostCSSPath = createProject()
        const remoteCSSPath = path.join(directory, 'remote', 'remote.css')

        writeFiles({
            'remote/remote.css': ['@import "tailwindcss";', '@import "./remote-tokens.css";'].join('\n'),
            'remote/remote-tokens.css': '@theme { --color-remote: #0000ff; }',
            'remote/Remote.tsx': `export const className = 'bg-remote'`,
        })

        const uniwind: UniwindMetroConfig = {
            cssEntryFile: path.relative(process.cwd(), hostCSSPath),
            experimental: {
                federation: {
                    role: 'host',
                    inlinedRemotes: [{ id: 'remote-a', cssEntryFile: path.relative(process.cwd(), remoteCSSPath) }],
                },
            },
        }
        const host = await transformEntry(uniwind)
        const remote = (await transformFile(uniwind, remoteCSSPath)).output[0]?.data.code as string

        expect(stylesheetRequires(host)).toEqual(NESTED_REQUIRES)
        expect(stylesheetRequires(remote)).toEqual(['./remote-tokens.css'])
        expect(remote).toContain('Uniwind.__mergeStyles("remote-a"')
    })

    test('the stylesheets the transform writes are never required', async () => {
        const cssPath = createProject()

        mockArtifacts('@theme { --color-artifact: #123456; }')
        writeFiles({
            'app/global.css': ['@import "tailwindcss";', '@import "uniwind";', '@import "./theme/tokens.css";'].join('\n'),
            'app/App.tsx': `export const className = 'bg-artifact bg-brand'`,
        })

        const code = await transformEntry({ cssEntryFile: path.relative(process.cwd(), cssPath) })

        // The entry compiled against the project's artifact, which Tailwind reported as an import.
        expect(code).toContain('"className": "bg-artifact"')
        expect(stylesheetRequires(code)).toEqual(['./theme/colors.css', './theme/tokens.css'])
    })

    test('production builds and web CSS require nothing', async () => {
        const uniwind = { cssEntryFile: path.relative(process.cwd(), createProject()) }

        expect(stylesheetRequires(await transformEntry(uniwind, 'ios', false))).toEqual([])
        expect(await transformEntry(uniwind, 'web')).not.toContain('require(')
    })

    test('each compile collects them afresh', async () => {
        const uniwind = { cssEntryFile: path.relative(process.cwd(), createProject()) }

        await transformEntry(uniwind)
        writeFiles({ 'app/global.css': ['@import "tailwindcss";', '@import "../shared/brand.css";'].join('\n') })

        expect(stylesheetRequires(await transformEntry(uniwind))).toEqual(['../shared/brand.css'])
    })
})

describe('non-entry CSS', () => {
    test('plain Metro serves other native CSS as an empty module', async () => {
        const uniwind = { cssEntryFile: path.relative(process.cwd(), createProject()), isExpoProject: false }
        const tokensPath = path.join(directory, 'app', 'theme', 'tokens.css')

        await transformFile(uniwind, tokensPath)

        const [, , filePath, data] = mockWorkerTransform.mock.calls[0]!

        expect(filePath).toBe(`${path.relative(process.cwd(), tokensPath)}.js`)
        expect(data.toString()).toBe('')
    })

    test('plain Metro still compiles an inlined remote entry', async () => {
        const remoteCSSPath = path.join(directory, 'remote', 'remote.css')

        writeFiles({ 'remote/remote.css': '@import "tailwindcss";' })

        const code = await transformFile({
            cssEntryFile: path.relative(process.cwd(), createProject()),
            isExpoProject: false,
            experimental: {
                federation: {
                    role: 'host',
                    inlinedRemotes: [{ id: 'remote-a', cssEntryFile: path.relative(process.cwd(), remoteCSSPath) }],
                },
            },
        }, remoteCSSPath).then(result => result.output[0]?.data.code as string)

        expect(code).toContain('Uniwind.__mergeStyles("remote-a"')
    })

    test.each([
        ['Expo native', true, 'ios'],
        ['plain Metro web', false, 'web'],
    ])('%s CSS keeps its own handling', async (_, isExpoProject, platform) => {
        const uniwind = { cssEntryFile: path.relative(process.cwd(), createProject()), isExpoProject }
        const tokensPath = path.join(directory, 'app', 'theme', 'tokens.css')

        await transformFile(uniwind, tokensPath, platform)

        const [, , filePath, data] = mockWorkerTransform.mock.calls[0]!

        expect(filePath).toBe(path.relative(process.cwd(), tokensPath))
        expect(data.toString()).toBe('/* source */')
    })
})
