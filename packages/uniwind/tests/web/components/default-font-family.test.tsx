import { render } from '@testing-library/react'
import * as React from 'react'
import { StyleSheet } from 'react-native'
import { describe, expect, test } from 'vitest'
import Text from '../../../src/components/web/Text'
import TextInput from '../../../src/components/web/TextInput'

// React Native Web's StyleSheet exposes its generated rules; React Native's types do not declare it.
const getSheetText = () => (StyleSheet as unknown as { getSheet: () => { textContent: string } }).getSheet().textContent

const defaultFontClass = (element: HTMLElement) => Array.from(element.classList).find(name => name.startsWith('css-defaultFontFamily-'))

describe('Default font family', () => {
    test('restores the page default font on root text and inputs', () => {
        const { getByTestId } = render(
            <React.Fragment>
                <Text className="text-red-500" testID="text">Hello</Text>
                <TextInput testID="input" />
            </React.Fragment>,
        )

        const text = getByTestId('text')
        const textClass = defaultFontClass(text)

        expect(text).toHaveClass('text-red-500')
        expect(textClass).toBeDefined()
        expect(defaultFontClass(getByTestId('input'))).toEqual(textClass)
        expect(getSheetText()).toContain(`.${textClass}{font-family:var(--default-font-family);}`)
    })

    test('leaves nested text to inherit its parent font', () => {
        const { getByTestId } = render(
            <Text className="font-mono" testID="outer">
                Outer <Text testID="inner">inner</Text>
            </Text>,
        )

        expect(defaultFontClass(getByTestId('outer'))).toBeDefined()
        expect(defaultFontClass(getByTestId('inner'))).toBeUndefined()
    })
})
