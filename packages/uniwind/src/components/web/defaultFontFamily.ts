import { createContext } from 'react'
import { StyleSheet } from 'react-native'

// React Native Web resets root text and inputs to `font: 14px System`, so
// they would skip the page's default font. This rule restores
// --default-font-family in the same reset layer; it lands after the reset and
// below Tailwind's layers, so font utilities still win.
export const defaultFontFamily = StyleSheet.create({
    defaultFontFamily$raw: {
        fontFamily: 'var(--default-font-family)',
    },
}).defaultFontFamily$raw

// Text nested in a Uniwind Text inherits its parent's font instead.
export const TextAncestorContext = createContext(false)
