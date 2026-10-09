import type { MetroConfig } from 'metro-config'

type Polyfills = {
    rem?: number
}

/**
 * Built-in React Native components whose classless usages `optimizeClasslessComponents` can compile
 * to the raw React Native component. The deprecated `SafeAreaView` is not one of them: it always keeps
 * its wrapper.
 */
export type ClasslessComponentName =
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

/**
 * What `optimizeClasslessComponents` tells its predicate about the component it is asked about.
 */
export type ClasslessComponentContext = {
    /**
     * Whether `optimizeClasslessComponents: true` enables this component, so a predicate can adjust
     * the default set instead of restating it.
     */
    isDefault: boolean
}

/**
 * Decides whether classless usages of one component compile to the raw React Native component.
 */
export type ClasslessComponentPredicate = (
    component: ClasslessComponentName,
    context: ClasslessComponentContext,
) => boolean

type ExperimentalOptions = {
    /**
     * Rewrites statically classless React Native elements to raw components. The deprecated
     * `SafeAreaView` always keeps its wrapper.
     *
     * - `true` optimizes the default set: every component the predicate's `isDefault` holds for.
     * - A function is called synchronously once per component in `ClasslessComponentName` when
     *   `withUniwindConfig` runs and returns whether classless usages of that component compile to
     *   the raw component. It must return a boolean; a throw or any other value (such as a Promise)
     *   fails the config with an error naming the component.
     * - Adjust the default set through `isDefault`:
     *   `(component, { isDefault }) => isDefault && component !== 'Modal'` is the default set without
     *   `Modal`, and `(component, { isDefault }) => isDefault || component === 'Text'` is the default
     *   set plus `Text`. To enable a fixed list, declare it as `ClasslessComponentName[]` and use
     *   `component => list.includes(component)`.
     * - Any other option value, such as `null`, a string or an array, fails the config.
     *
     * @default false
     */
    optimizeClasslessComponents?: boolean | ClasslessComponentPredicate
}

type UniwindConfig = {
    cssEntryFile: string
    extraThemes?: Array<string>
    dtsFile?: string
    polyfills?: Polyfills
    debug?: boolean
    isTV?: boolean
    experimental?: ExperimentalOptions
}

export declare function withUniwindConfig(config: MetroConfig, options: UniwindConfig): MetroConfig
