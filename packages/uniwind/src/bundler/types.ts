import type { ClasslessComponentName } from '@/bundler/adapters/metro/constants'

export type UniwindConfig = {
    cssEntryFile: string
    extraThemes?: Array<string>
    dtsFile?: string
}

export type Polyfills = {
    rem?: number
}

export type ClasslessComponentContext = {
    // Whether `optimizeClasslessComponents: true` enables this component, so a predicate can adjust the
    // default set instead of restating it.
    isDefault: boolean
}

export type ClasslessComponentPredicate = (
    component: ClasslessComponentName,
    context: ClasslessComponentContext,
) => boolean

export type ExperimentalMetroOptions = {
    optimizeClasslessComponents?: boolean | ClasslessComponentPredicate
}

export type UniwindMetroConfig = UniwindConfig & {
    polyfills?: Polyfills
    debug?: boolean
    isExpoProject?: boolean
    isTV?: boolean
    experimental?: ExperimentalMetroOptions
    // Set by `withUniwindConfig` for the transform workers. The enabled components are resolved from
    // `experimental.optimizeClasslessComponents`, because Metro serializes the transformer config into
    // its workers and cannot carry a predicate.
    optimizedClasslessComponents?: Array<ClasslessComponentName>
    // Hash of Uniwind's Metro transformer files, so every upstream transform cache key covers them.
    transformerFingerprint?: string
}
