import type {
    BabelTransformer,
    BabelTransformerArgs,
} from 'metro-babel-transformer'
import { componentTransform } from './component-transform'
import {
    TRANSFORM_COMPONENTS,
    UPSTREAM_BABEL_TRANSFORMER,
} from './constants'

type BabelTransformerModule = BabelTransformer & {
    default?: BabelTransformer
}

const transformerCache = new Map<string, BabelTransformer>()

const getTransformer = (transformerPath: string) => {
    const cached = transformerCache.get(transformerPath)
    if (cached) {
        return cached
    }

    const module = require(transformerPath) as BabelTransformerModule
    const transformer = typeof module.transform === 'function'
        ? module
        : module.default

    if (!transformer || typeof transformer.transform !== 'function') {
        throw new Error(`Uniwind: Invalid upstream Babel transformer at ${transformerPath}`)
    }

    transformerCache.set(transformerPath, transformer)

    return transformer
}

// Babel caches plugin instances by options identity, so reuse one options object per component list
// instead of rebuilding the component transform for every file.
const componentTransformOptionsCache = new Map<string, { components: ReadonlyArray<string> }>()

const getComponentTransformOptions = (components: ReadonlyArray<string>) => {
    const key = components.join(',')
    let options = componentTransformOptionsCache.get(key)

    if (options === undefined) {
        options = { components: [...components] }
        componentTransformOptionsCache.set(key, options)
    }

    return options
}

export const transform = (args: BabelTransformerArgs) => {
    const customOptions = args.options.customTransformOptions ?? {}
    const upstreamPath = customOptions[UPSTREAM_BABEL_TRANSFORMER]

    if (typeof upstreamPath !== 'string') {
        throw new Error('Uniwind: Missing upstream Babel transformer path')
    }

    const {
        [TRANSFORM_COMPONENTS]: components,
        [UPSTREAM_BABEL_TRANSFORMER]: _upstreamPath,
        ...upstreamCustomOptions
    } = customOptions
    const transformer = getTransformer(upstreamPath)

    return transformer.transform({
        ...args,
        options: {
            ...args.options,
            customTransformOptions: upstreamCustomOptions,
        },
        plugins: Array.isArray(components) && components.length > 0
            ? [...args.plugins ?? [], [componentTransform, getComponentTransformOptions(components)]]
            : args.plugins,
    })
}
