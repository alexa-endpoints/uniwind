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
import { shouldTransformClasslessComponents, transform } from '../../../src/bundler/adapters/metro/transformer'

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

const createConfig = (optimizedClasslessComponents?: Array<ClasslessComponentName>) =>
    ({
        babelTransformerPath: UPSTREAM_BABEL_TRANSFORMER_PATH,
        uniwind: {
            cssEntryFile: './global.css',
            isExpoProject: false,
            optimizedClasslessComponents,
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

// Mentions `react-native` and enabled component names, so it passes the classless gate's substring checks.
const stylesheet = Buffer.from(`
    /* Tokens for react-native screens: View, Text. */
    @theme {
        --color-probe: #123456;
    }
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

    // Plain Metro parses CSS as JavaScript, so the CSS guard has to run before the classless gate: a
    // stylesheet that passes the gate must still become an empty module instead of reaching Babel.
    test.each([
        ['enabled components', ['View', 'Text'] as Array<ClasslessComponentName>],
        ['no resolved list', undefined],
        ['an empty list', []],
    ])('serves non-entry native CSS as an empty module in plain Metro with %s', async (_, components) => {
        const config = createConfig(components)

        expect(shouldTransformClasslessComponents(config.uniwind, stylesheet, transformOptions)).toBe((components?.length ?? 0) > 0)

        await transform(config, PROJECT_ROOT, 'tokens.css', stylesheet, transformOptions)

        const call = getWorkerCall()

        expect(call.filePath).toBe('tokens.css.js')
        expect(call.data.length).toBe(0)
        expect(call.config).toBe(config)
        expect(call.options).toBe(transformOptions)
    })

    test.each([
        ['web', { ...transformOptions, platform: 'web' } as JsTransformOptions],
        ['asset', { ...transformOptions, type: 'asset' } as JsTransformOptions],
    ])('passes %s CSS through with enabled components', async (_, options) => {
        const config = createConfig(['View', 'Text'])

        await transform(config, PROJECT_ROOT, 'tokens.css', stylesheet, options)

        const call = getWorkerCall()

        expect(call.filePath).toBe('tokens.css')
        expect(call.data).toBe(stylesheet)
        expect(call.config).toBe(config)
        expect(call.options).toBe(options)
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
