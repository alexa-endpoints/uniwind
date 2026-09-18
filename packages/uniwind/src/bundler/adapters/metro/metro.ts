import { UniwindBundlerConfig } from '@/bundler/config'
import type { UniwindMetroConfig } from '@/bundler/types'
import { Platform } from '@/common/consts'
import type { MetroConfig } from 'metro-config'
import type * as MetroResolverModule from 'metro-resolver'
import type { CustomResolver } from 'metro-resolver'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { RAW_COMPONENTS_MODULE } from './constants'
import { cacheStore, patchMetroGraphToIncludeCssInLazyGraphs, patchMetroGraphToSupportUncachedModules } from './patches'
import { isInternalOrigin, nativeResolver, webResolver } from './resolvers'

const isUniwindRequest = (moduleName: string) => moduleName === 'uniwind' || moduleName.startsWith('uniwind/')

const getRealPath = (filePath: string) => {
    try {
        return realpathSync(filePath)
    } catch {
        return filePath
    }
}

const isPathWithin = (filePath: string, directory: string) => {
    const relativePath = relative(directory, filePath)

    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

const getOwningUniwindRoot = (filePath: string) => {
    const realFilePath = getRealPath(filePath)

    try {
        const packageJsonPath = require.resolve('uniwind/package.json', {
            paths: [dirname(realFilePath)],
        })
        const packageRoot = dirname(getRealPath(packageJsonPath))

        return isPathWithin(realFilePath, packageRoot) ? packageRoot : undefined
    } catch {
        return undefined
    }
}

const isExpoMetroConfig = (config: MetroConfig) => {
    const transformerPath = config.transformerPath
    const hasExpoTransformerField = Object.keys(config.transformer ?? {}).some(
        key => key.startsWith('expo') || key.startsWith('_expo'),
    )

    return Boolean(
        transformerPath?.includes('@expo/metro-config')
            || hasExpoTransformerField,
    )
}

export const withUniwindConfig = <T extends MetroConfig>(
    config: T,
    uniwindConfig: UniwindMetroConfig,
): T => {
    const bundlerConfig = UniwindBundlerConfig.fromMetroConfig(uniwindConfig)
    const pinnedUniwindOrigin = join(config.projectRoot ?? process.cwd(), 'package.json')
    const { resolve: metroResolve } = createRequire(require.resolve('metro/package.json'))('metro-resolver') as typeof MetroResolverModule
    const activeUniwindRoot = dirname(getRealPath(require.resolve('uniwind/package.json')))
    const optimizeClasslessComponents = uniwindConfig.experimental?.optimizeClasslessComponents === true
    const rawComponentsPath = optimizeClasslessComponents
        ? join(
            activeUniwindRoot,
            'src/bundler/adapters/metro/raw-components.ts',
        )
        : undefined

    patchMetroGraphToIncludeCssInLazyGraphs(resolve(process.cwd(), uniwindConfig.cssEntryFile))
    patchMetroGraphToSupportUncachedModules()

    return {
        ...config,
        cacheStores: [cacheStore],
        transformerPath: require.resolve('./transformer.cjs'),
        transformer: {
            ...config.transformer,
            uniwind: bundlerConfig.toMetroConfig(isExpoMetroConfig(config)),
        },
        resolver: {
            ...config.resolver,
            sourceExts: [
                ...config.resolver?.sourceExts ?? [],
                'css',
            ],
            assetExts: config.resolver?.assetExts?.filter(
                ext => ext !== 'css',
            ),
            resolveRequest: (context, moduleName, platform) => {
                const baseResolver = config.resolver?.resolveRequest ?? context.resolveRequest
                const resolver: CustomResolver = (nextContext, nextModuleName, nextPlatform) => {
                    if (nextModuleName === RAW_COMPONENTS_MODULE && rawComponentsPath) {
                        return {
                            type: 'sourceFile',
                            filePath: rawComponentsPath,
                        }
                    }

                    if (isUniwindRequest(nextModuleName)) {
                        const pinnedContext = {
                            ...nextContext,
                            originModulePath: pinnedUniwindOrigin,
                        }

                        try {
                            const resolution = baseResolver(nextContext, nextModuleName, nextPlatform)

                            if (resolution.type !== 'sourceFile') {
                                return resolution
                            }

                            const owningUniwindRoot = getOwningUniwindRoot(resolution.filePath)
                            if (!owningUniwindRoot || owningUniwindRoot === activeUniwindRoot) {
                                return resolution
                            }
                        } catch {
                            // Fall back to the active project installation below.
                        }

                        const resolution = baseResolver(pinnedContext, nextModuleName, nextPlatform)

                        // fix for Expo's autolinking resolver which resolves by package name and lands on another hoisted
                        // uniwind copy when this one is installed under an alias (e.g. pnpm + npm:uniwind-pro)
                        // instead use default metro-resolver resolveRequest
                        if (resolution.type === 'sourceFile' && !isInternalOrigin(resolution.filePath)) {
                            return metroResolve({ ...pinnedContext, resolveRequest: metroResolve }, nextModuleName, nextPlatform)
                        }

                        return resolution
                    }

                    return baseResolver(nextContext, nextModuleName, nextPlatform)
                }
                const platformResolver = platform === Platform.Web ? webResolver : nativeResolver
                const resolved = platformResolver({
                    context,
                    moduleName,
                    platform,
                    resolver,
                })

                return resolved
            },
        },
    }
}
