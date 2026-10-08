import type { BabelTransformerArgs } from 'metro-babel-transformer'
import type { JsTransformOptions } from 'metro-transform-worker'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { dirname, join, relative } from 'node:path'
import { transform as babelTransform } from '../../../src/bundler/adapters/metro/babel-transformer'
import { componentTransform } from '../../../src/bundler/adapters/metro/component-transform'
import {
    type ClasslessComponentName,
    TRANSFORM_COMPONENTS,
    UPSTREAM_BABEL_TRANSFORMER,
} from '../../../src/bundler/adapters/metro/constants'
import { isImportedStylesheet, transform } from '../../../src/bundler/adapters/metro/transformer'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import { compileTailwind } from '../../../src/bundler/css-compiler/compileTailwind'
import type { UniwindMetroConfig } from '../../../src/bundler/types'

const mockWorkerTransform = jest.fn((..._args: Array<unknown>) => Promise.resolve({ output: [] }))
const mockUpstreamBabelTransform = jest.fn((args: BabelTransformerArgs) => args)

jest.mock('metro-transform-worker', () => ({
    transform: (...args: Array<unknown>) => mockWorkerTransform(...args),
}))

jest.mock('/virtual/upstream-babel-transformer.js', () => ({
    transform: (args: BabelTransformerArgs) => mockUpstreamBabelTransform(args),
}), { virtual: true })

const PROJECT_ROOT = path.join('/', 'workspace', 'app')
const UPSTREAM_BABEL_TRANSFORMER_PATH = '/virtual/upstream-babel-transformer.js'
const UNIWIND_BABEL_TRANSFORMER_PATH = require.resolve('../../../src/bundler/adapters/metro/babel-transformer')
const RAW_COMPONENTS_PATH = require.resolve('../../../src/bundler/adapters/metro/raw-components')

const createConfig = (
    optimizedClasslessComponents?: Array<ClasslessComponentName>,
    uniwind: Partial<UniwindMetroConfig> = {},
) => ({
    babelTransformerPath: UPSTREAM_BABEL_TRANSFORMER_PATH,
    uniwind: {
        cssEntryFile: './global.css',
        isExpoProject: false,
        optimizedClasslessComponents,
        ...uniwind,
    },
}) as unknown as Parameters<typeof transform>[0]

const transformOptions = {
    customTransformOptions: { engine: 'hermes' },
    platform: 'ios',
    type: 'module',
} as unknown as JsTransformOptions

const source = Buffer.from(`
    import { View } from 'react-native'

    export const Component = () => <View />
`)

const getWorkerCall = () => {
    expect(mockWorkerTransform).toHaveBeenCalledTimes(1)

    const [config, projectRoot, filePath, data, options] = mockWorkerTransform.mock.calls[0] as Parameters<typeof transform>

    return { config, data, filePath, options, projectRoot }
}

beforeEach(() => {
    mockWorkerTransform.mockClear()
    mockUpstreamBabelTransform.mockClear()
})

describe('transform', () => {
    test('dispatches through the Uniwind Babel transformer with the enabled components', async () => {
        await transform(createConfig(['Image', 'View']), PROJECT_ROOT, 'App.tsx', source, transformOptions)

        const { config, data, options } = getWorkerCall()

        expect(config.babelTransformerPath).toBe(UNIWIND_BABEL_TRANSFORMER_PATH)
        expect(data).toBe(source)
        expect(options.customTransformOptions).toEqual({
            engine: 'hermes',
            [TRANSFORM_COMPONENTS]: ['Image', 'View'],
            [UPSTREAM_BABEL_TRANSFORMER]: UPSTREAM_BABEL_TRANSFORMER_PATH,
        })
    })

    test.each([
        ['no resolved list', undefined],
        ['an empty list', []],
    ])('keeps the upstream Babel transformer for %s', async (_, components) => {
        await transform(createConfig(components), PROJECT_ROOT, 'App.tsx', source, transformOptions)

        const { config, options } = getWorkerCall()

        expect(config.babelTransformerPath).toBe(UPSTREAM_BABEL_TRANSFORMER_PATH)
        expect(options).toBe(transformOptions)
    })

    test('serves only the enabled components from the raw-component module', async () => {
        await transform(
            createConfig(['Image', 'View']),
            PROJECT_ROOT,
            path.relative(PROJECT_ROOT, RAW_COMPONENTS_PATH),
            readFileSync(RAW_COMPONENTS_PATH),
            transformOptions,
        )

        const { config, data, options } = getWorkerCall()

        expect(data.toString()).toBe(`export { Image, View } from 'react-native'\n`)
        expect(config.babelTransformerPath).toBe(UPSTREAM_BABEL_TRANSFORMER_PATH)
        expect(options).toBe(transformOptions)
    })

    test('never serves an excluded component from the raw-component module', async () => {
        await transform(
            createConfig(['SafeAreaView', 'View'] as Array<ClasslessComponentName>),
            PROJECT_ROOT,
            path.relative(PROJECT_ROOT, RAW_COMPONENTS_PATH),
            readFileSync(RAW_COMPONENTS_PATH),
            transformOptions,
        )

        expect(getWorkerCall().data.toString()).toBe(`export { View } from 'react-native'\n`)
    })

    // A federated remote must not bundle Uniwind's runtime through the raw-component module.
    test('serves the raw-component module from react-native alone in a federated remote', async () => {
        await transform(
            createConfig(['Text', 'View'], { defaultFontFamily: true, experimental: { federation: { role: 'remote', id: 'remote-a' } } }),
            PROJECT_ROOT,
            path.relative(PROJECT_ROOT, RAW_COMPONENTS_PATH),
            readFileSync(RAW_COMPONENTS_PATH),
            transformOptions,
        )

        expect(getWorkerCall().data.toString()).toBe(`export { Text, View } from 'react-native'\n`)
    })

    test('leaves the raw-component module as written when no component is enabled', async () => {
        const data = readFileSync(RAW_COMPONENTS_PATH)

        await transform(createConfig([]), PROJECT_ROOT, path.relative(PROJECT_ROOT, RAW_COMPONENTS_PATH), data, transformOptions)

        expect(getWorkerCall().data).toBe(data)
    })
})

describe('Babel transformer', () => {
    const createArgs = (components: unknown) =>
        ({
            filename: 'App.tsx',
            options: {
                customTransformOptions: {
                    engine: 'hermes',
                    [TRANSFORM_COMPONENTS]: components,
                    [UPSTREAM_BABEL_TRANSFORMER]: UPSTREAM_BABEL_TRANSFORMER_PATH,
                },
            },
            plugins: [],
            src: '',
        }) as unknown as BabelTransformerArgs

    test('adds the component transform with the enabled components', () => {
        babelTransform(createArgs(['View']))

        const [args] = mockUpstreamBabelTransform.mock.calls[0]!

        expect(args.plugins).toEqual([[componentTransform, { components: ['View'] }]])
        expect(args.options.customTransformOptions).toEqual({ engine: 'hermes' })
    })

    // Babel caches plugin instances by options identity, so a fresh object per file would rebuild the
    // component transform for every file.
    test('reuses one plugin options object per component list', () => {
        babelTransform(createArgs(['Image', 'View']))
        babelTransform(createArgs(['Image', 'View']))
        babelTransform(createArgs(['View']))

        const [first, second, third] = mockUpstreamBabelTransform.mock.calls.map(([args]) => {
            const [plugin, options] = args.plugins!.at(-1) as [unknown, unknown]

            expect(plugin).toBe(componentTransform)

            return options
        })

        expect(second).toBe(first)
        expect(first).toEqual({ components: ['Image', 'View'] })
        expect(third).not.toBe(first)
        expect(third).toEqual({ components: ['View'] })
    })

    test.each([
        ['an empty list', []],
        ['no list', undefined],
    ])('adds no component transform for %s', (_, components) => {
        babelTransform(createArgs(components))

        const [args] = mockUpstreamBabelTransform.mock.calls[0]!

        expect(args.plugins).toEqual([])
        expect(args.options.customTransformOptions).toEqual({ engine: 'hermes' })
    })
})

describe('imported stylesheets', () => {
    let root = ''

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'uniwind-transformer-'))
    })

    afterEach(() => {
        rmSync(root, { recursive: true, force: true })
    })

    const writeFiles = (files: Record<string, string>) => {
        Object.entries(files).forEach(([file, content]) => {
            mkdirSync(dirname(join(root, file)), { recursive: true })
            writeFileSync(join(root, file), content)
        })
    }

    // The stylesheets Tailwind reports while compiling the entry, as the transformer receives them.
    const compileDependencies = async (cssEntryFile: string) => {
        const dependencies: Array<string> = []
        const bundlerConfig = UniwindBundlerConfig.fromMetroConfig({ cssEntryFile: relative(process.cwd(), join(root, cssEntryFile)) }, 'ios')

        await compileTailwind(bundlerConfig, {
            onDependency: dependency => {
                dependencies.push(dependency)
            },
        })

        return dependencies
    }

    test.each([
        ['its real path', () => join(realpathSync(root), 'packages', 'uniwind', 'uniwind.css')],
        ['the linked path', () => join(root, 'app', 'node_modules', 'uniwind', 'uniwind.css')],
    ])('skips the generated artifact of a linked uniwind, given %s', async (_, artifactPath) => {
        // A workspace package or `npm link`: node_modules/uniwind links to a directory outside node_modules.
        writeFiles({
            'packages/uniwind/package.json': JSON.stringify({ name: 'uniwind', style: './uniwind.css' }),
            'packages/uniwind/uniwind.css': '@theme { --color-artifact: #000000; }',
            'packages/brand/package.json': JSON.stringify({ name: 'brand', style: './brand.css' }),
            'packages/brand/brand.css': '@theme { --color-brand: #111111; }',
            'app/node_modules/theme/package.json': JSON.stringify({ name: 'theme', style: './theme.css' }),
            'app/node_modules/theme/theme.css': '@theme { --color-theme: #222222; }',
            'app/global.css': ['@import "uniwind";', '@import "brand";', '@import "theme";', '@import "./tokens.css";'].join('\n'),
            'app/tokens.css': '@theme { --color-token: #333333; }',
        })
        symlinkSync(join(root, 'packages', 'uniwind'), join(root, 'app', 'node_modules', 'uniwind'), 'dir')
        symlinkSync(join(root, 'packages', 'brand'), join(root, 'app', 'node_modules', 'brand'), 'dir')

        const realRoot = realpathSync(root)
        const dependencies = await compileDependencies('app/global.css')

        // Tailwind reports linked stylesheets by their real paths, outside node_modules.
        expect(dependencies).toContain(join(realRoot, 'packages', 'uniwind', 'uniwind.css'))
        expect(dependencies.filter(dependency => isImportedStylesheet(dependency, artifactPath())).sort()).toEqual([
            join(realRoot, 'app', 'tokens.css'),
            join(realRoot, 'packages', 'brand', 'brand.css'),
        ])
    })
})
