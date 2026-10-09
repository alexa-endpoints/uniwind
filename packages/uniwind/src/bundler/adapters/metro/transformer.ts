import { UniwindBundlerConfig } from '@/bundler/config'
import { compileCSS } from '@/bundler/css-compiler'
import type { UniwindMetroConfig } from '@/bundler/types'
import { Platform } from '@/common/consts'
import type * as ExpoMetroConfig from '@expo/metro-config'
import type * as MetroTransformWorker from 'metro-transform-worker'
import type { JsTransformerConfig, JsTransformOptions } from 'metro-transform-worker'
import { createHash } from 'node:crypto'
import path from 'path'
import { getRawComponentsPath, getRawComponentsSource } from './classless-components'
import {
    TRANSFORM_COMPONENTS,
    UPSTREAM_BABEL_TRANSFORMER,
} from './constants'

type UniwindTransformerConfig = JsTransformerConfig & {
    uniwind: UniwindMetroConfig
}

const cssArtifactPath = path.resolve(__dirname, '../../uniwind.css')

// Cache workers separately for Expo (`true`) and plain Metro (`false`) configs.
const workerCache = new Map<boolean, typeof MetroTransformWorker>()

const getTransformWorker = (isExpoProject?: boolean): typeof MetroTransformWorker => {
    const cacheKey = Boolean(isExpoProject)
    const cachedWorker = workerCache.get(cacheKey)

    if (cachedWorker) {
        return cachedWorker
    }

    const resolvedWorker: typeof MetroTransformWorker = cacheKey
        ? (() => {
            try {
                const { unstable_transformerPath } = require('@expo/metro-config') as typeof ExpoMetroConfig

                return require(unstable_transformerPath)
            } catch {
                return require('@expo/metro-config/build/transform-worker/transform-worker.js')
            }
        })()
        : require('metro-transform-worker')

    workerCache.set(cacheKey, resolvedWorker)

    return resolvedWorker
}

// Metro asks only the module at `transformerPath` for a cache key, so delegate to the upstream worker,
// whose key hashes the whole transformer config: `uniwind.optimizedClasslessComponents` and
// `uniwind.transformerFingerprint` included. Under Expo CLI's supervising worker, Expo's own
// `getCacheKey` runs instead and hashes the same config.
export const getCacheKey = (
    config: UniwindTransformerConfig,
    options?: Readonly<{ projectRoot: string }>,
) => getTransformWorker(config.uniwind.isExpoProject).getCacheKey?.(config, options) ?? ''

// A file can only reference an enabled component by its name, so files that never mention one skip the
// Babel dispatch. Substring matches only cost a dispatch; the Babel transform still matches exact names.
// The list comes first: the default config enables no component, and then no file is read at all.
export const shouldTransformClasslessComponents = (
    config: Pick<UniwindMetroConfig, 'optimizedClasslessComponents'>,
    data: Buffer,
    options: Pick<JsTransformOptions, 'platform' | 'type'>,
) => (config.optimizedClasslessComponents?.length ?? 0) > 0
    && options.type !== 'asset'
    && options.platform !== Platform.Web
    && data.includes('react-native')
    && config.optimizedClasslessComponents?.some(component => data.includes(component)) === true

export const transform = async (
    config: UniwindTransformerConfig,
    projectRoot: string,
    filePath: string,
    data: Buffer,
    options: JsTransformOptions,
) => {
    const worker = getTransformWorker(config.uniwind.isExpoProject)
    const classlessComponents = config.uniwind.optimizedClasslessComponents ?? []

    if (classlessComponents.length > 0 && path.resolve(projectRoot, filePath) === getRawComponentsPath()) {
        return worker.transform(
            config,
            projectRoot,
            filePath,
            Buffer.from(getRawComponentsSource(classlessComponents), 'utf-8'),
            options,
        )
    }

    const isCss = options.type !== 'asset' && path.join(process.cwd(), config.uniwind.cssEntryFile) === path.join(projectRoot, filePath)

    if (filePath.endsWith('/components/web/metro-injected.js')) {
        const bundlerConfig = UniwindBundlerConfig.fromMetroConfig(config.uniwind, Platform.Web)

        data = Buffer.from(
            [
                `import { Uniwind } from 'uniwind';`,
                `Uniwind.__reinit(() => ({}), ${bundlerConfig.stringifiedThemes});`,
            ].join(''),
            'utf-8',
        )
    }

    if (!isCss) {
        if (!config.uniwind.isExpoProject && options.platform !== Platform.Web && options.type !== 'asset' && filePath.endsWith('.css')) {
            // Plain Metro parses CSS as JavaScript; these modules only register watched files.
            return worker.transform(config, projectRoot, `${filePath}.js`, Buffer.from(''), options)
        }

        // After the CSS guard, so a stylesheet whose text passes the gate's substring checks still
        // becomes an empty module instead of reaching Babel.
        const shouldTransformComponents = shouldTransformClasslessComponents(
            config.uniwind,
            data,
            options,
        )

        if (!shouldTransformComponents) {
            return worker.transform(config, projectRoot, filePath, data, options)
        }

        return worker.transform(
            {
                ...config,
                babelTransformerPath: require.resolve('./babel-transformer.cjs'),
            },
            projectRoot,
            filePath,
            data,
            {
                ...options,
                customTransformOptions: {
                    ...options.customTransformOptions,
                    [TRANSFORM_COMPONENTS]: classlessComponents,
                    [UPSTREAM_BABEL_TRANSFORMER]: config.babelTransformerPath,
                },
            },
        )
    }

    const bundlerConfig = UniwindBundlerConfig.fromMetroConfig(config.uniwind, options.platform)
    await bundlerConfig.generateArtifacts(cssArtifactPath)
    const isWeb = bundlerConfig.platform === Platform.Web
    const importedStylesheets = new Set<string>()
    const virtualCode = await compileCSS(bundlerConfig, dependency => {
        if (!isWeb && options.dev && dependency.endsWith('.css') && !dependency.includes(`${path.sep}node_modules${path.sep}`)) {
            importedStylesheets.add(dependency)
        }
    })
    const importedStylesheetRequires = Array.from(importedStylesheets).sort().map(stylesheet => {
        const relativePath = path.relative(path.dirname(bundlerConfig.cssPath), stylesheet).split(path.sep).join('/')

        return `require(${JSON.stringify(relativePath.startsWith('../') ? relativePath : `./${relativePath}`)});`
    })
    const nativeStylesFingerprint = isWeb
        ? undefined
        : createHash('sha256')
            .update(virtualCode)
            .update('\0')
            .update(bundlerConfig.stringifiedThemes)
            .digest('hex')

    data = Buffer.from(
        isWeb
            ? virtualCode
            : [
                ...importedStylesheetRequires,
                `const { Uniwind } = require('uniwind');`,
                `Uniwind.__reinit(rt => ${virtualCode}, ${bundlerConfig.stringifiedThemes}, '${nativeStylesFingerprint}');`,
            ].join(''),
        'utf-8',
    )

    // Expo reconciles optimized modules by graph path, where this module is still a .css file.
    // Transform native CSS as regular JS so its require is rewritten and the module is wrapped.
    const transformOptions = config.uniwind.isExpoProject && !isWeb
        ? {
            ...options,
            customTransformOptions: {
                ...options.customTransformOptions,
                optimize: 'false',
            },
        }
        : options

    const transform: any = await worker.transform(
        config,
        projectRoot,
        `${filePath}${isWeb ? '' : '.js'}`,
        data,
        transformOptions,
    )

    transform.output[0].data.css ??= {}
    transform.output[0].data.css.skipCache = true

    if (!isWeb) {
        transform.output[0].data.css.code = ''
    }

    return transform
}
