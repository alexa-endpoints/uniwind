const { getDefaultConfig } = require('expo/metro-config')
const { withModuleFederation } = require('@module-federation/metro')
const { withUniwindConfig } = require('uniwind/metro')

const federationName = 'uniwind_repro_host'

const shared = {
    react: singleton('19.2.3'),
    'react-native': singleton('0.86.3'),
    uniwind: singleton('1.12.2-mf.0'),
    'uniwind/components': singleton('1.12.2-mf.0'),
    'uniwind/components/FlatList': singleton('1.12.2-mf.0'),
}

function singleton(version) {
    return {
        eager: true,
        singleton: true,
        version,
        requiredVersion: version,
    }
}

function withRuntimeRequireBridge(config) {
    const getRunModuleStatement = config.serializer.getRunModuleStatement
        ?? (moduleId => `__r(${JSON.stringify(moduleId)});`)

    return {
        ...config,
        serializer: {
            ...config.serializer,
            getRunModuleStatement: (moduleId, globalPrefix) =>
                [
                    `globalThis[${JSON.stringify(`${federationName}__r`)}] ??= globalThis.__r;`,
                    getRunModuleStatement(moduleId, globalPrefix),
                ].join('\n'),
        },
    }
}

const config = withRuntimeRequireBridge(withModuleFederation(getDefaultConfig(__dirname), {
    name: federationName,
    remotes: {},
    shared,
}))

module.exports = withUniwindConfig(config, {
    cssEntryFile: './src/global.css',
    experimental: {
        federation: { role: 'host' },
        optimizeClasslessComponents: true,
    },
})
