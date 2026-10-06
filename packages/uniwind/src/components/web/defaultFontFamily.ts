import { createContext } from 'react'
import { StyleSheet } from 'react-native'

// React Native Web resets root text and inputs to `font: 14px System`, so
// they would skip the page's default font. This rule restores
// --default-font-family in the same reset layer, below Tailwind's layers, so
// font utilities still win. Without the token it falls back to React Native
// Web's System stack, so the reset font stays.
//
// React Native Web sorts each group's rules by text when it serializes the
// sheet for static rendering, and the key names the class. Starting it with
// "uniwind" sorts the rule after the `text` and `textinput` resets, as it is
// inserted at runtime.
export const defaultFontFamily = StyleSheet.create({
    uniwindDefaultFontFamily$raw: {
        fontFamily: 'var(--default-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)',
    },
}).uniwindDefaultFontFamily$raw

// Text nested in a Uniwind Text inherits its parent's font instead.
export const TextAncestorContext = createContext(false)
