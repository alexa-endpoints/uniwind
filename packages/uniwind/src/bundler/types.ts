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

export type UniwindExperimentalConfig = {
    federation?: UniwindFederationConfig
    optimizeClasslessComponents?: boolean
}

export type UniwindMetroConfig = UniwindConfig & {
    experimental?: UniwindExperimentalConfig
    polyfills?: Polyfills
    debug?: boolean
    isExpoProject?: boolean
    isTV?: boolean
}
