import type { Plugin } from 'vite'

type UniwindConfig = {
    cssEntryFile: string
    extraThemes?: Array<string>
    dtsFile?: string
    /**
     * Starts root `Text` and `TextInput` from the theme's `--default-font-family`, which Tailwind
     * derives from `--font-sans`. Otherwise root `Text` keeps React Native Web's System font, and with
     * Preflight `TextInput` inherits its container's font. `className` and `style` still override the
     * default, and nested `Text` inherits from its parent instead.
     *
     * - The default sits in `@layer base`, so font utilities win only when the CSS entry declares
     *   Tailwind's layer order before it imports `uniwind`; `@import 'tailwindcss'` does.
     * - The token resolves once, on the root, so a `ScopedTheme` or `ScopedVariables` override of
     *   `--font-sans` doesn't reach root text. A scoped override sets `--default-font-family` itself.
     * - A `TextInput` starts from the default even inside a container with a font class, as on native,
     *   instead of inheriting that font through Preflight.
     * - Without the token (no `--font-sans`, or `--default-font-family: initial`), root text keeps
     *   React Native Web's System font.
     * - A Uniwind `Text` nested in a `Text` imported from `react-native-web` itself starts from the
     *   default too, since only Uniwind's `Text` marks its subtree.
     *
     * When off, Uniwind adds no default font, and `Text` and `TextInput` render as they did before the
     * option existed.
     * @default false
     */
    defaultFontFamily?: boolean
}

export declare function uniwind(config: UniwindConfig): Plugin
