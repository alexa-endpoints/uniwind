import { createContext } from 'react'

// With the `defaultFontFamily` option on, marks root text and inputs for the
// `uniwind-default-font` rule that uniwind.css then ships in @layer base, so the
// rule wins over React Native Web's reset by layer rather than by rule order,
// which static rendering re-sorts.
export const defaultFontFamily = { $$css: true, uniwindDefaultFont: 'uniwind-default-font' } as {}

// Text nested in a Uniwind Text inherits its parent's font instead.
export const TextAncestorContext = createContext(false)
