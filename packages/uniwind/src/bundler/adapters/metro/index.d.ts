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
     * the default set instead of restating it. False for `Text` and `TextInput` while
     * `defaultFontFamily` is on.
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

type UniwindFederationConfig =
    | {
        role: 'host'
        sharedClassNames?: ReadonlyArray<string>
        /**
         * Remote stylesheets compiled into the host bundle and merged at runtime under their remote id.
         */
        inlinedRemotes?: ReadonlyArray<{
            id: string
            cssEntryFile: string
            sharedClassNames?: ReadonlyArray<string>
        }>
    }
    | {
        role: 'remote'
        id: string
        sharedClassNames?: ReadonlyArray<string>
    }

type ExperimentalOptions = {
    federation?: UniwindFederationConfig
    /**
     * Rewrites statically classless React Native elements to raw components. The deprecated
     * `SafeAreaView` always keeps its wrapper.
     *
     * - `true` optimizes the default set: every component the predicate's `isDefault` holds for. While
     *   `defaultFontFamily` is on, that leaves out `Text` and `TextInput`, because only their wrappers
     *   apply the default font.
     * - A function is called synchronously once per component in `ClasslessComponentName` when
     *   `withUniwindConfig` runs and returns whether classless usages of that component compile to
     *   the raw component. It must return a boolean; a throw or any other value (such as a Promise)
     *   fails the config with an error naming the component.
     * - Adjust the default set through `isDefault`:
     *   `(component, { isDefault }) => isDefault && component !== 'Modal'` is the default set without
     *   `Modal`, and `(component, { isDefault }) => isDefault || component === 'Text'` is the default
     *   set plus `Text`. To enable a fixed list, declare it as `ClasslessComponentName[]` and use
     *   `component => list.includes(component)`.
     * - A predicate may still enable `Text` and `TextInput` while `defaultFontFamily` is on. Their
     *   classless usages then compile to the raw components, which don't apply the default font, so
     *   root ones start from the platform default on native.
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
    /**
     * Starts root `Text` and `TextInput` from the theme's `--default-font-family`, which Tailwind
     * derives from `--font-sans`, on native and web. React Native resolves a single family name,
     * so on native a fallback list keeps the platform default. A federated remote should match its
     * host: the host's setting applies at runtime.
     * @default false
     */
    defaultFontFamily?: boolean
    polyfills?: Polyfills
    debug?: boolean
    isTV?: boolean
    experimental?: ExperimentalOptions
}

export declare function withUniwindConfig(config: MetroConfig, options: UniwindConfig): MetroConfig
