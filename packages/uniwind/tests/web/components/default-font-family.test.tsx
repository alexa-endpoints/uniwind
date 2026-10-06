import { render } from '@testing-library/react'
import * as React from 'react'
import { StyleSheet } from 'react-native'
import { describe, expect, test } from 'vitest'
import Text from '../../../src/components/web/Text'
import TextInput from '../../../src/components/web/TextInput'

// React Native Web's StyleSheet exposes its generated rules; React Native's types do not declare it.
const getSheetText = () => (StyleSheet as unknown as { getSheet: () => { textContent: string } }).getSheet().textContent

const defaultFontClass = (element: HTMLElement) => Array.from(element.classList).find(name => name.startsWith('css-uniwindDefaultFontFamily-'))

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
        // Without the token the rule falls back to React Native Web's own System stack.
        expect(getSheetText()).toContain(
            `.${textClass}{font-family:var(--default-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);}`,
        )
    })

    test('serializes after the text and input resets', () => {
        // Static rendering ships the sheet's sorted text; the rule must still follow the resets it overrides.
        const { getByTestId } = render(<Text testID="text">Hello</Text>)
        const rules = getSheetText().split('\n')
        const indexOf = (prefix: string) => rules.findIndex(rule => rule.startsWith(prefix))
        const defaultFontRule = indexOf(`.${defaultFontClass(getByTestId('text'))}{`)

        expect(defaultFontRule).toBeGreaterThan(-1)
        expect(defaultFontRule).toBeGreaterThan(indexOf('.css-text-'))
        expect(defaultFontRule).toBeGreaterThan(indexOf('.css-textinput-'))
        expect(indexOf('.css-text-')).toBeGreaterThan(-1)
        expect(indexOf('.css-textinput-')).toBeGreaterThan(-1)
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
