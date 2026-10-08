import type { BabelTransformerArgs } from 'metro-babel-transformer'
import type { JsTransformOptions } from 'metro-transform-worker'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { transform as babelTransform } from '../../../src/bundler/adapters/metro/babel-transformer'
import { componentTransform } from '../../../src/bundler/adapters/metro/component-transform'
import {
    type ClasslessComponentName,
    TRANSFORM_COMPONENTS,
    UPSTREAM_BABEL_TRANSFORMER,
} from '../../../src/bundler/adapters/metro/constants'
import { transform } from '../../../src/bundler/adapters/metro/transformer'
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
