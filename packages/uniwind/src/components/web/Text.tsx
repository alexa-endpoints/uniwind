import { use } from 'react'
import type { TextProps } from 'react-native'
import { Text as RNText } from 'react-native'
import { runtimeOptions } from '../../core/runtimeOptions'
import { copyComponentProperties } from '../utils'
import { defaultFontFamily, TextAncestorContext } from './defaultFontFamily'
import { generateDataSet } from './generateDataSet'
import { toRNWClassName } from './rnw'

export const Text = copyComponentProperties(RNText, (props: TextProps) => {
    // `use` may be called conditionally, so text skips the ancestor lookup while the option is off.
    const startsFromDefault = runtimeOptions.defaultFontFamily && !use(TextAncestorContext)
    const text = (
        <RNText
            {...props}
            style={startsFromDefault
                ? [defaultFontFamily, toRNWClassName(props.className), props.style]
                : [toRNWClassName(props.className), props.style]}
            dataSet={generateDataSet(props)}
        />
    )

    return startsFromDefault ? <TextAncestorContext value>{text}</TextAncestorContext> : text
})

export default Text
