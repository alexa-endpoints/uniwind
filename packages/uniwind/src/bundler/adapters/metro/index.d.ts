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
     * Rewrites statically classless React Native elements to raw components.
     * @default false
     */
    optimizeClasslessComponents?: boolean
}

type UniwindConfig = {
    cssEntryFile: string
    extraThemes?: Array<string>
    dtsFile?: string
    polyfills?: Polyfills
    debug?: boolean
    isTV?: boolean
    experimental?: ExperimentalOptions
}

export declare function withUniwindConfig(config: MetroConfig, options: UniwindConfig): MetroConfig
