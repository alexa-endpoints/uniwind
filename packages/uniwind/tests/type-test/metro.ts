import type { MetroConfig } from 'metro-config'
import { withUniwindConfig } from 'uniwind/metro'

const metroConfig = {} as MetroConfig

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        federation: {
            role: 'host',
            sharedClassNames: ['bg-red-500'],
            inlinedRemotes: [
                {
                    id: 'remote-a',
                    cssEntryFile: '../remote-a/global.css',
                    sharedClassNames: ['bg-red-500'],
                },
            ],
        },
    },
})

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        federation: {
            role: 'remote',
            id: 'remote-a',
            sharedClassNames: ['bg-red-500'],
        },
    },
})

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    // @ts-expect-error Federation must be configured under experimental.
    federation: {
        role: 'host',
    },
})

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    defaultFontFamily: true,
    experimental: {
        optimizeClasslessComponents: true,
    },
})

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    // @ts-expect-error The family itself comes from the theme's --default-font-family.
    defaultFontFamily: 'Inter',
})
