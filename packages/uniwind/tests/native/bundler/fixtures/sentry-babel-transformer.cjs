const expoTransformer = require('@expo/metro-config/build/babel-transformer')

const componentAnnotatePlugin = () => ({
    name: 'sentry-component-annotate-fixture',
    visitor: {},
})

module.exports = {
    ...expoTransformer,
    transform(args) {
        if (
            !args.filename.includes('node_modules')
            && Array.isArray(args.plugins)
        ) {
            args.plugins.push(componentAnnotatePlugin)
        }

        return expoTransformer.transform(args)
    },
}
