import { use } from 'react'
import type { TextProps } from 'react-native'
import { Text as RNText } from 'react-native'
import { copyComponentProperties } from '../utils'
import { defaultFontFamily, TextAncestorContext } from './defaultFontFamily'
import { generateDataSet } from './generateDataSet'
import { toRNWClassName } from './rnw'

export const Text = copyComponentProperties(RNText, (props: TextProps) => {
    const hasTextAncestor = use(TextAncestorContext)
    const text = (
        <RNText
            {...props}
            style={[hasTextAncestor ? undefined : defaultFontFamily, toRNWClassName(props.className), props.style]}
            dataSet={generateDataSet(props)}
        />
    )

    return hasTextAncestor ? text : <TextAncestorContext value>{text}</TextAncestorContext>
})

export default Text
