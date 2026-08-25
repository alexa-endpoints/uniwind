import type { MetroConfig } from 'metro-config'
import { withUniwindConfig } from 'uniwind/metro'

const metroConfig = {} as MetroConfig

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        federation: {
            role: 'host',
            sharedClassNames: ['bg-red-500'],
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
