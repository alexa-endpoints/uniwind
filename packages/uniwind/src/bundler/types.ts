type UniwindFederationSharedConfig = {
    sharedClassNames?: ReadonlyArray<string>
}

export type UniwindFederationConfig =
    | UniwindFederationSharedConfig & {
        role: 'host'
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
}

export type UniwindMetroConfig = UniwindConfig & {
    experimental?: UniwindExperimentalConfig
    polyfills?: Polyfills
    debug?: boolean
    isExpoProject?: boolean
    isTV?: boolean
}
