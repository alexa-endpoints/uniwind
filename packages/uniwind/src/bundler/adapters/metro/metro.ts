import { UniwindBundlerConfig } from '@/bundler/config'
import type { UniwindMetroConfig } from '@/bundler/types'
import { Platform } from '@/common/consts'
import type { MetroConfig } from 'metro-config'
import type * as MetroResolverModule from 'metro-resolver'
import type { CustomResolver } from 'metro-resolver'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getRawComponentsPath, resolveClasslessComponents } from './classless-components'
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

// Expo CLI moves a custom `transformerPath` behind its supervising worker, whose cache key hashes the
// transformer config but neither of Uniwind's transformer files, so the config carries their hash.
// Built transformers name their content-hashed shared chunks, so this also covers those chunks.
const getTransformerFingerprint = () => {
    const hash = createHash('sha1')

    for (const filePath of [require.resolve('./transformer.cjs'), require.resolve('./babel-transformer.cjs')]) {
        hash.update(readFileSync(filePath))
    }

    return hash.digest('hex')
}

// Metro serializes `config.transformer` into its workers and cannot carry a predicate, so the option
// is resolved once here, before Metro is patched, into the list of enabled components. Workers get the
// resolved `defaultFontFamily` too, so the cache key doesn't tell an unset option from `false`.
const toWorkerConfig = (bundlerConfig: UniwindBundlerConfig, isExpoProject: boolean): UniwindMetroConfig => {
    const metroConfig = bundlerConfig.toMetroConfig(isExpoProject)
    const { optimizeClasslessComponents, ...experimental } = metroConfig.experimental ?? {}

    return {
        ...metroConfig,
        defaultFontFamily: bundlerConfig.defaultFontFamily,
        experimental,
        optimizedClasslessComponents: resolveClasslessComponents(optimizeClasslessComponents, bundlerConfig),
        transformerFingerprint: getTransformerFingerprint(),
    }
}

export const withUniwindConfig = <T extends MetroConfig>(
    config: T,
    uniwindConfig: UniwindMetroConfig,
): T => {
    const bundlerConfig = UniwindBundlerConfig.fromMetroConfig(uniwindConfig)
    const uniwindMetroConfig = toWorkerConfig(bundlerConfig, isExpoMetroConfig(config))
    const pinnedUniwindOrigin = join(config.projectRoot ?? process.cwd(), 'package.json')
    const { resolve: metroResolve } = createRequire(require.resolve('metro/package.json'))('metro-resolver') as typeof MetroResolverModule
    const activeUniwindRoot = dirname(getRealPath(require.resolve('uniwind/package.json')))
    const rawComponentsPath = uniwindMetroConfig.optimizedClasslessComponents?.length
        ? getRawComponentsPath()
        : undefined

    patchMetroGraphToIncludeCssInLazyGraphs(resolve(process.cwd(), uniwindConfig.cssEntryFile))
    patchMetroGraphToSupportUncachedModules()

    return {
        ...config,
        cacheStores: [cacheStore],
        transformerPath: require.resolve('./transformer.cjs'),
        transformer: {
            ...config.transformer,
            uniwind: uniwindMetroConfig,
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
