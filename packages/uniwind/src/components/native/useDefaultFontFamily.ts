import { use, useLayoutEffect, useReducer } from 'react'
import { unstable_TextAncestorContext as TextAncestorContext } from 'react-native'
import { StyleDependency } from '../../common/consts'
import { useUniwindContext } from '../../core/context'
import { UniwindListener } from '../../core/listener'
import { getVariableValue } from '../../hooks/useCSSVariable/getVariableValue'

const DEFAULT_FONT_FAMILY = '--default-font-family'
const dependencies = [StyleDependency.Theme, StyleDependency.Variables]
const styles = new Map<string, { fontFamily: string }>()
// A CSS-wide keyword names no family; React Native would look it up as one.
const cssWideKeywords = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset'])

/**
 * Native text inherits nothing from the root, so root text and inputs start
 * from the theme's --default-font-family, the font Tailwind's preflight gives
 * the web root. React Native resolves one family name, so a fallback list or a
 * CSS-wide keyword keeps the platform default. Nested text inherits from its
 * parent, and className and style still override.
 */
export const useDefaultFontFamily = () => {
    'use no memo'
    const uniwindContext = useUniwindContext()
    const hasTextAncestor = use(TextAncestorContext)
    const [_, rerender] = useReducer(() => ({}), {})
    const renderedSnapshot = UniwindListener.getSnapshot(dependencies)

    useLayoutEffect(() => {
        if (!hasTextAncestor) {
            const dispose = UniwindListener.subscribe(rerender, dependencies)

            // Activity and Suspense can reconnect effects without rendering.
            if (renderedSnapshot !== UniwindListener.getSnapshot(dependencies)) {
                rerender()
            }

            return dispose
        }
    }, [hasTextAncestor])

    if (hasTextAncestor) {
        return undefined
    }

    const fontFamily = getVariableValue(DEFAULT_FONT_FAMILY, uniwindContext)

    if (
        typeof fontFamily !== 'string'
        || fontFamily === ''
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
