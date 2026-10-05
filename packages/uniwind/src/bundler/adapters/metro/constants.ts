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

export const DEFAULT_FONT_COMPONENT_NAME_SET = new Set<string>(DEFAULT_FONT_COMPONENT_NAMES)

export const OPTIMIZABLE_COMPONENT_NAMES = NATIVE_COMPONENT_NAMES
    .filter(name => !DEFAULT_FONT_COMPONENT_NAME_SET.has(name))
