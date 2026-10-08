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
}

export type Polyfills = {
    rem?: number
}

export type UniwindExperimentalConfig = {
    federation?: UniwindFederationConfig
    optimizeClasslessComponents?: boolean
}

export type UniwindMetroConfig = UniwindConfig & {
    cssArtifactFile?: string
    experimental?: UniwindExperimentalConfig
    polyfills?: Polyfills
    debug?: boolean
    isExpoProject?: boolean
    isTV?: boolean
}
