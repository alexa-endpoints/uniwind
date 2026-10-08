import { transformSync, traverse } from '@babel/core'
import { componentTransform } from '../../../src/bundler/adapters/metro/component-transform'
import {
    CLASSLESS_COMPONENT_EXCLUSIONS,
    CLASSLESS_COMPONENT_NAMES,
    type ClasslessComponentName,
    RAW_COMPONENTS_MODULE,
} from '../../../src/bundler/adapters/metro/constants'
import * as rawComponents from '../../../src/bundler/adapters/metro/raw-components'
import { shouldTransformClasslessComponents } from '../../../src/bundler/adapters/metro/transformer'

const CLASS_PROPS_BY_COMPONENT = {
    ActivityIndicator: ['className', 'colorClassName'],
    Button: ['colorClassName'],
    FlatList: [
        'className',
        'columnWrapperClassName',
        'contentContainerClassName',
        'ListFooterComponentClassName',
        'ListHeaderComponentClassName',
        'endFillColorClassName',
    ],
    Image: ['className', 'tintColorClassName'],
    ImageBackground: ['className', 'imageClassName', 'tintColorClassName'],
    InputAccessoryView: ['className', 'backgroundColorClassName'],
    KeyboardAvoidingView: ['className', 'contentContainerClassName'],
    Modal: ['className', 'backdropColorClassName'],
    Pressable: ['className'],
    RefreshControl: [
        'className',
        'colorsClassName',
        'tintColorClassName',
        'titleColorClassName',
        'progressBackgroundColorClassName',
    ],
    ScrollView: ['className', 'contentContainerClassName', 'endFillColorClassName'],
    SectionList: [
        'className',
        'contentContainerClassName',
        'ListFooterComponentClassName',
        'ListHeaderComponentClassName',
        'endFillColorClassName',
    ],
    Switch: [
        'className',
        'trackColorOnClassName',
        'trackColorOffClassName',
        'thumbColorClassName',
        'ios_backgroundColorClassName',
    ],
    Text: ['className', 'selectionColorClassName'],
    TextInput: [
        'className',
        'cursorColorClassName',
        'selectionColorClassName',
        'placeholderTextColorClassName',
        'selectionHandleColorClassName',
        'underlineColorAndroidClassName',
    ],
    TouchableHighlight: ['className', 'underlayColorClassName'],
    TouchableNativeFeedback: ['className'],
    TouchableOpacity: ['className'],
    TouchableWithoutFeedback: ['className'],
    View: ['className'],
    VirtualizedList: [
        'className',
        'contentContainerClassName',
        'ListFooterComponentClassName',
        'ListHeaderComponentClassName',
        'endFillColorClassName',
    ],
} as const satisfies Record<ClasslessComponentName, ReadonlyArray<string>>

const runTransform = (
    source: string,
    components: ReadonlyArray<string> = CLASSLESS_COMPONENT_NAMES,
) => {
    const result = transformSync(source, {
        ast: true,
        babelrc: false,
        configFile: false,
        filename: 'Component.tsx',
        parserOpts: {
            plugins: ['jsx', 'typescript'],
        },
        plugins: [[componentTransform, { components }]],
    })

    if (!result?.ast || !result.code) {
        throw new Error('Expected Babel to produce an AST and code')
    }

    return {
        ast: result.ast,
        code: result.code,
    }
}

const transform = (
    source: string,
    components?: ReadonlyArray<string>,
) => runTransform(source, components).code

test('the private raw-component module exports exactly the eligible components', () => {
    expect(Object.keys(rawComponents).sort()).toEqual([...CLASSLESS_COMPONENT_NAMES].sort())
})

describe.each(CLASSLESS_COMPONENT_NAMES)('%s compile-time dispatch', componentName => {
    test('is exported by the private raw-component module', () => {
        expect(rawComponents[componentName]).toBeDefined()
    })

    test('rewrites statically classless JSX to the raw component', () => {
        const code = transform(`
            import { ${componentName} } from 'react-native'

            export const Component = () => <${componentName} testID="component" />
        `)

        expect(code).toContain(`from "${RAW_COMPONENTS_MODULE}"`)
        expect(code).toContain(`${componentName} as _Raw${componentName}`)
        expect(code).toContain(`<_Raw${componentName} testID="component" />`)
    })

    test.each(CLASS_PROPS_BY_COMPONENT[componentName])(
        'keeps %s on the Uniwind wrapper path',
        classProp => {
            const code = transform(`
                import { ${componentName} } from 'react-native'

                export const Component = () => <${componentName} ${classProp}="test" />
            `)

            expect(code).not.toContain(RAW_COMPONENTS_MODULE)
            expect(code).toContain(`<${componentName} ${classProp}="test" />`)
        },
    )

    test('keeps prop spreads on the Uniwind wrapper path', () => {
        const code = transform(`
            import { ${componentName} } from 'react-native'

            export const Component = props => <${componentName} {...props} />
        `)

        expect(code).not.toContain(RAW_COMPONENTS_MODULE)
        expect(code).toContain(`<${componentName} {...props} />`)
    })
})

test('uses raw components only for provably classless JSX', () => {
    const code = transform(`
        import { Text, View } from 'react-native'

        export const Component = () => (
            <View style={{ flex: 1 }}>
                <Text className="font-bold">Styled</Text>
                <Text style={{ color: 'black' }}>Raw</Text>
            </View>
        )
    `)

    expect(code).toContain(`from "${RAW_COMPONENTS_MODULE}"`)
    expect(code).toMatch(/import \{ View as _RawView, Text as _RawText \}/)
    expect(code).toContain('<_RawView')
    expect(code).toContain('<Text className="font-bold">')
    expect(code).toContain('<_RawText style=')
})

test('keeps elements with spreads on the wrapped component path', () => {
    const code = transform(`
        import { View } from 'react-native'

        export const Component = (props) => (
            <>
                <View {...props} />
                <View style={props.style} />
            </>
        )
    `)

    expect(code).toContain('<View {...props} />')
    expect(code).toContain('<_RawView style={props.style} />')
})

test('supports namespace imports and constant aliases', () => {
    const code = transform(`
        import * as RN from 'react-native'
        import { View } from 'react-native'

        const Alias = View

        export const Component = () => (
            <>
                <RN.Text />
                <Alias />
            </>
        )
    `)

    expect(code).toMatch(/import \{ Text as _RawText, View as _RawView \}/)
    expect(code).toContain('<_RawText />')
    expect(code).toContain('<_RawView />')
})

test('supports CommonJS destructuring', () => {
    const code = transform(`
        const { Text: Label, View } = require('react-native')

        export const Component = () => (
            <View>
                <Label />
            </View>
        )
    `)

    expect(code).toMatch(/import \{ View as _RawView, Text as _RawText \}/)
    expect(code).toContain('<_RawView>')
    expect(code).toContain('<_RawText />')
})

test('optimizes only createElement calls with static classless props', () => {
    const code = transform(`
        import React, { createElement } from 'react'
        import { View } from 'react-native'

        export const raw = React.createElement(View, { style: { flex: 1 } })
        export const rawNamed = createElement(View, null)
        export const styled = React.createElement(View, { className: 'flex-1' })
        export const dynamic = React.createElement(View, props)
    `)

    expect(code).toContain('React.createElement(_RawView, {')
    expect(code).toContain('createElement(_RawView, null)')
    expect(code).toContain('React.createElement(View, {\n  className: \'flex-1\'')
    expect(code).toContain('React.createElement(View, props)')
})

test('creates an independent identifier node for every raw component reference', () => {
    const result = runTransform(`
        import React from 'react'
        import { View } from 'react-native'

        export const Component = () => React.createElement(
            View,
            null,
            React.createElement(View, null),
        )
    `)
    const rawImport = result.ast.program.body.find(
        node =>
            node.type === 'ImportDeclaration'
            && node.source.value === RAW_COMPONENTS_MODULE,
    )
    if (!rawImport || rawImport.type !== 'ImportDeclaration') {
        throw new Error('Expected a raw component import')
    }

    const rawSpecifier = rawImport.specifiers.find(
        specifier =>
            specifier.type === 'ImportSpecifier'
            && specifier.imported.type === 'Identifier'
            && specifier.imported.name === 'View',
    )
    if (!rawSpecifier) {
        throw new Error('Expected a raw View import')
    }

    const rawReferences: object[] = []
    traverse(result.ast, {
        CallExpression(path) {
            const component = path.node.arguments[0]
            if (
                component?.type === 'Identifier'
                && component.name === rawSpecifier.local.name
            ) {
                rawReferences.push(component)
            }
        },
    })

    expect(rawReferences).toHaveLength(2)
    expect(rawReferences[0]).not.toBe(rawReferences[1])
    expect(rawReferences).not.toContain(rawSpecifier.local)
})

test('does not optimize mutable component aliases', () => {
    const code = transform(`
        import React from 'react'
        import { View } from 'react-native'

        let Alias = View
        Alias = CustomView

        export const Component = () => React.createElement(Alias, null)
    `)

    expect(code).not.toContain(RAW_COMPONENTS_MODULE)
    expect(code).toContain('React.createElement(Alias, null)')
})

test('does not rewrite unrelated components', () => {
    const code = transform(`
        import { View as CustomView } from './components'

        export const Component = () => <CustomView style={{ flex: 1 }} />
    `)

    expect(code).not.toContain(RAW_COMPONENTS_MODULE)
    expect(code).toContain('<CustomView style=')
})

test('does not rewrite unsupported React Native exports', () => {
    const code = transform(`
        import { StatusBar } from 'react-native'

        export const Component = () => <StatusBar />
    `)

    expect(code).not.toContain(RAW_COMPONENTS_MODULE)
    expect(code).toContain('<StatusBar />')
})

describe.each(CLASSLESS_COMPONENT_EXCLUSIONS)('excluded %s', componentName => {
    test('keeps statically classless JSX on the Uniwind wrapper path', () => {
        const code = transform(`
            import { ${componentName} } from 'react-native'

            export const Component = () => <${componentName} testID="component" />
        `)

        expect(code).not.toContain(RAW_COMPONENTS_MODULE)
        expect(code).toContain(`<${componentName} testID="component" />`)
    })

    test('is neither eligible nor exported by the private raw-component module', () => {
        expect(CLASSLESS_COMPONENT_NAMES).not.toContain(componentName)
        expect(rawComponents).not.toHaveProperty(componentName)
    })

    // Even a list that names it cannot send it down the raw path.
    test('keeps the Uniwind wrapper when a component list names it', () => {
        const code = transform(
            `
            import { ${componentName} } from 'react-native'

            export const Component = () => <${componentName} />
        `,
            [componentName],
        )

        expect(code).not.toContain(RAW_COMPONENTS_MODULE)
        expect(code).toContain(`<${componentName} />`)
    })
})

describe('with a partial component list', () => {
    const referenceShapes = [
        {
            name: 'named imports',
            source: `
                import { Text, View } from 'react-native'

                export const Component = () => (
                    <View>
                        <Text />
                    </View>
                )
            `,
            raw: ['<_RawView>'],
            wrapped: ['<Text />'],
        },
        {
            name: 'namespace imports',
            source: `
                import * as RN from 'react-native'

                export const Component = () => (
                    <RN.View>
                        <RN.Text />
                    </RN.View>
                )
            `,
            raw: ['<_RawView>'],
            wrapped: ['<RN.Text />'],
        },
        {
            name: 'default imports',
            source: `
                import RN from 'react-native'

                export const Component = () => (
                    <RN.View>
                        <RN.Text />
                    </RN.View>
                )
            `,
            raw: ['<_RawView>'],
            wrapped: ['<RN.Text />'],
        },
        {
            name: 'constant aliases',
            source: `
                import { Text, View } from 'react-native'

                const Box = View
                const Label = Text as typeof Text

                export const Component = () => (
                    <Box>
                        <Label />
                    </Box>
                )
            `,
            raw: ['<_RawView>'],
            wrapped: ['<Label />'],
        },
        {
            name: 'CommonJS destructuring',
            source: `
                const { Text: Label, View } = require('react-native')

                export const Component = () => (
                    <View>
                        <Label />
                    </View>
                )
            `,
            raw: ['<_RawView>'],
            wrapped: ['<Label />'],
        },
        {
            name: 'CommonJS namespaces',
            source: `
                const ReactNative = require('react-native')

                export const Component = () => (
                    <ReactNative.View>
                        <ReactNative.Text />
                        {React.createElement(require('react-native').Text, null)}
                    </ReactNative.View>
                )
            `,
            raw: ['<_RawView>'],
            wrapped: ['<ReactNative.Text />', 'React.createElement(require(\'react-native\').Text, null)'],
        },
        {
            name: 'createElement calls',
            source: `
                import React, { createElement } from 'react'
                import { Text, View } from 'react-native'

                export const view = React.createElement(View, null)
                export const namedView = createElement(View, { style: { flex: 1 } })
                export const text = React.createElement(Text, null)
                export const namedText = createElement(Text, { style: { flex: 1 } })
            `,
            raw: ['React.createElement(_RawView, null)', 'createElement(_RawView, {'],
            wrapped: ['React.createElement(Text, null)', 'createElement(Text, {'],
        },
    ]

    test.each(referenceShapes)('rewrites only enabled components for $name', ({ raw, source, wrapped }) => {
        const code = transform(source, ['View'])

        expect(code).toMatch(new RegExp(`import \\{ View as _RawView \\} from "${RAW_COMPONENTS_MODULE}"`))
        expect(code).not.toContain('_RawText')
        raw.forEach(snippet => expect(code).toContain(snippet))
        wrapped.forEach(snippet => expect(code).toContain(snippet))
    })

    test.each(referenceShapes)('rewrites nothing for an empty list with $name', ({ source }) => {
        const code = transform(source, [])

        expect(code).not.toContain(RAW_COMPONENTS_MODULE)
        expect(code).not.toContain('_Raw')
    })

    test('ignores names that are not eligible components', () => {
        const code = transform(
            `
                import { StatusBar } from 'react-native'

                export const Component = () => <StatusBar />
            `,
            ['StatusBar'],
        )

        expect(code).not.toContain(RAW_COMPONENTS_MODULE)
        expect(code).toContain('<StatusBar />')
    })

    test('requires the enabled component list', () => {
        expect(() =>
            transformSync(`import { View } from 'react-native'`, {
                babelrc: false,
                configFile: false,
                filename: 'Component.tsx',
                plugins: [componentTransform],
            })
        ).toThrow('Uniwind: The component transform requires the enabled component list')
    })
})

describe('shouldTransformClasslessComponents', () => {
    const source = Buffer.from(`import { View } from 'react-native'`)
    const nativeOptions = {
        platform: 'android',
        type: 'module' as const,
    }

    test('dispatches files that can reference an enabled component', () => {
        expect(shouldTransformClasslessComponents(
            { optimizedClasslessComponents: ['View'] },
            source,
            nativeOptions,
        )).toBe(true)
        expect(shouldTransformClasslessComponents(
            { optimizedClasslessComponents: [...CLASSLESS_COMPONENT_NAMES] },
            source,
            nativeOptions,
        )).toBe(true)
    })

    test.each([
        ['no resolved list', {}],
        ['an empty list', { optimizedClasslessComponents: [] }],
        ['a list without the referenced component', { optimizedClasslessComponents: ['Image' as const] }],
    ])('skips the Babel dispatch for %s', (_, config) => {
        expect(shouldTransformClasslessComponents(config, source, nativeOptions)).toBe(false)
    })

    // The option is off by default, so a scan there would cost every transform of every app.
    test.each([
        ['no resolved list', {}],
        ['an empty list', { optimizedClasslessComponents: [] }],
    ])('reads no file for %s', (_, config) => {
        const data = Buffer.from(source)
        const includes = jest.spyOn(data, 'includes')

        expect(shouldTransformClasslessComponents(config, data, nativeOptions)).toBe(false)
        expect(includes).not.toHaveBeenCalled()
    })

    test('skips web, assets and files without React Native', () => {
        const config = { optimizedClasslessComponents: ['View' as const] }

        expect(shouldTransformClasslessComponents(config, source, { ...nativeOptions, platform: 'web' })).toBe(false)
        expect(shouldTransformClasslessComponents(config, source, { ...nativeOptions, type: 'asset' })).toBe(false)
        expect(shouldTransformClasslessComponents(
            config,
            Buffer.from(`import { View } from './View'`),
            nativeOptions,
        )).toBe(false)
    })
})
