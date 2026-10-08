import { getDefaultConfig as getExpoDefaultConfig } from '@expo/metro-config'
import type { MetroConfig } from 'metro-config'
import getTransformCacheKey from 'metro/private/DeltaBundler/getTransformCacheKey'
import fs from 'node:fs'
import path from 'node:path'
import type { ClasslessComponentName } from '../../../src/bundler/adapters/metro/constants'
import { withUniwindConfig } from '../../../src/bundler/adapters/metro/metro'
import type { ExperimentalMetroOptions } from '../../../src/bundler/types'

jest.mock('../../../src/bundler/adapters/metro/patches', () => ({
    cacheStore: {},
    patchMetroGraphToIncludeCssInLazyGraphs: () => {},
    patchMetroGraphToSupportUncachedModules: () => {},
}))

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..')

// `expo start` and `expo export` move a custom `transformerPath` behind Expo's supervising worker,
// whose own `getCacheKey` then builds the key. @expo/cli ships no declarations for this module.
const { withMetroSupervisingTransformWorker } = require(
    '@expo/cli/build/src/start/server/metro/withMetroSupervisingTransformWorker',
) as {
    withMetroSupervisingTransformWorker: (config: MetroConfig) => MetroConfig
}

const UNIWIND_TRANSFORMER_FILES = {
    'Babel transformer': require.resolve('../../../src/bundler/adapters/metro/babel-transformer'),
    transformer: require.resolve('../../../src/bundler/adapters/metro/transformer'),
}

const getBareDefaultConfig = () => {
    const { getDefaultConfig } = require('@react-native/metro-config') as {
        getDefaultConfig: (projectRoot: string) => MetroConfig
    }

    return getDefaultConfig(PROJECT_ROOT)
}

const getExpoConfig = () => getExpoDefaultConfig(PROJECT_ROOT) as unknown as MetroConfig

const withoutCli = (config: MetroConfig) => config

const createConfig = (
    baseConfig: MetroConfig,
    applyCli: (config: MetroConfig) => MetroConfig,
    optimizeClasslessComponents: ExperimentalMetroOptions['optimizeClasslessComponents'],
) => applyCli(withUniwindConfig(baseConfig, {
    cssEntryFile: './global.css',
    experimental: { optimizeClasslessComponents },
}))

// Mirrors how Metro's Transformer derives the worker config and its global cache key.
const getConfigCacheKey = (config: MetroConfig) => {
    const {
        getTransformOptions: _getTransformOptions,
        transformVariants: _transformVariants,
        unstable_workerThreads: _workerThreads,
        ...transformerConfig
    } = config.transformer as Record<string, unknown>

    return getTransformCacheKey(
        {
            cacheVersion: '1',
            projectRoot: PROJECT_ROOT,
            transformerConfig: {
                transformerPath: config.transformerPath!,
                transformerConfig,
            },
        } as Parameters<typeof getTransformCacheKey>[0],
    )
}

// Serves different contents for one file, as after a Uniwind upgrade, without touching the disk.
const withChangedContents = <T>(filePath: string, run: () => T) => {
    const readFileSync = fs.readFileSync
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(
        ((file: fs.PathOrFileDescriptor, ...args: Array<unknown>) =>
            file === filePath
                ? Buffer.from('// changed')
                : Reflect.apply(readFileSync, fs, [file, ...args])) as typeof fs.readFileSync,
    )

    try {
        return run()
    } finally {
        spy.mockRestore()
    }
}

const isView = (component: ClasslessComponentName) => component === 'View'

describe.each([
    ['Metro', getBareDefaultConfig, withoutCli],
    ['Expo config', getExpoConfig, withoutCli],
    ['Expo CLI', getExpoConfig, withMetroSupervisingTransformWorker],
])('%s transform cache key', (name, getBaseConfig, applyCli) => {
    const getCacheKey = (
        baseConfig: MetroConfig,
        optimizeClasslessComponents: ExperimentalMetroOptions['optimizeClasslessComponents'],
    ) => getConfigCacheKey(createConfig(baseConfig, applyCli, optimizeClasslessComponents))

    test('models the transformer Metro loads', () => {
        const config = createConfig(getBaseConfig(), applyCli, isView)

        expect(path.basename(config.transformerPath!)).toBe(
            name === 'Expo CLI' ? 'supervising-transform-worker.js' : 'transformer.ts',
        )
    })

    test('changes when the enabled components change', () => {
        const baseConfig = getBaseConfig()
        const viewOnly = getCacheKey(baseConfig, isView)

        expect(getCacheKey(baseConfig, component => isView(component) || component === 'Image')).not.toBe(viewOnly)
        expect(getCacheKey(baseConfig, true)).not.toBe(viewOnly)
        expect(getCacheKey(baseConfig, false)).not.toBe(viewOnly)
        expect(getCacheKey(baseConfig, isView)).toBe(viewOnly)
    })

    test('depends on the resolved list rather than how the option is written', () => {
        const baseConfig = getBaseConfig()

        expect(getCacheKey(baseConfig, (_component, { isDefault }) => isDefault)).toBe(getCacheKey(baseConfig, true))
        expect(getCacheKey(baseConfig, () => false)).toBe(getCacheKey(baseConfig, false))
        expect(getCacheKey(baseConfig, undefined)).toBe(getCacheKey(baseConfig, false))
    })

    test.each(Object.entries(UNIWIND_TRANSFORMER_FILES))('changes when the Uniwind %s changes', (_, filePath) => {
        const baseConfig = getBaseConfig()
        const key = getCacheKey(baseConfig, isView)

        expect(withChangedContents(filePath, () => getCacheKey(baseConfig, isView))).not.toBe(key)
        expect(getCacheKey(baseConfig, isView)).toBe(key)
    })

    test('keeps the upstream worker cache key', () => {
        const baseConfig = getBaseConfig()
        const changedConfig = {
            ...baseConfig,
            transformer: {
                ...baseConfig.transformer,
                minifierConfig: { mangle: false },
            },
        } as MetroConfig

        expect(getCacheKey(changedConfig, isView)).not.toBe(getCacheKey(baseConfig, isView))
    })
})
