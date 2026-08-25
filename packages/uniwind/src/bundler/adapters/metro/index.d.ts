import type { MetroConfig } from 'metro-config'

type Polyfills = {
    rem?: number
}

type UniwindFederationConfig =
    | {
        role: 'host'
        sharedClassNames?: ReadonlyArray<string>
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
