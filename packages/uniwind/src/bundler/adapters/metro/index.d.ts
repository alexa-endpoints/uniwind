import type { MetroConfig } from 'metro-config'

type Polyfills = {
    rem?: number
}

type UniwindFederationConfig =
    | {
        role: 'host'
        sharedClassNames?: ReadonlyArray<string>
        /**
         * Remote stylesheets compiled into the host bundle and merged at runtime under their remote id.
         */
        inlinedRemotes?: ReadonlyArray<{
            id: string
            cssEntryFile: string
            sharedClassNames?: ReadonlyArray<string>
        }>
    }
    | {
        role: 'remote'
        id: string
        sharedClassNames?: ReadonlyArray<string>
    }

type ExperimentalOptions = {
    federation?: UniwindFederationConfig
    /**
     * Rewrites statically classless React Native elements to raw components. The deprecated
     * `SafeAreaView` always keeps its wrapper, and so do `Text` and `TextInput` while
     * `defaultFontFamily` is on, because only the wrapper applies the default font.
     * @default false
     */
    optimizeClasslessComponents?: boolean
}

type UniwindConfig = {
    cssEntryFile: string
    extraThemes?: Array<string>
    dtsFile?: string
    /**
     * Starts root `Text` and `TextInput` from the theme's `--default-font-family`, which Tailwind
     * derives from `--font-sans`, on native and web. React Native resolves a single family name,
     * so on native a fallback list keeps the platform default. A federated remote should match its
     * host: the host's setting applies at runtime.
     * @default false
     */
    defaultFontFamily?: boolean
    polyfills?: Polyfills
    debug?: boolean
    isTV?: boolean
    experimental?: ExperimentalOptions
}

export declare function withUniwindConfig(config: MetroConfig, options: UniwindConfig): MetroConfig
