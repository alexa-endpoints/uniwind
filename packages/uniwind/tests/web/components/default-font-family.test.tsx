import { render } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, test } from 'vitest'
import Text from '../../../src/components/web/Text'
import TextInput from '../../../src/components/web/TextInput'

describe('Default font family', () => {
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
})
