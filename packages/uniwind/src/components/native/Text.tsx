import { useState } from 'react'
import type { TextProps } from 'react-native'
import { Text as RNText } from 'react-native'
import type { ComponentState } from '../../core/types'
import { copyComponentProperties } from '../utils'
import { useAccentColor } from './useAccentColor'
import { useDefaultFontFamily } from './useDefaultFontFamily'
import { useStyle } from './useStyle'

type StyleWithWebkitLineClamp = {
    WebkitLineClamp?: number
}

export const Text = copyComponentProperties(RNText, (props: TextProps) => {
    const [isPressed, setIsPressed] = useState(false)
    const state = {
        isPressed,
        isDisabled: Boolean(props.disabled),
    } satisfies ComponentState
    const style = useStyle(props.className, props, state)
    const defaultFontFamily = useDefaultFontFamily('text')
    const selectionColor = useAccentColor(props.selectionColorClassName, props, state)

    return (
        <RNText
            {...props}
            style={[defaultFontFamily, style, props.style]}
            selectionColor={props.selectionColor ?? selectionColor}
            numberOfLines={(style as StyleWithWebkitLineClamp).WebkitLineClamp ?? props.numberOfLines}
            onPressIn={event => {
                setIsPressed(true)
                props.onPressIn?.(event)
            }}
            onPressOut={event => {
                setIsPressed(false)
                props.onPressOut?.(event)
            }}
        />
    )
})

export default Text
