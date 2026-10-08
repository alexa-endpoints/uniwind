import type { MetroConfig } from 'metro-config'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { TRANSFORM_COMPONENTS } from '../../../src/bundler/adapters/metro/constants'
import { withUniwindConfig } from '../../../src/bundler/adapters/metro/metro'
import { projectArtifactPath, transform } from '../../../src/bundler/adapters/metro/transformer'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import type { UniwindMetroConfig } from '../../../src/bundler/types'
import { Platform } from '../../../src/common/consts'

const mockWorkerTransform = jest.fn(
    async (_config: unknown, _projectRoot: string, _filePath: string, data: Buffer, _options: unknown) => ({
        output: [{ data: { code: data.toString('utf8') } }],
    }),
)

jest.mock('metro-transform-worker', () => ({
    transform: (...args: Parameters<typeof mockWorkerTransform>) => mockWorkerTransform(...args),
}))

jest.mock('../../../src/bundler/adapters/metro/patches', () => ({
    cacheStore: {},
    patchMetroGraphToIncludeCssInLazyGraphs: () => {},
    patchMetroGraphToSupportUncachedModules: () => {},
}))

const transformOptions = (platform: string) => ({
    customTransformOptions: {},
    dev: false,
    inlinePlatform: true,
    inlineRequires: false,
    minify: false,
    platform,
    type: 'module' as const,
    unstable_transformProfile: 'default' as const,
})

const runTransform = async (uniwind: UniwindMetroConfig, filePath: string, data: string, platform: string) => {
    const result = await transform(
        { uniwind, babelTransformerPath: 'upstream-babel-transformer' } as unknown as Parameters<typeof transform>[0],
        process.cwd(),
        filePath,
        Buffer.from(data),
        transformOptions(platform),
    )

    return result.output[0]?.data.code as string
}

const METRO_INJECTED = 'node_modules/uniwind/dist/module/components/web/metro-injected.js'

let directory = ''
let cssEntryFile = ''

beforeAll(() => {
    directory = mkdtempSync(path.join(process.cwd(), '.tmp-default-font-option-'))
    mkdirSync(path.join(directory, 'app'))
    writeFileSync(path.join(directory, 'app', 'global.css'), '@import "tailwindcss";\n@import "uniwind";\n')
    writeFileSync(path.join(directory, 'app', 'App.tsx'), `export const className = 'p-4'`)
    cssEntryFile = path.relative(process.cwd(), path.join(directory, 'app', 'global.css'))
})

afterAll(() => {
    rmSync(directory, { force: true, recursive: true })
})

beforeEach(() => {
    mockWorkerTransform.mockClear()
})

const hostConfig = (config: Partial<UniwindMetroConfig> = {}): UniwindMetroConfig => ({
    cssEntryFile,
    dtsFile: path.join(directory, 'uniwind-types.d.ts'),
    ...config,
})

describe('defaultFontFamily option', () => {
    test('is off unless the config sets it', () => {
        expect(UniwindBundlerConfig.fromMetroConfig({ cssEntryFile }).defaultFontFamily).toBe(false)
        expect(UniwindBundlerConfig.fromViteConfig({ cssEntryFile, defaultFontFamily: true }).defaultFontFamily).toBe(true)
        expect(UniwindBundlerConfig.fromCliConfig({ cssEntryFile, defaultFontFamily: true }).defaultFontFamily).toBe(true)
    })

    test('rejects a family name in place of the switch', () => {
        const config = { cssEntryFile, defaultFontFamily: 'Inter' } as unknown as UniwindMetroConfig

        expect(() => UniwindBundlerConfig.fromMetroConfig(config)).toThrow('Uniwind: defaultFontFamily must be a boolean')
        expect(() => UniwindBundlerConfig.fromViteConfig(config)).toThrow('Uniwind: defaultFontFamily must be a boolean')
    })

    test('reaches the transformer config that Metro hashes into its cache key', () => {
        const config = withUniwindConfig({ projectRoot: process.cwd() } as MetroConfig, { cssEntryFile, defaultFontFamily: true })

        expect((config.transformer as { uniwind: UniwindMetroConfig }).uniwind.defaultFontFamily).toBe(true)
    })

    test.each([
        [undefined, '{"defaultFontFamily":false}'],
        [true, '{"defaultFontFamily":true}'],
    ])('reaches the web runtime through the injected registration (%s)', async (defaultFontFamily, options) => {
        const code = await runTransform(hostConfig({ defaultFontFamily }), METRO_INJECTED, '', Platform.Web)

        expect(code).toBe(`import { Uniwind } from 'uniwind';Uniwind.__reinit(() => ({}), ['light', 'dark'], undefined, ${options});`)
    })

    test('leaves the web runtime option to the host in a federated remote', async () => {
        const code = await runTransform(
            hostConfig({ defaultFontFamily: true, experimental: { federation: { role: 'remote', id: 'remote-a' } } }),
            METRO_INJECTED,
            '',
            Platform.Web,
        )

        expect(code).toBe(`import { Uniwind } from 'uniwind';Uniwind.__reinit(() => ({}), ['light', 'dark']);`)
    })

    test('reaches the native runtime through the host registration and its fingerprint', async () => {
        const registration =
            /^const \{ Uniwind \} = require\('uniwind'\);Uniwind\.__reinit\(rt => (.*), \['light', 'dark'\], '([0-9a-f]{64})', (\{[^}]*\})\);$/s
        const configs = [hostConfig(), hostConfig({ defaultFontFamily: true })]

        try {
            const [off, on] = await Promise.all(configs.map(config => runTransform(config, cssEntryFile, '', Platform.iOS)))
            const [, offStyles, offFingerprint, offOptions] = off?.match(registration) ?? []
            const [, onStyles, onFingerprint, onOptions] = on?.match(registration) ?? []

            expect(offOptions).toBe('{"defaultFontFamily":false}')
            expect(onOptions).toBe('{"defaultFontFamily":true}')
            // The stylesheets match, so only the fingerprint's option part keeps development from skipping the toggle.
            expect(offStyles).toBeDefined()
            expect(onStyles).toBe(offStyles)
            expect(offFingerprint).toBeDefined()
            expect(onFingerprint).toBeDefined()
            expect(onFingerprint).not.toBe(offFingerprint)
        } finally {
            configs.map(config => projectArtifactPath(UniwindBundlerConfig.fromMetroConfig(config))).forEach(artifactPath => {
                rmSync(artifactPath, { force: true })
            })
        }
    })

    test('keys each project artifact by every input that changes its content', async () => {
        const configs = {
            off: hostConfig(),
            on: hostConfig({ defaultFontFamily: true }),
            ocean: hostConfig({ extraThemes: ['ocean'] }),
        }
        const artifactPaths = Object.fromEntries(
            Object.entries(configs).map(([name, config]) => [name, projectArtifactPath(UniwindBundlerConfig.fromMetroConfig(config))]),
        )

        try {
            expect(new Set(Object.values(artifactPaths)).size).toBe(3)

            await Promise.all(Object.values(configs).map(config => runTransform(config, cssEntryFile, '', Platform.iOS)))

            expect(readFileSync(artifactPaths.off!, 'utf-8')).not.toContain('.uniwind-default-font')
            expect(readFileSync(artifactPaths.on!, 'utf-8')).toContain('.uniwind-default-font')
            expect(readFileSync(artifactPaths.ocean!, 'utf-8')).toContain('@custom-variant ocean')
            expect(readFileSync(artifactPaths.off!, 'utf-8')).not.toContain('@custom-variant ocean')
        } finally {
            Object.values(artifactPaths).filter(existsSync).forEach(artifactPath => {
                rmSync(artifactPath, { force: true })
            })
        }
    })

    test.each([
        [undefined, ['Text', 'TextInput']],
        [true, []],
    ])('decides whether classless Text and TextInput compile to raw components (defaultFontFamily %s)', async (defaultFontFamily, textComponents) => {
        await runTransform(
            hostConfig({ defaultFontFamily, experimental: { optimizeClasslessComponents: true } }),
            'App.tsx',
            `import { Text, View } from 'react-native'`,
            Platform.iOS,
        )

        const options = mockWorkerTransform.mock.calls[0]?.[4] as { customTransformOptions: Record<string, unknown> }
        const components = options.customTransformOptions[TRANSFORM_COMPONENTS] as Array<string>

        expect(components).toContain('View')
        expect(components).not.toContain('SafeAreaView')
        expect(components.filter(component => component === 'Text' || component === 'TextInput')).toEqual(textComponents)
    })
})
