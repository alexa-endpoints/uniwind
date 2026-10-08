import type { MetroConfig } from 'metro-config'
import { type ClasslessComponentName, type ClasslessComponentPredicate, withUniwindConfig } from 'uniwind/metro'
import { type Equal, type Expect } from './checks'

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

type ExpectedClasslessComponentName =
    | 'ActivityIndicator'
    | 'Button'
    | 'FlatList'
    | 'Image'
    | 'ImageBackground'
    | 'InputAccessoryView'
    | 'KeyboardAvoidingView'
    | 'Modal'
    | 'Pressable'
    | 'RefreshControl'
    | 'ScrollView'
    | 'SectionList'
    | 'Switch'
    | 'Text'
    | 'TextInput'
    | 'TouchableHighlight'
    | 'TouchableNativeFeedback'
    | 'TouchableOpacity'
    | 'TouchableWithoutFeedback'
    | 'View'
    | 'VirtualizedList'

// ClasslessComponentName exported from uniwind/metro
type ClasslessComponentNameTest = Expect<Equal<ClasslessComponentName, ExpectedClasslessComponentName>>

// ClasslessComponentPredicate exported from uniwind/metro
type ClasslessComponentPredicateTest = Expect<
    Equal<
        ClasslessComponentPredicate,
        (component: ClasslessComponentName, context: { isDefault: boolean }) => boolean
    >
>

// optimizeClasslessComponents accepts a boolean
withUniwindConfig(metroConfig, { cssEntryFile: './global.css', experimental: { optimizeClasslessComponents: true } })

// optimizeClasslessComponents accepts a predicate over eligible component names
withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        optimizeClasslessComponents: (component, context) => {
            type PredicateParameterTest = Expect<Equal<typeof component, ClasslessComponentName>>
            type PredicateContextTest = Expect<Equal<typeof context, { isDefault: boolean }>>

            return component !== 'Modal'
        },
    },
})

// The predicate can express the default set minus a component, and the default set plus one
withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        optimizeClasslessComponents: (component, { isDefault }) => isDefault && component !== 'Modal',
    },
})

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        optimizeClasslessComponents: (component, { isDefault }) => isDefault || component === 'Text',
    },
})

// The documented list idiom type-checks for a list typed as component names
const enabledComponents: Array<ClasslessComponentName> = ['Text', 'View']

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        optimizeClasslessComponents: component => enabledComponents.includes(component),
    },
})

// A standalone predicate can be typed with the exported type
const optimizeClasslessComponents: ClasslessComponentPredicate = (component, { isDefault }) => isDefault && component !== 'Modal'

withUniwindConfig(metroConfig, { cssEntryFile: './global.css', experimental: { optimizeClasslessComponents } })

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        // @ts-expect-error The predicate must return a boolean
        optimizeClasslessComponents: component => component === 'View' ? 'raw' : undefined,
    },
})

withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    experimental: {
        // @ts-expect-error SafeAreaView always keeps its wrapper, so predicates are never asked about it
        optimizeClasslessComponents: component => component === 'SafeAreaView',
    },
})

// With the default font family on, a predicate can still opt Text and TextInput in
withUniwindConfig(metroConfig, {
    cssEntryFile: './global.css',
    defaultFontFamily: true,
    experimental: {
        optimizeClasslessComponents: (component, { isDefault }) => isDefault || component === 'Text' || component === 'TextInput',
    },
})
