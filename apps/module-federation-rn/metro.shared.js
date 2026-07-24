const { withModuleFederation } = require('@module-federation/metro')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withUniwindConfig } = require('uniwind/metro')
const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('path')

const REACT_VERSION = require('react/package.json').version
const REACT_NATIVE_VERSION = require('react-native/package.json').version
const UNIWIND_VERSION = require('uniwind/package.json').version
const RCT_NETWORKING_MODULE = 'react-native/Libraries/Network/RCTNetworking'

const getSharedDependencies = role => {
    const reactNative = {
        singleton: true,
        eager: role === 'host',
        ...(role === 'remote' ? { import: false } : {}),
        requiredVersion: REACT_NATIVE_VERSION,
        version: REACT_NATIVE_VERSION,
    }

    return {
        react: {
            singleton: true,
            eager: role === 'host',
            ...(role === 'remote' ? { import: false } : {}),
            requiredVersion: REACT_VERSION,
            version: REACT_VERSION,
        },
        'react-native': reactNative,
        uniwind: {
            singleton: true,
            eager: role === 'host',
            ...(role === 'remote' ? { import: false } : {}),
            requiredVersion: UNIWIND_VERSION,
            version: UNIWIND_VERSION,
        },
        [RCT_NETWORKING_MODULE]: { ...reactNative },
    }
}

const materializeRemoteSharedProxies = (projectRoot, sharedDependencies) => {
    const sharedDirectory = path.join(projectRoot, 'node_modules/.mf-metro/shared')

    mkdirSync(sharedDirectory, { recursive: true })

    for (const [moduleName, config] of Object.entries(sharedDependencies)) {
        if (config.import !== false) {
            continue
        }

        const filename = `${moduleName.replaceAll('/', '_')}.js`
        const source = [
            'import { getModuleFromRegistry } from \'mf:remote-module-registry\'',
            `module.exports = getModuleFromRegistry(${JSON.stringify(moduleName)})`,
            '',
        ].join('\n')

        writeFileSync(path.join(sharedDirectory, filename), source)
    }
}

const withFederationRuntimeResolver = (uniwindConfig, federatedConfig, projectRoot) => {
    const federationResolver = federatedConfig.resolver.resolveRequest
    const uniwindResolver = uniwindConfig.resolver.resolveRequest
    const federationRuntimeRoot = `${path.join(projectRoot, 'node_modules/.mf-metro')}${path.sep}`

    return {
        ...uniwindConfig,
        resolver: {
            ...uniwindConfig.resolver,
            resolveRequest: (context, moduleName, platform) => {
                if (
                    federationResolver
                    && context.originModulePath.startsWith(federationRuntimeRoot)
                ) {
                    return federationResolver(context, moduleName, platform)
                }

                return uniwindResolver(context, moduleName, platform)
            },
        },
    }
}

const createMetroConfig = ({ cssEntryFile, federation, projectRoot }) => {
    const workspaceRoot = path.resolve(projectRoot, '../../..')
    const baseConfig = mergeConfig(getDefaultConfig(projectRoot), {
        watchFolders: [workspaceRoot],
        resolver: {
            nodeModulesPaths: [
                path.join(projectRoot, 'node_modules'),
                path.join(workspaceRoot, 'node_modules'),
            ],
            unstable_enablePackageExports: true,
            unstable_enableSymlinks: true,
        },
    })
    const isRemote = Boolean(federation.exposes)
    const sharedDependencies = getSharedDependencies(isRemote ? 'remote' : 'host')
    const federatedConfig = withModuleFederation(
        baseConfig,
        {
            ...federation,
            shared: sharedDependencies,
        },
        {
            flags: {
                unstable_patchHMRClient: true,
                unstable_patchInitializeCore: true,
                unstable_patchRuntimeRequire: true,
            },
        },
    )

    // MF Metro 2.8 resolves these from remote entries without registering them.
    if (isRemote && federatedConfig !== baseConfig) {
        materializeRemoteSharedProxies(projectRoot, sharedDependencies)
    }

    const uniwindConfig = withUniwindConfig(federatedConfig, {
        cssEntryFile,
        ...(isRemote
            ? {
                federation: {
                    role: 'remote',
                    id: federation.name,
                },
            }
            : {}),
    })

    return withFederationRuntimeResolver(uniwindConfig, federatedConfig, projectRoot)
}

module.exports = {
    createMetroConfig,
}
