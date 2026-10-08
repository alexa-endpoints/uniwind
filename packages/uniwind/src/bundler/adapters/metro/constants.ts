export const RAW_COMPONENTS_MODULE = 'uniwind/.internal/raw-components'
export const UPSTREAM_BABEL_TRANSFORMER = 'uniwind_upstreamBabelTransformerPath'
export const TRANSFORM_COMPONENTS = 'uniwind_transformComponents'

// Every built-in React Native component Uniwind wraps. This is the resolver's wrapper set, so it must
// stay complete; to narrow `optimizeClasslessComponents`, edit the two lists below instead.
export const NATIVE_COMPONENT_NAMES = [
    'ActivityIndicator',
    'Button',
    'FlatList',
    'Image',
    'ImageBackground',
    'InputAccessoryView',
    'KeyboardAvoidingView',
    'Modal',
    'Pressable',
    'RefreshControl',
    'SafeAreaView',
    'ScrollView',
    'SectionList',
    'Switch',
    'Text',
    'TextInput',
    'TouchableHighlight',
    'TouchableNativeFeedback',
    'TouchableOpacity',
    'TouchableWithoutFeedback',
    'View',
    'VirtualizedList',
] as const

export type NativeComponentName = typeof NATIVE_COMPONENT_NAMES[number]

export const NATIVE_COMPONENT_NAME_SET = new Set<string>(NATIVE_COMPONENT_NAMES)

// Components that must always keep their Uniwind wrapper: they are not eligible, no predicate can
// enable them, and they are not part of `ClasslessComponentName`. Narrow the optimization here, never
// in `NATIVE_COMPONENT_NAMES` above: that array is also the resolver's complete wrapper set
// (`SUPPORTED_COMPONENTS` in resolvers.ts), so dropping a name from it would strip the wrapper from
// `uniwind/components` deep imports too, including RN's own `Animated.<Name>`.
export const CLASSLESS_COMPONENT_EXCLUSIONS = [] as const satisfies ReadonlyArray<NativeComponentName>

const CLASSLESS_COMPONENT_EXCLUSION_SET = new Set<string>(CLASSLESS_COMPONENT_EXCLUSIONS)

export type ClasslessComponentName = Exclude<NativeComponentName, typeof CLASSLESS_COMPONENT_EXCLUSIONS[number]>

// Eligible components: classless usages may compile to the raw React Native component, and an
// `optimizeClasslessComponents` predicate is asked about each of them. Keep in sync with
// `ClasslessComponentName` in index.d.ts and with raw-components.ts.
export const CLASSLESS_COMPONENT_NAMES: ReadonlyArray<ClasslessComponentName> = NATIVE_COMPONENT_NAMES.filter(
    (component): component is ClasslessComponentName => !CLASSLESS_COMPONENT_EXCLUSION_SET.has(component),
)

export const CLASSLESS_COMPONENT_NAME_SET = new Set<string>(CLASSLESS_COMPONENT_NAMES)

// Eligible components that `optimizeClasslessComponents: true` does not enable. Narrow the default set
// here: predicates see this through `isDefault`, so a component listed here still compiles to the raw
// component when a predicate asks for it by name.
export const NON_DEFAULT_CLASSLESS_COMPONENT_NAMES = [] as const satisfies ReadonlyArray<ClasslessComponentName>

const NON_DEFAULT_CLASSLESS_COMPONENT_NAME_SET = new Set<string>(NON_DEFAULT_CLASSLESS_COMPONENT_NAMES)

// Whether `optimizeClasslessComponents: true` enables an eligible component, also passed to predicates.
export const isDefaultClasslessComponent = (component: ClasslessComponentName) => !NON_DEFAULT_CLASSLESS_COMPONENT_NAME_SET.has(component)

// Default set: the eligible components that `optimizeClasslessComponents: true` enables.
export const DEFAULT_CLASSLESS_COMPONENT_NAMES: ReadonlyArray<ClasslessComponentName> = CLASSLESS_COMPONENT_NAMES.filter(
    isDefaultClasslessComponent,
)
