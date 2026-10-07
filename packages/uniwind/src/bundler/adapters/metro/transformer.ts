import { writeFileAtomicSync } from '@/bundler/artifacts/writeFileAtomic'
import { UniwindBundlerConfig } from '@/bundler/config'
import { compileCSS } from '@/bundler/css-compiler'
import type { UniwindMetroConfig } from '@/bundler/types'
import { Platform } from '@/common/consts'
import type * as ExpoMetroConfig from '@expo/metro-config'
import fs from 'fs'
import type * as MetroTransformWorker from 'metro-transform-worker'
import type { JsTransformerConfig, JsTransformOptions } from 'metro-transform-worker'
import { createHash } from 'node:crypto'
import path from 'path'
import {
    TRANSFORM_COMPONENTS,
    UPSTREAM_BABEL_TRANSFORMER,
} from './constants'

export const cssArtifactPath = path.resolve(__dirname, '../../uniwind.css')

// Projects with different themes, such as a federation host and its remotes, can build at the
// same time from one installed package. Each compiles against its own artifact rather than the
// shared stylesheet another build may be rewriting.
export const projectArtifactPath = (cssPath: string) =>
    path.resolve(
        __dirname,
        '../../.artifacts',
        `${createHash('sha256').update(path.resolve(cssPath)).digest('hex').slice(0, 16)}.css`,
    )

// In development, a native CSS entry requires the stylesheets its compile imported, so that they join
// Metro's graph and editing one, even to change a single token, re-runs the entry's uncached transform.
// Installed packages are left out, and so is Uniwind's package directory, which holds the stylesheets
// the transform writes: the project artifact `@import "uniwind"` resolves to and the shared copy.
// Requiring them would rebuild the entry after its own writes, and the Metro servers of other projects
// sharing the install (a federation host and its remotes) after each other's.
const isWatchedStylesheet = (stylesheet: string) =>
    stylesheet.endsWith('.css')
    && !stylesheet.includes(`${path.sep}node_modules${path.sep}`)
    && !stylesheet.startsWith(`${path.dirname(cssArtifactPath)}${path.sep}`)

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

export const shouldTransformClasslessComponents = (
    config: Pick<UniwindMetroConfig, 'experimental'>,
    data: Buffer,
    options: Pick<JsTransformOptions, 'platform' | 'type'>,
) => config.experimental?.optimizeClasslessComponents === true
    && options.type !== 'asset'
    && options.platform !== Platform.Web
    && data.includes('react-native')

const findInlinedRemote = (
    config: UniwindMetroConfig,
    projectRoot: string,
    filePath: string,
) => {
    const federation = config.experimental?.federation

    if (federation?.role !== 'host') {
        return undefined
    }

    const modulePath = path.join(projectRoot, filePath)

    return federation.inlinedRemotes?.find(
        remote => path.resolve(process.cwd(), remote.cssEntryFile) === modulePath,
    )
}

export const transform = async (
    config: JsTransformerConfig & {
        uniwind: UniwindMetroConfig
    },
    projectRoot: string,
    filePath: string,
    data: Buffer,
    options: JsTransformOptions,
) => {
    const worker = getTransformWorker(config.uniwind.isExpoProject)
    const inlinedRemote = options.type !== 'asset'
        ? findInlinedRemote(config.uniwind, projectRoot, filePath)
        : undefined
    const isCss = inlinedRemote !== undefined
        || options.type !== 'asset'
            && path.join(process.cwd(), config.uniwind.cssEntryFile) === path.join(projectRoot, filePath)

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
                    [TRANSFORM_COMPONENTS]: true,
                    [UPSTREAM_BABEL_TRANSFORMER]: config.babelTransformerPath,
                },
            },
        )
    }

    const baseBundlerConfig = UniwindBundlerConfig.fromMetroConfig(config.uniwind, options.platform)

    // For an inlined remote, artifact generation stays on the host entry so
    // concurrent workers compiling either stylesheet write identical bytes.
    const artifactPath = projectArtifactPath(baseBundlerConfig.cssPath)

    fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
    await baseBundlerConfig.generateArtifacts(artifactPath)
    // Tools that import the package stylesheet directly still see a generated one.
    writeFileAtomicSync(cssArtifactPath, fs.readFileSync(artifactPath, 'utf-8'))

    const bundlerConfig = inlinedRemote === undefined
        ? baseBundlerConfig
        : UniwindBundlerConfig.fromMetroConfig(
            {
                ...config.uniwind,
                cssEntryFile: path.relative(
                    process.cwd(),
                    path.resolve(process.cwd(), inlinedRemote.cssEntryFile),
                ),
                experimental: {
                    ...config.uniwind.experimental,
                    federation: {
                        role: 'remote',
                        id: inlinedRemote.id,
                        sharedClassNames: inlinedRemote.sharedClassNames,
                    },
                },
            },
            options.platform,
        )
    const isWeb = bundlerConfig.platform === Platform.Web
    const importedStylesheets = new Set<string>()
    const virtualCode = await compileCSS(bundlerConfig, {
        artifactPath,
        onDependency: dependency => {
            if (!isWeb && options.dev && isWatchedStylesheet(dependency)) {
                importedStylesheets.add(dependency)
            }
        },
    })
    const importedStylesheetRequires = Array.from(importedStylesheets).sort().map(stylesheet => {
        const relativePath = path.relative(path.dirname(bundlerConfig.cssPath), stylesheet).split(path.sep).join('/')

        return `require(${JSON.stringify(relativePath.startsWith('../') ? relativePath : `./${relativePath}`)});`
    })
    const federation = bundlerConfig.federation
    const nativeStylesFingerprint = isWeb || federation?.role === 'remote'
        ? undefined
        : createHash('sha256')
            .update(virtualCode)
            .update('\0')
            .update(bundlerConfig.stringifiedThemes)
            .digest('hex')

    data = Buffer.from(
        isWeb
            ? virtualCode
            : federation?.role === 'remote'
            ? [
                ...importedStylesheetRequires,
                `const { Uniwind } = require('uniwind');`,
                `const dispose = Uniwind.__mergeStyles(${JSON.stringify(federation.id)}, rt => ${virtualCode}, ${bundlerConfig.stringifiedThemes});`,
                `if (module.hot) { module.hot.dispose(dispose); }`,
            ].join('')
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
