import type { TextInputProps, TextProps } from 'react-native'
import { Text as RNText, TextInput as RNTextInput } from 'react-native'
import { copyComponentProperties } from '../utils'
import { useDefaultFontFamily } from './useDefaultFontFamily'

// Statically classless text skips className resolution but still starts from
// the theme's default font family.

export const Text = copyComponentProperties(RNText, (props: TextProps) => {
    const defaultFontFamily = useDefaultFontFamily()

    return <RNText {...props} style={defaultFontFamily === undefined ? props.style : [defaultFontFamily, props.style]} />
})

export const TextInput = copyComponentProperties(RNTextInput, (props: TextInputProps) => {
    const defaultFontFamily = useDefaultFontFamily()

    return <RNTextInput {...props} style={defaultFontFamily === undefined ? props.style : [defaultFontFamily, props.style]} />
})
