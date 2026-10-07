export const RAW_COMPONENTS_MODULE = 'uniwind/.internal/raw-components'
export const UPSTREAM_BABEL_TRANSFORMER = 'uniwind_upstreamBabelTransformerPath'
export const TRANSFORM_COMPONENTS = 'uniwind_transformComponents'

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

/** Text and TextInput start from the theme's `--default-font-family`, which only
 *  the wrapper reads, so a classless one keeps the wrapper instead of going raw. */
export const DEFAULT_FONT_COMPONENT_NAMES = ['Text', 'TextInput'] as const

// React Native warns when its deprecated SafeAreaView export is read, and Fast Refresh reads every
// export of the raw-component module, so classless SafeAreaView keeps the Uniwind wrapper.
type WrapperOnlyComponentName = typeof DEFAULT_FONT_COMPONENT_NAMES[number] | 'SafeAreaView'

const WRAPPER_ONLY_COMPONENT_NAME_SET = new Set<string>([...DEFAULT_FONT_COMPONENT_NAMES, 'SafeAreaView'])

export const RAW_COMPONENT_NAMES = NATIVE_COMPONENT_NAMES.filter(
    (name): name is Exclude<NativeComponentName, WrapperOnlyComponentName> => !WRAPPER_ONLY_COMPONENT_NAME_SET.has(name),
)

export type RawComponentName = typeof RAW_COMPONENT_NAMES[number]

export const RAW_COMPONENT_NAME_SET = new Set<string>(RAW_COMPONENT_NAMES)
