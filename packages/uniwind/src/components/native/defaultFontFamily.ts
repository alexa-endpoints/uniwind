import { StyleDependency } from '../../common/consts'
import { UniwindListener } from '../../core/listener'
import { UniwindStore } from '../../core/native'
import { runtimeOptions } from '../../core/runtimeOptions'
import type { RNStyle, UniwindContextType } from '../../core/types'
import { getVariableValue } from '../../hooks/useCSSVariable/getVariableValue'

type DefaultFontFamilyStyle = { fontFamily: string }

type DefaultFontFamilySource = {
    // The dependencies whose changes can change the family.
    dependencies: Array<StyleDependency>
    // The style root text in the scope starts from, or `undefined` while none applies.
    get: () => DefaultFontFamilyStyle | undefined
}

const DEFAULT_FONT_FAMILY = '--default-font-family'
// One object per family, so the style text rendered with only changes when the family does.
const fontFamilyStyles = new Map<string, DefaultFontFamilyStyle>()
// A CSS-wide keyword names no family; React Native would look it up as one.
const cssWideKeywords = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset'])
const themeAndVariables = [StyleDependency.Theme, StyleDependency.Variables]
// A scoped theme ignores global theme changes.
const variablesOnly = [StyleDependency.Variables]

// CSS compiles to bare names, but a value set at runtime through
// updateCSSVariables or ScopedVariables may keep its CSS quotes.
const unquote = (value: string) => {
    const quote = value[0]

    return value.length > 1 && (quote === '"' || quote === '\'') && value.endsWith(quote)
        ? value.slice(1, -1).trim()
        : value
}

const resolveDefaultFontFamilyStyle = (uniwindContext: UniwindContextType) => {
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

    let style = fontFamilyStyles.get(fontFamily)

    if (style === undefined) {
        style = { fontFamily }
        fontFamilyStyles.set(fontFamily, style)
    }

    return style
}

const createDefaultFontFamilySource = (uniwindContext: UniwindContextType): DefaultFontFamilySource => {
    const dependencies = uniwindContext.scopedTheme === null ? themeAndVariables : variablesOnly
    let revision: number | undefined
    let vars: typeof UniwindStore.vars | undefined
    let style: DefaultFontFamilyStyle | undefined

    return {
        dependencies,
        get: () => {
            // A registration that turns the option off reaches subscribed text through here.
            if (!runtimeOptions.defaultFontFamily) {
                return undefined
            }

            // Only a notification of a dependency, or a rebuild, which replaces the store's variables, changes the
            // family, so all text in the scope shares one lookup per change.
            const currentRevision = UniwindListener.getSnapshot(dependencies)

            if (currentRevision !== revision || UniwindStore.vars !== vars) {
                revision = currentRevision
                vars = UniwindStore.vars
                style = resolveDefaultFontFamilyStyle(uniwindContext)
            }

            return style
        },
    }
}

// One source per context value; ScopedTheme and ScopedVariables memoize their values.
const sources = new WeakMap<UniwindContextType, DefaultFontFamilySource>()
// One style per generated style and family, so text renders the same object while neither changes.
const stylesWithDefaultFontFamily = new WeakMap<RNStyle, Map<DefaultFontFamilyStyle, RNStyle>>()

/**
 * With the `defaultFontFamily` option on: native text inherits nothing from
 * the root, so root text and inputs start from the theme's
 * --default-font-family, the font Tailwind's preflight gives the web root.
 * React Native resolves one bare family name, so quotes are stripped, and a
 * fallback list or a CSS-wide keyword keeps the platform default.
 */
export const getDefaultFontFamilySource = (uniwindContext: UniwindContextType) => {
    let source = sources.get(uniwindContext)

    if (source === undefined) {
        source = createDefaultFontFamilySource(uniwindContext)
        sources.set(uniwindContext, source)
    }

    return source
}

// The generated style with the default family added. Only text whose classes set no family gets it, and the
// `style` prop still overrides it.
export const withDefaultFontFamily = (style: RNStyle, defaultFontFamily: DefaultFontFamilyStyle) => {
    let byFontFamily = stylesWithDefaultFontFamily.get(style)

    if (byFontFamily === undefined) {
        byFontFamily = new Map()
        stylesWithDefaultFontFamily.set(style, byFontFamily)
    }

    let styleWithDefaultFontFamily = byFontFamily.get(defaultFontFamily)

    if (styleWithDefaultFontFamily === undefined) {
        styleWithDefaultFontFamily = { ...style, ...defaultFontFamily }
        byFontFamily.set(defaultFontFamily, styleWithDefaultFontFamily)
    }

    return styleWithDefaultFontFamily
}
