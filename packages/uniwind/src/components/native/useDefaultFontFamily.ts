import { use, useCallback, useSyncExternalStore } from 'react'
import { unstable_TextAncestorContext as TextAncestorContext } from 'react-native'
import { StyleDependency } from '../../common/consts'
import { useUniwindContext } from '../../core/context'
import { UniwindListener } from '../../core/listener'
import type { UniwindContextType } from '../../core/types'
import { getVariableValue } from '../../hooks/useCSSVariable/getVariableValue'

type FontFamilyStyle = { fontFamily: string }

const DEFAULT_FONT_FAMILY = '--default-font-family'
// One object per family, so a snapshot only changes when the family does.
const styles = new Map<string, FontFamilyStyle>()
// A CSS-wide keyword names no family; React Native would look it up as one.
const cssWideKeywords = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset'])

const createSubscribe = (dependencies: Array<StyleDependency>) => (onChange: () => void) => {
    const dispose = UniwindListener.subscribe(onChange, dependencies)

    // A hidden Activity drops this subscription and restores it without
    // rendering, and React then re-checks the snapshot only if the last render
    // mounted or changed it. Check here; React re-renders only if it differs.
    onChange()

    return dispose
}
const subscribeToNothing = () => () => {}
const subscribeToThemeAndVariables = createSubscribe([StyleDependency.Theme, StyleDependency.Variables])
// A scoped theme ignores global theme changes.
const subscribeToVariables = createSubscribe([StyleDependency.Variables])
const getNoStyle = () => undefined

// CSS compiles to bare names, but a value set at runtime through
// updateCSSVariables or ScopedVariables may keep its CSS quotes.
const unquote = (value: string) => {
    const quote = value[0]

    return value.length > 1 && (quote === '"' || quote === '\'') && value.endsWith(quote)
        ? value.slice(1, -1).trim()
        : value
}

const getDefaultFontFamilyStyle = (uniwindContext: UniwindContextType) => {
    const value = getVariableValue(DEFAULT_FONT_FAMILY, uniwindContext)

    if (typeof value !== 'string') {
        return undefined
    }

    const fontFamily = unquote(value.trim())

    if (
        fontFamily === ''
        || fontFamily.includes(',')
        || cssWideKeywords.has(fontFamily.toLowerCase())
    ) {
        return undefined
    }

    let style = styles.get(fontFamily)

    if (style === undefined) {
        style = { fontFamily }
        styles.set(fontFamily, style)
    }

    return style
}

/**
 * Native text inherits nothing from the root, so root text and inputs start
 * from the theme's --default-font-family, the font Tailwind's preflight gives
 * the web root. React Native resolves one bare family name, so quotes are
 * stripped, and a fallback list or a CSS-wide keyword keeps the platform
 * default. Nested text inherits from its parent, while an input never inherits
 * an enclosing Text's attributes, so it starts from the default there too.
 * className and style still override.
 *
 * The snapshot is the cached style object, so an update that leaves the family
 * unchanged re-renders nothing.
 */
export const useDefaultFontFamily = (component: 'text' | 'input') => {
    const uniwindContext = useUniwindContext()
    const inheritsFont = use(TextAncestorContext) && component === 'text'
    const getStyle = useCallback(() => getDefaultFontFamilyStyle(uniwindContext), [uniwindContext])
    const subscribe = inheritsFont
        ? subscribeToNothing
        : uniwindContext.scopedTheme === null
        ? subscribeToThemeAndVariables
        : subscribeToVariables

    return useSyncExternalStore(subscribe, inheritsFont ? getNoStyle : getStyle)
}
