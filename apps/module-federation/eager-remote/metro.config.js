const { getDefaultConfig } = require('expo/metro-config')
const { withModuleFederation } = require('@module-federation/metro')
const { withUniwindConfig } = require('uniwind/metro')

const federationName = 'uniwind_repro_remote'

const shared = {
    react: externalSingleton('19.2.3'),
    'react-native': externalSingleton('0.86.3'),
    uniwind: externalSingleton('1.12.2-mf.0'),
    'uniwind/components': externalSingleton('1.12.2-mf.0'),
    'uniwind/components/FlatList': externalSingleton('1.12.2-mf.0'),
}

function externalSingleton(version) {
    return {
        import: false,
        singleton: true,
        version,
        requiredVersion: version,
    }
}

function withCrossOriginRequests(config) {
    const enhanceMiddleware = config.server.enhanceMiddleware

    return {
        ...config,
        server: {
            ...config.server,
            enhanceMiddleware: (middleware, metroServer) => {
                const enhancedMiddleware = enhanceMiddleware?.(middleware, metroServer) ?? middleware

                return (request, response, next) => {
                    response.setHeader('Access-Control-Allow-Origin', '*')
                    response.setHeader('Access-Control-Allow-Headers', '*')

                    if (request.method === 'OPTIONS') {
                        response.statusCode = 204
                        response.end()
                        return
                    }

                    return enhancedMiddleware(request, response, next)
                }
            },
        },
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
                    `globalThis[${JSON.stringify(`${federationName}__loadBundleAsync`)}] ??= globalThis.__loadBundleAsync;`,
                    getRunModuleStatement(moduleId, globalPrefix),
                ].join('\n'),
        },
    }
}

const config = withRuntimeRequireBridge(withCrossOriginRequests(withModuleFederation(getDefaultConfig(__dirname), {
    name: federationName,
    filename: 'remoteEntry.bundle',
    exposes: {
        './App': './src/App.tsx',
    },
    runtimePlugins: [
        require.resolve('./src/federation-loader-plugin.js'),
    ],
    shared,
})))

module.exports = withUniwindConfig(config, {
    cssEntryFile: './src/global.css',
    experimental: {
        federation: {
            role: 'remote',
            id: federationName,
        },
        optimizeClasslessComponents: true,
    },
})
