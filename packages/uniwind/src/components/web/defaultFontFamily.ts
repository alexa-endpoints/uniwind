import { createContext } from 'react'

// With the `defaultFontFamily` option on, marks root text and inputs for the
// `uniwind-default-font` rule that the generated artifact declares in @layer base,
// so the rule wins over React Native Web's reset by layer rather than by rule
// order, which static rendering re-sorts.
export const defaultFontFamily = { $$css: true, uniwindDefaultFont: 'uniwind-default-font' } as {}

// Text nested in a Uniwind Text inherits its parent's font instead. React Native
// Web's own context sits behind a deep import that Vite's pre-bundled
// react-native-web wouldn't share, so Uniwind Text inside raw React Native Web
// Text sees no ancestor and starts from the default.
export const TextAncestorContext = createContext(false)
