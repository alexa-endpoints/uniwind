const { createMetroConfig } = require('../metro.shared')

const devServerHost = process.env.MF_DEV_SERVER_HOST ?? 'localhost'

module.exports = createMetroConfig({
    cssEntryFile: 'global.css',
    projectRoot: __dirname,
    federation: {
        name: 'uniwindHost',
        remotes: {
            remoteA: `remoteA@http://${devServerHost}:8082/mf-manifest.json`,
            remoteB: `remoteB@http://${devServerHost}:8083/mf-manifest.json`,
        },
        shareStrategy: 'loaded-first',
    },
})
