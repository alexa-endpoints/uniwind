import { use, useLayoutEffect, useReducer } from 'react'
import { unstable_TextAncestorContext as TextAncestorContext } from 'react-native'
import { useUniwindContext } from '../../core/context'
import { UniwindListener } from '../../core/listener'
import { UniwindStore } from '../../core/native'
import { runtimeOptions } from '../../core/runtimeOptions'
import type { ComponentState } from '../../core/types'
import { getDefaultFontFamilySource, withDefaultFontFamily } from './defaultFontFamily'

/**
 * Text and TextInput pass `textComponent`, so that with the `defaultFontFamily` option on, root text and inputs
 * whose className sets no family start from the theme's --default-font-family (see getDefaultFontFamilySource).
 * Nested text inherits from its parent, while an input never inherits an enclosing Text's attributes, so it
 * starts from the default there too. `style` still overrides. Such text re-renders only when the family it
 * rendered with changes; with the option off, or while its className sets a family, it subscribes to nothing for
 * it and gets the style it would get without the option.
 */
export const useStyle = (
    className: string | undefined,
    componentProps: Record<string, any>,
    state?: ComponentState,
    textComponent?: 'text' | 'input',
) => {
    'use no memo'
    const uniwindContext = useUniwindContext()
    const [_, rerender] = useReducer(() => ({}), {})
    const styleState = UniwindStore.getStyles(className, componentProps, state, uniwindContext)

    const renderedSnapshot = UniwindListener.getSnapshot(styleState.dependencies)
    const startsFromDefaultFontFamily = textComponent !== undefined
        && runtimeOptions.defaultFontFamily
        && styleState.styles.fontFamily === undefined
        // `use` may be called conditionally, so text looks its ancestor up only when the default could apply.
        && (textComponent === 'input' || !use(TextAncestorContext))
    const defaultFontFamily = startsFromDefaultFontFamily ? getDefaultFontFamilySource(uniwindContext) : undefined
    const renderedDefaultFontFamily = defaultFontFamily?.get()

    useLayoutEffect(() => {
        let dispose: (() => void) | undefined

        if (__DEV__ || styleState.dependencies.length > 0) {
            dispose = UniwindListener.subscribe(rerender, styleState.dependencies)

            // Activity and Suspense can reconnect effects without rendering.
            if (renderedSnapshot !== UniwindListener.getSnapshot(styleState.dependencies)) {
                rerender()
            }
        }

        if (defaultFontFamily === undefined) {
            return dispose
        }

        const onDefaultFontFamilyChange = () => {
            if (defaultFontFamily.get() !== renderedDefaultFontFamily) {
                rerender()
            }
        }
        const disposeDefaultFontFamily = UniwindListener.subscribe(onDefaultFontFamilyChange, defaultFontFamily.dependencies)

        // The family can change while the effect is disconnected too.
        onDefaultFontFamilyChange()

        return () => {
            dispose?.()
            disposeDefaultFontFamily()
        }
    }, [styleState.dependencySum, defaultFontFamily, renderedDefaultFontFamily])

    return renderedDefaultFontFamily === undefined
        ? styleState.styles
        : withDefaultFontFamily(styleState.styles, renderedDefaultFontFamily)
}
