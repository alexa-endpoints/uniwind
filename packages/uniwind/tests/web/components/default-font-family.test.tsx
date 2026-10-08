import { render } from '@testing-library/react'
import * as React from 'react'
import { Text as RNText, TextInput as RNTextInput } from 'react-native'
import type { TextInputProps, TextProps } from 'react-native'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { generateDataSet } from '../../../src/components/web/generateDataSet'
import { toRNWClassName } from '../../../src/components/web/rnw'
import Text from '../../../src/components/web/Text'
import TextInput from '../../../src/components/web/TextInput'
import { Uniwind } from '../../../src/core/config/config'
import type { UniwindRuntimeOptions } from '../../../src/core/types'

type UniwindForTest = {
    __reinit: (_: () => {}, themes: Array<string>, fingerprint?: string, options?: UniwindRuntimeOptions) => void
}

// Registers the options the way the injected web registration does.
const register = (options: UniwindRuntimeOptions) =>
    (Uniwind as unknown as UniwindForTest).__reinit(() => ({}), ['light', 'dark'], undefined, options)

// The web wrappers as they were before the default font family existed.
const TextBefore = (props: TextProps) => <RNText {...props} style={[toRNWClassName(props.className), props.style]} dataSet={generateDataSet(props)} />
const TextInputBefore = (props: TextInputProps) => (
    <RNTextInput {...props} style={[toRNWClassName(props.className), props.style]} dataSet={generateDataSet(props)} />
)

describe('Default font family while the option is off', () => {
    test('leaves root text and inputs to React Native Web', () => {
        const { getByTestId } = render(
            <React.Fragment>
                <Text className="text-red-500" testID="text">Hello</Text>
                <Text testID="classless">Hello</Text>
                <TextInput className="text-red-500" testID="input" />
                <Text testID="outer">
                    Name: <TextInput testID="nested-input" />
                </Text>
            </React.Fragment>,
        )

        for (const id of ['text', 'classless', 'input', 'outer', 'nested-input']) {
            expect(getByTestId(id).className).not.toContain('uniwind-default-font')
        }

        expect(getByTestId('text')).toHaveClass('text-red-500')
        expect(getByTestId('input')).toHaveClass('text-red-500')
    })

    test('renders the DOM the wrappers rendered before the option existed', () => {
        const uniwind = render(
            <React.Fragment>
                <Text className="text-red-500" testID="text">
                    Hello <Text>nested</Text>
                </Text>
                <TextInput className="text-red-500" testID="input" />
            </React.Fragment>,
        )
        const before = render(
            <React.Fragment>
                <TextBefore className="text-red-500" testID="text">
                    Hello <TextBefore>nested</TextBefore>
                </TextBefore>
                <TextInputBefore className="text-red-500" testID="input" />
            </React.Fragment>,
        )

        expect(uniwind.container.innerHTML).toBe(before.container.innerHTML)
    })
})

describe('Default font family while the option is on', () => {
    beforeAll(() => register({ defaultFontFamily: true }))

    afterAll(() => register({ defaultFontFamily: false }))

    test('marks root text and inputs for the default font rule', () => {
        const { getByTestId } = render(
            <React.Fragment>
                <Text className="text-red-500" testID="text">Hello</Text>
                <TextInput className="text-red-500" testID="input" />
            </React.Fragment>,
        )

        expect(getByTestId('text')).toHaveClass('uniwind-default-font', 'text-red-500')
        expect(getByTestId('input')).toHaveClass('uniwind-default-font', 'text-red-500')
    })

    test('leaves nested text to inherit its parent font', () => {
        const { getByTestId } = render(
            <Text className="font-mono" testID="outer">
                Outer <Text testID="inner">inner</Text>
            </Text>,
        )

        expect(getByTestId('outer')).toHaveClass('uniwind-default-font')
        expect(getByTestId('inner')).not.toHaveClass('uniwind-default-font')
    })

    test('marks inputs nested in text, matching native inputs that never inherit', () => {
        const { getByTestId } = render(
            <Text className="font-mono" testID="outer">
                Name: <TextInput testID="input" />
            </Text>,
        )

        expect(getByTestId('input')).toHaveClass('uniwind-default-font')
    })
})
