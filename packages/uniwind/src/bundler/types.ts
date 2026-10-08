import type { ClasslessComponentName } from '@/bundler/adapters/metro/constants'

type UniwindFederationSharedConfig = {
    sharedClassNames?: ReadonlyArray<string>
}

type UniwindInlinedRemoteConfig = UniwindFederationSharedConfig & {
    id: string
    cssEntryFile: string
}

export type UniwindFederationConfig =
    | UniwindFederationSharedConfig & {
        role: 'host'
        inlinedRemotes?: ReadonlyArray<UniwindInlinedRemoteConfig>
    }
    | UniwindFederationSharedConfig & {
        role: 'remote'
        id: string
    }

export type UniwindConfig = {
    cssEntryFile: string
    extraThemes?: Array<string>
    dtsFile?: string
    // Root Text and TextInput start from the theme's --default-font-family. Off by default.
    defaultFontFamily?: boolean
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

export type UniwindExperimentalConfig = {
    federation?: UniwindFederationConfig
    optimizeClasslessComponents?: boolean | ClasslessComponentPredicate
}

export type UniwindMetroConfig = UniwindConfig & {
    experimental?: UniwindExperimentalConfig
    polyfills?: Polyfills
    debug?: boolean
    isExpoProject?: boolean
    isTV?: boolean
    // Set by `withUniwindConfig` for the transform workers. The enabled components are resolved from
    // `experimental.optimizeClasslessComponents`, because Metro serializes the transformer config into
    // its workers and cannot carry a predicate.
    optimizedClasslessComponents?: Array<ClasslessComponentName>
    // Hash of Uniwind's Metro transformer files, so every upstream transform cache key covers them.
    transformerFingerprint?: string
}
