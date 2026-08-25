import { getDefaultConfig, unstable_transformerPath } from '@expo/metro-config'
import type * as ExpoMetroWorker from '@expo/metro-config/build/transform-worker/transform-worker'
import type { JsTransformerConfig } from '@expo/metro/metro-transform-worker'
import path from 'node:path'
import {
    TRANSFORM_COMPONENTS,
    UPSTREAM_BABEL_TRANSFORMER,
} from '../../../src/bundler/adapters/metro/constants'

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..')
const UNIWIND_BABEL_TRANSFORMER = require.resolve(
    '../../../src/bundler/adapters/metro/babel-transformer',
)
const expoWorker = require(unstable_transformerPath) as typeof ExpoMetroWorker

const getBabelTransformerPath = (config: {
    transformer?: {
        babelTransformerPath?: string
    }
}) => {
    const transformerPath = config.transformer?.babelTransformerPath
    if (!transformerPath) {
        throw new Error('Expected Metro config to provide a Babel transformer')
    }

    return transformerPath
}

const upstreamTransformers = [
    {
        name: 'Expo',
        path: getBabelTransformerPath(getDefaultConfig(PROJECT_ROOT)),
    },
    {
        name: 'Expo through Sentry-style delegation',
        path: require.resolve(
            './fixtures/sentry-babel-transformer.cjs',
        ),
    },
]

const transform = async (
    source: string,
    {
        filename,
        reactCompiler,
        upstreamTransformerPath,
    }: {
        filename: string
        reactCompiler: boolean
        upstreamTransformerPath: string
    },
) => {
    const transformerConfig = {
        ...getDefaultConfig(PROJECT_ROOT).transformer as JsTransformerConfig,
        babelTransformerPath: UNIWIND_BABEL_TRANSFORMER,
    }
    const result = await expoWorker.transform(
        transformerConfig,
        PROJECT_ROOT,
        filename,
        Buffer.from(source),
        {
            customTransformOptions: {
                engine: 'hermes',
                reactCompiler,
                [TRANSFORM_COMPONENTS]: true,
                [UPSTREAM_BABEL_TRANSFORMER]: upstreamTransformerPath,
            },
            dev: true,
            experimentalImportSupport: true,
            inlinePlatform: true,
            inlineRequires: false,
            minify: false,
            nonInlinedRequires: [],
            platform: 'ios',
            type: 'module',
            unstable_transformProfile: 'hermes-stable',
        },
    )

    const output = result.output[0]
    if (!output) {
        throw new Error('Expected Metro to produce JavaScript output')
    }

    return output.data.code
}

const countRawComponentReferences = (code: string, componentName: string) =>
    code.match(
        new RegExp(
            `_uniwindInternalRawComponents\\d*\\.${componentName}\\b`,
            'g',
        ),
    )?.length ?? 0

const malformedRawComponentPattern = /createElement\(\s*_uniwindInternalRawComponents\d*\s*,/

const fixtures = [
    {
        name: 'Legend List ESM alias shape',
        filename: 'react-native.mjs',
        hasStyledAlias: true,
        source: `
            import * as React2 from "react";
            import {
                Text as Text$1,
                View as View$1,
            } from "react-native";

            var View = View$1;
            var Text = Text$1;

            export function Fixture({ nested }) {
                return React2.createElement(
                    View,
                    { className: "p-4" },
                    React2.createElement(
                        View,
                        null,
                        React2.createElement(Text, null, "First"),
                    ),
                    nested
                        && React2.createElement(
                            View$1,
                            null,
                            React2.createElement(Text$1, null, "Second"),
                        ),
                );
            }
        `,
    },
    {
        name: 'compiled CommonJS namespace shape',
        filename: 'compiled.js',
        hasStyledAlias: false,
        source: `
            const React = require("react");
            const ReactNative = require("react-native");

            export function Fixture() {
                return React.createElement(
                    ReactNative.View,
                    null,
                    React.createElement(ReactNative.Text, null, "First"),
                    React.createElement(
                        ReactNative.View,
                        null,
                        React.createElement(ReactNative.Text, null, "Second"),
                    ),
                );
            }
        `,
    },
]

describe.each(upstreamTransformers)(
    '$name component transform pipeline',
    ({ path: upstreamTransformerPath }) => {
        describe.each([false, true])(
            'with React Compiler $reactCompiler',
            reactCompiler => {
                test.each(fixtures)(
                    'keeps every raw component reference callable for $name',
                    async ({ filename, hasStyledAlias, source }) => {
                        const code = await transform(source, {
                            filename: path.join(
                                PROJECT_ROOT,
                                'node_modules',
                                '.uniwind-transform-fixtures',
                                filename,
                            ),
                            reactCompiler,
                            upstreamTransformerPath,
                        })

                        expect(code).not.toMatch(malformedRawComponentPattern)
                        expect(countRawComponentReferences(code, 'View')).toBe(2)
                        expect(countRawComponentReferences(code, 'Text')).toBe(2)
                        if (hasStyledAlias) {
                            expect(code).toMatch(
                                /createElement\(\s*View\s*,\s*\{\s*className:/,
                            )
                        }
                    },
                )

                test('keeps className elements on the wrapped component path', async () => {
                    const code = await transform(
                        `
                            import * as React from "react";
                            import { View } from "react-native";

                            export function Fixture() {
                                return React.createElement(
                                    View,
                                    { className: "p-4" },
                                    React.createElement(View, null),
                                );
                            }
                        `,
                        {
                            filename: path.join(
                                PROJECT_ROOT,
                                'node_modules',
                                '.uniwind-transform-fixtures',
                                'class-name.js',
                            ),
                            reactCompiler,
                            upstreamTransformerPath,
                        },
                    )

                    expect(code).not.toMatch(malformedRawComponentPattern)
                    expect(countRawComponentReferences(code, 'View')).toBe(1)
                    expect(code).toMatch(
                        /createElement\(\s*_reactNative\d*\.View\s*,\s*\{\s*className:/,
                    )
                })
            },
        )
    },
)
