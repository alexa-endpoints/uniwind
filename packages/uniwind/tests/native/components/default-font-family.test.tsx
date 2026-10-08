import { act } from '@testing-library/react-native'
import * as React from 'react'
import { unstable_TextAncestorContext as TextAncestorContext } from 'react-native'
import Text from '../../../src/components/native/Text'
import TextInput from '../../../src/components/native/TextInput'
import { ScopedTheme } from '../../../src/components/ScopedTheme/ScopedTheme.native'
import { Uniwind } from '../../../src/core'
import { UniwindStore } from '../../../src/core/native'
import { renderUniwind } from '../utils'

const getVar = (theme: 'light' | 'dark', name: string) => {
    const vars = UniwindStore.vars[theme]

    return vars?.[name]?.(vars)
}

// React Native's Text provides this context to its children; the Jest mock does not.
const NestedText = ({ children }: React.PropsWithChildren) => <TextAncestorContext value>{children}</TextAncestorContext>

describe('Default font family', () => {
    let lightDefault: unknown
    let darkDefault: unknown

    beforeAll(() => {
        lightDefault = getVar('light', '--default-font-family')
        darkDefault = getVar('dark', '--default-font-family')
    })

    afterEach(() => {
        act(() => {
            Uniwind.setTheme('light')
            Uniwind.updateCSSVariables('light', { '--default-font-family': lightDefault as string })
            Uniwind.updateCSSVariables('dark', { '--default-font-family': darkDefault as string })
        })
    })

    const useDefaults = (light: string, dark = light) =>
        act(() => {
            Uniwind.updateCSSVariables('light', { '--default-font-family': light })
            Uniwind.updateCSSVariables('dark', { '--default-font-family': dark })
        })

    test('keeps the platform default while the theme default is a CSS fallback list', () => {
        expect(lightDefault).toEqual(expect.stringContaining(','))

        const { getStylesFromId } = renderUniwind(<Text testID="text">Hello</Text>)

        expect(getStylesFromId('text').fontFamily).toBeUndefined()
    })

    test('keeps the platform default for CSS-wide keywords', () => {
        for (const keyword of ['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'INITIAL']) {
            useDefaults(keyword)

            const { getStylesFromId, unmount } = renderUniwind(
                <React.Fragment>
                    <Text testID="text">Hello</Text>
                    <TextInput testID="input" />
                </React.Fragment>,
            )

            expect(getStylesFromId('text').fontFamily).toBeUndefined()
            expect(getStylesFromId('input').fontFamily).toBeUndefined()
            unmount()
        }
    })

    test('starts root text and inputs from a single-family theme default', () => {
        useDefaults('Inter')

        const { getStylesFromId } = renderUniwind(
            <React.Fragment>
                <Text testID="text">Hello</Text>
                <Text className="text-red-500" testID="styled">Hello</Text>
                <TextInput testID="input" />
            </React.Fragment>,
        )

        expect(getStylesFromId('text').fontFamily).toEqual('Inter')
        expect(getStylesFromId('styled').fontFamily).toEqual('Inter')
        expect(getStylesFromId('input').fontFamily).toEqual('Inter')
    })

    test('lets className and style choose another family', () => {
        useDefaults('Inter')

        const { getStylesFromId } = renderUniwind(
            <React.Fragment>
                <Text className="font-[Georgia]" testID="class">Hello</Text>
                <Text style={{ fontFamily: 'Menlo' }} testID="style">Hello</Text>
                <TextInput className="font-[Georgia]" testID="input" />
            </React.Fragment>,
        )

        expect(getStylesFromId('class').fontFamily).toEqual('Georgia')
        expect(getStylesFromId('style').fontFamily).toEqual('Menlo')
        expect(getStylesFromId('input').fontFamily).toEqual('Georgia')
    })

    test('leaves nested text to inherit its parent family', () => {
        useDefaults('Inter')

        const { getStylesFromId } = renderUniwind(
            <Text className="font-[Georgia]" testID="outer">
                Outer{' '}
                <NestedText>
                    <Text testID="inner">inner</Text>
                </NestedText>
            </Text>,
        )

        expect(getStylesFromId('outer').fontFamily).toEqual('Georgia')
        expect(getStylesFromId('inner')?.fontFamily).toBeUndefined()
    })

    test('starts inputs nested in text from the theme default, since inputs never inherit', () => {
        useDefaults('Inter', 'Inter Dark')

        const { getStylesFromId } = renderUniwind(
            <Text className="font-[Georgia]" testID="outer">
                Name:{' '}
                <NestedText>
                    <TextInput testID="input" />
                </NestedText>
            </Text>,
        )

        expect(getStylesFromId('outer').fontFamily).toEqual('Georgia')
        expect(getStylesFromId('input').fontFamily).toEqual('Inter')

        act(() => {
            Uniwind.setTheme('dark')
        })

        expect(getStylesFromId('input').fontFamily).toEqual('Inter Dark')
    })

    test('follows theme changes and scoped themes', () => {
        useDefaults('Inter', 'Inter Dark')

        const { getStylesFromId } = renderUniwind(
            <React.Fragment>
                <Text testID="global">Hello</Text>
                <ScopedTheme theme="dark">
                    <Text testID="scoped">Hello</Text>
                </ScopedTheme>
            </React.Fragment>,
        )

        expect(getStylesFromId('global').fontFamily).toEqual('Inter')
        expect(getStylesFromId('scoped').fontFamily).toEqual('Inter Dark')

        act(() => {
            Uniwind.setTheme('dark')
        })

        expect(getStylesFromId('global').fontFamily).toEqual('Inter Dark')

        act(() => {
            Uniwind.updateCSSVariables('dark', { '--default-font-family': 'Inter Display' })
        })

        expect(getStylesFromId('global').fontFamily).toEqual('Inter Display')
    })

    test('catches up with theme changes while Activity is hidden', () => {
        useDefaults('Inter', 'Inter Dark')

        // Keep the child stable so a parent render cannot repair a stale font.
        const child = <Text testID="text">Hello</Text>
        const App = ({ hidden }: { hidden: boolean }) => <React.Activity mode={hidden ? 'hidden' : 'visible'}>{child}</React.Activity>
        const { getStylesFromId, rerender } = renderUniwind(<App hidden={false} />)
        expect(getStylesFromId('text').fontFamily).toEqual('Inter')

        rerender(<App hidden />)
        act(() => Uniwind.setTheme('dark'))
        rerender(<App hidden={false} />)
        expect(getStylesFromId('text').fontFamily).toEqual('Inter Dark')

        rerender(<App hidden />)
        act(() => Uniwind.updateCSSVariables('dark', { '--default-font-family': 'Inter Display' }))
        rerender(<App hidden={false} />)
        expect(getStylesFromId('text').fontFamily).toEqual('Inter Display')

        act(() => Uniwind.setTheme('light'))
        expect(getStylesFromId('text').fontFamily).toEqual('Inter')
    })

    test('catches up with theme changes while Suspense is suspended', () => {
        useDefaults('Inter', 'Inter Dark')

        const pending = { then() {} }
        const child = <TextInput testID="input" />
        const Suspender = ({ freeze }: { freeze: boolean }) => {
            if (freeze) {
                throw pending
            }

            return child
        }
        const App = ({ freeze }: { freeze: boolean }) => (
            <React.Suspense fallback={null}>
                <Suspender freeze={freeze} />
            </React.Suspense>
        )
        const { getStylesFromId, rerender } = renderUniwind(<App freeze={false} />)
        expect(getStylesFromId('input').fontFamily).toEqual('Inter')

        rerender(<App freeze />)
        act(() => Uniwind.setTheme('dark'))
        rerender(<App freeze={false} />)
        expect(getStylesFromId('input').fontFamily).toEqual('Inter Dark')
    })
})
