import type { MetroConfig } from 'metro-config'
import { type ClasslessComponentName, type ClasslessComponentPredicate, withUniwindConfig } from 'uniwind/metro'
import { type Equal, type Expect } from './checks'

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

declare const config: MetroConfig

// optimizeClasslessComponents accepts a boolean
withUniwindConfig(config, { cssEntryFile: './global.css', experimental: { optimizeClasslessComponents: true } })

// optimizeClasslessComponents accepts a predicate over eligible component names
withUniwindConfig(config, {
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
withUniwindConfig(config, {
    cssEntryFile: './global.css',
    experimental: {
        optimizeClasslessComponents: (component, { isDefault }) => isDefault && component !== 'Modal',
    },
})

withUniwindConfig(config, {
    cssEntryFile: './global.css',
    experimental: {
        optimizeClasslessComponents: (component, { isDefault }) => isDefault || component === 'Text',
    },
})

// The documented list idiom type-checks for a list typed as component names
const enabledComponents: Array<ClasslessComponentName> = ['Text', 'View']

withUniwindConfig(config, {
    cssEntryFile: './global.css',
    experimental: {
        optimizeClasslessComponents: component => enabledComponents.includes(component),
    },
})

// A standalone predicate can be typed with the exported type
const optimizeClasslessComponents: ClasslessComponentPredicate = (component, { isDefault }) => isDefault && component !== 'Modal'

withUniwindConfig(config, { cssEntryFile: './global.css', experimental: { optimizeClasslessComponents } })

withUniwindConfig(config, {
    cssEntryFile: './global.css',
    experimental: {
        // @ts-expect-error The predicate must return a boolean
        optimizeClasslessComponents: component => component === 'View' ? 'raw' : undefined,
    },
})

withUniwindConfig(config, {
    cssEntryFile: './global.css',
    experimental: {
        // @ts-expect-error SafeAreaView always keeps its wrapper, so predicates are never asked about it
        optimizeClasslessComponents: component => component === 'SafeAreaView',
    },
})
