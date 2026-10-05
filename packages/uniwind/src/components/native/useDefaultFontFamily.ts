import { use, useLayoutEffect, useReducer } from 'react'
import { unstable_TextAncestorContext as TextAncestorContext } from 'react-native'
import { StyleDependency } from '../../common/consts'
import { useUniwindContext } from '../../core/context'
import { UniwindListener } from '../../core/listener'
import { getVariableValue } from '../../hooks/useCSSVariable/getVariableValue'

const DEFAULT_FONT_FAMILY = '--default-font-family'
const dependencies = [StyleDependency.Theme, StyleDependency.Variables]
const styles = new Map<string, { fontFamily: string }>()

/**
 * Native text inherits nothing from the root, so root text and inputs start
 * from the theme's --default-font-family, the font Tailwind's preflight gives
 * the web root. React Native resolves one family name, so a fallback list
 * keeps the platform default. Nested text inherits from its parent, and
 * className and style still override.
 */
export const useDefaultFontFamily = () => {
    'use no memo'
    const uniwindContext = useUniwindContext()
    const hasTextAncestor = use(TextAncestorContext)
    const [_, rerender] = useReducer(() => ({}), {})

    useLayoutEffect(() => {
        if (!hasTextAncestor) {
            return UniwindListener.subscribe(rerender, dependencies)
        }
    }, [hasTextAncestor])

    if (hasTextAncestor) {
        return undefined
    }

    const fontFamily = getVariableValue(DEFAULT_FONT_FAMILY, uniwindContext)

    if (typeof fontFamily !== 'string' || fontFamily === '' || fontFamily.includes(',')) {
        return undefined
    }

    let style = styles.get(fontFamily)

    if (style === undefined) {
        style = { fontFamily }
        styles.set(fontFamily, style)
    }

    return style
}
