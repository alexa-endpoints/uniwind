import { act } from '@testing-library/react-native'
import * as React from 'react'
import { unstable_TextAncestorContext as TextAncestorContext } from 'react-native'
import { StyleDependency } from '../../../src/common/consts'
import Text from '../../../src/components/native/Text'
import TextInput from '../../../src/components/native/TextInput'
import { ScopedTheme } from '../../../src/components/ScopedTheme/ScopedTheme.native'
import { ScopedVariables } from '../../../src/components/ScopedVariables/ScopedVariables.native'
import { Uniwind } from '../../../src/core'
import { UniwindListener } from '../../../src/core/listener'
import { UniwindStore } from '../../../src/core/native'
import * as variableValue from '../../../src/hooks/useCSSVariable/getVariableValue'
import { registerHostStyles } from '../registerHostStyles'
import { renderUniwind } from '../utils'

const getVar = (theme: 'light' | 'dark', name: string) => {
    const vars = UniwindStore.vars[theme]

    return vars?.[name]?.(vars)
}

// React Native's Text provides this context to its children; the Jest mock does not.
const NestedText = ({ children }: React.PropsWithChildren) => <TextAncestorContext value>{children}</TextAncestorContext>

// Gives every element its own Profiler, so a count is the number of elements that re-rendered.
const renderCountingRerenders = (elements: Array<React.ReactElement>) => {
    let rerenders = 0
    const onRender: React.ProfilerOnRenderCallback = (_id, phase) => {
        if (phase !== 'mount') {
            rerenders += 1
        }
    }
    const result = renderUniwind(
        <React.Fragment>
            {elements.map((element, index) => (
                <React.Profiler key={index} id={String(index)} onRender={onRender}>
                    {element}
                </React.Profiler>
            ))}
        </React.Fragment>,
    )

    return {
        ...result,
        countRerenders: (update: () => void) => {
            rerenders = 0
            act(update)

            return rerenders
        },
    }
}

const classlessText = (count: number) => Array.from({ length: count }, (_, index) => <Text key={index}>Hello</Text>)

const listenerCounts = () => {
    const listeners = (UniwindListener as unknown as { listeners: Record<StyleDependency, Set<unknown>> }).listeners

    return Object.fromEntries(Object.entries(listeners).map(([dependency, set]) => [dependency, set.size]))
}

// Dependencies of every subscription made while rendering; classless useStyle subscribes to none.
const renderSubscriptions = (element: React.ReactElement) => {
    const subscribe = jest.spyOn(UniwindListener, 'subscribe')

    try {
        renderUniwind(element)

        return subscribe.mock.calls.map(([, dependencies]) => dependencies).filter(dependencies => dependencies.length > 0)
    } finally {
        subscribe.mockRestore()
    }
}

// Calls of the hooks that mount a store or a passive effect, which Text and TextInput never needed. Components read
// them from React's own exports, which `import * as React` only copies.
const renderPassiveHookCalls = (element: React.ReactElement) => {
    const react = jest.requireActual<typeof React>('react')
    const hooks = { useSyncExternalStore: jest.spyOn(react, 'useSyncExternalStore'), useEffect: jest.spyOn(react, 'useEffect') }

    try {
        renderUniwind(element)

        return Object.fromEntries(Object.entries(hooks).map(([name, hook]) => [name, hook.mock.calls.length]))
    } finally {
        Object.values(hooks).forEach(hook => hook.mockRestore())
    }
}

const textAndInputs = (
    <React.Fragment>
        <Text>Hello</Text>
        <Text className="font-[Georgia]">Hello</Text>
        <TextInput />
        <NestedText>
            <Text>Nested</Text>
            <TextInput />
        </NestedText>
    </React.Fragment>
)

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

    describe('while the option is off', () => {
        test('starts no root text or input from a single-family theme default', () => {
            useDefaults('Inter')

            const { getStylesFromId } = renderUniwind(
                <React.Fragment>
                    <Text testID="text">Hello</Text>
                    <TextInput testID="input" />
                    <NestedText>
                        <TextInput testID="nested-input" />
                    </NestedText>
                    <ScopedTheme theme="dark">
                        <Text testID="scoped">Hello</Text>
                    </ScopedTheme>
                </React.Fragment>,
            )

            for (const id of ['text', 'input', 'nested-input', 'scoped']) {
                expect(getStylesFromId(id).fontFamily).toBeUndefined()
            }
        })

        test('passes the style arrays React Native received before the option existed', () => {
            useDefaults('Inter')

            const { getByTestId } = renderUniwind(
                <React.Fragment>
                    <Text className="p-4" style={{ color: 'red' }} testID="text">Hello</Text>
                    <Text testID="classless">Hello</Text>
                    <TextInput style={{ color: 'red' }} testID="input" />
                </React.Fragment>,
            )

            expect(getByTestId('text').props.style).toStrictEqual([{ padding: 16 }, { color: 'red' }])
            expect(getByTestId('classless').props.style).toStrictEqual([{}, undefined])
            expect(getByTestId('input').props.style).toStrictEqual([{}, { color: 'red' }])
        })

        test('subscribes root text and inputs to nothing', () => {
            useDefaults('Inter')

            const before = listenerCounts()
            const subscriptions = renderSubscriptions(
                <React.Fragment>
                    {classlessText(10)}
                    <TextInput />
                    <ScopedTheme theme="dark">
                        <Text>Scoped</Text>
                    </ScopedTheme>
                </React.Fragment>,
            )

            expect(subscriptions).toEqual([])
            expect(listenerCounts()).toEqual(before)
        })

        test('re-renders no root text when the theme default changes', () => {
            const { countRerenders } = renderCountingRerenders([...classlessText(100), <TextInput />])

            expect(countRerenders(() => Uniwind.updateCSSVariables('light', { '--default-font-family': 'Inter' }))).toBe(0)
            expect(countRerenders(() => Uniwind.setTheme('dark'))).toBe(0)
        })

        test('mounts text and inputs without a store or a passive effect', () => {
            useDefaults('Inter')

            expect(renderPassiveHookCalls(textAndInputs)).toEqual({ useSyncExternalStore: 0, useEffect: 0 })
        })
    })

    describe('while the option is on', () => {
        beforeAll(() => act(() => registerHostStyles({ defaultFontFamily: true })))

        afterAll(() => act(() => registerHostStyles()))

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

        test('strips one pair of matching quotes from a family set at runtime', () => {
            useDefaults('"Inter"', '  \'Inter Dark\'  ')

            const { getStylesFromId } = renderUniwind(
                <React.Fragment>
                    <Text testID="text">Hello</Text>
                    <TextInput testID="input" />
                    <ScopedVariables variables={{ '--default-font-family': '"O\'Reilly Sans"' }}>
                        <Text testID="scoped">Hello</Text>
                    </ScopedVariables>
                </React.Fragment>,
            )

            expect(getStylesFromId('text').fontFamily).toEqual('Inter')
            expect(getStylesFromId('input').fontFamily).toEqual('Inter')
            expect(getStylesFromId('scoped').fontFamily).toEqual('O\'Reilly Sans')

            act(() => {
                Uniwind.setTheme('dark')
            })

            expect(getStylesFromId('text').fontFamily).toEqual('Inter Dark')
        })

        test('keeps the platform default for quoted fallback lists and empty quotes', () => {
            for (const value of ['"Inter", sans-serif', '\'Inter\', \'Roboto\'', '""', '\' \'']) {
                useDefaults(value)

                const { getStylesFromId, unmount } = renderUniwind(<Text testID="text">Hello</Text>)

                expect(getStylesFromId('text').fontFamily).toBeUndefined()
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

        test('passes the style array unchanged when no default font applies', () => {
            const { getByTestId } = renderUniwind(
                <React.Fragment>
                    <Text className="p-4" style={{ color: 'red' }} testID="text">Hello</Text>
                    <TextInput testID="input" />
                    <NestedText>
                        <Text testID="nested">Hello</Text>
                    </NestedText>
                </React.Fragment>,
            )

            expect(getByTestId('text').props.style).toStrictEqual([{ padding: 16 }, { color: 'red' }])
            expect(getByTestId('input').props.style).toStrictEqual([{}, undefined])
            expect(getByTestId('nested').props.style).toStrictEqual([{}, undefined])
        })

        test('adds the default font to the generated style', () => {
            useDefaults('Inter')

            const { getByTestId, rerender } = renderUniwind(
                <React.Fragment>
                    <Text className="p-4" style={{ color: 'red' }} testID="text">Hello</Text>
                    <TextInput testID="input" />
                </React.Fragment>,
            )
            const [style] = getByTestId('text').props.style

            expect(getByTestId('text').props.style).toStrictEqual([{ padding: 16, fontFamily: 'Inter' }, { color: 'red' }])
            expect(getByTestId('input').props.style).toStrictEqual([{ fontFamily: 'Inter' }, undefined])

            rerender(
                <React.Fragment>
                    <Text className="p-4" style={{ color: 'blue' }} testID="text">Hello</Text>
                    <TextInput testID="input" />
                </React.Fragment>,
            )

            // The same object while neither the generated style nor the family changes.
            expect(getByTestId('text').props.style[0]).toBe(style)
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

        test('subscribes and re-renders no text whose className sets a family when only the default changes', () => {
            useDefaults('Inter', 'Inter Dark')

            const before = listenerCounts()
            const { countRerenders, getStylesFromId } = renderCountingRerenders([
                <Text className="font-[Georgia]" testID="text">Hello</Text>,
                <TextInput className="font-[Georgia]" testID="input" />,
            ])
            const after = listenerCounts()

            expect(after[StyleDependency.Theme]).toBe(before[StyleDependency.Theme])
            expect(after[StyleDependency.Variables]).toBe(before[StyleDependency.Variables])
            expect(countRerenders(() => Uniwind.setTheme('dark'))).toBe(0)
            expect(countRerenders(() => Uniwind.updateCSSVariables('dark', { '--default-font-family': 'Inter Display' }))).toBe(0)
            expect(getStylesFromId('text').fontFamily).toEqual('Georgia')
            expect(getStylesFromId('input').fontFamily).toEqual('Georgia')
        })

        test('resolves the default family once per scope for each change', () => {
            useDefaults('Inter', 'Inter Dark')

            const getVariableValue = jest.spyOn(variableValue, 'getVariableValue')

            try {
                renderUniwind(
                    <React.Fragment>
                        {classlessText(100)}
                        <ScopedVariables variables={{ '--unrelated': '#ffffff' }}>
                            {classlessText(50)}
                        </ScopedVariables>
                        <ScopedTheme theme="dark">
                            {classlessText(50)}
                        </ScopedTheme>
                    </React.Fragment>,
                )

                expect(getVariableValue).toHaveBeenCalledTimes(3)

                getVariableValue.mockClear()
                act(() => Uniwind.setTheme('dark'))

                // Scoped-theme text ignores the global theme.
                expect(getVariableValue).toHaveBeenCalledTimes(2)

                getVariableValue.mockClear()
                act(() => Uniwind.updateCSSVariables('dark', { '--default-font-family': 'Inter Display' }))

                expect(getVariableValue).toHaveBeenCalledTimes(3)
            } finally {
                getVariableValue.mockRestore()
            }
        })

        test('mounts text and inputs without a store or a passive effect', () => {
            useDefaults('Inter')

            expect(renderPassiveHookCalls(textAndInputs)).toEqual({ useSyncExternalStore: 0, useEffect: 0 })
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

        test('re-renders no root text when an update leaves the stock fallback list in place', () => {
            const { countRerenders } = renderCountingRerenders(classlessText(2000))

            expect(countRerenders(() => Uniwind.updateCSSVariables('light', { '--unrelated': '#ffffff' }))).toBe(0)
            expect(countRerenders(() => Uniwind.setTheme('dark'))).toBe(0)
        })

        test('re-renders root text only when its family changes', () => {
            useDefaults('Inter')

            const { countRerenders } = renderCountingRerenders([...classlessText(1999), <TextInput testID="input" />])

            expect(countRerenders(() => Uniwind.updateCSSVariables('light', { '--unrelated': '#ffffff' }))).toBe(0)
            expect(countRerenders(() => Uniwind.setTheme('dark'))).toBe(0)
            expect(countRerenders(() => Uniwind.updateCSSVariables('dark', { '--default-font-family': 'Inter Display' }))).toBe(2000)
        })

        test('re-renders no scoped-theme text on a global theme change', () => {
            useDefaults('Inter', 'Inter Dark')

            const { countRerenders, getStylesFromId } = renderCountingRerenders([
                <Text testID="global">Hello</Text>,
                <ScopedTheme theme="dark">
                    <Text testID="scoped">Hello</Text>
                </ScopedTheme>,
            ])

            expect(countRerenders(() => Uniwind.setTheme('dark'))).toBe(1)
            expect(getStylesFromId('global').fontFamily).toEqual('Inter Dark')
            expect(getStylesFromId('scoped').fontFamily).toEqual('Inter Dark')
        })

        test('subscribes scoped-theme text to variables only and nested text to nothing', () => {
            const subscribe = jest.spyOn(UniwindListener, 'subscribe')

            renderUniwind(
                <React.Fragment>
                    <Text>Root</Text>
                    <TextInput />
                    <ScopedTheme theme="dark">
                        <Text>Scoped</Text>
                    </ScopedTheme>
                    <NestedText>
                        <Text>Nested</Text>
                    </NestedText>
                </React.Fragment>,
            )

            // Classless useStyle subscribes to no dependencies.
            const subscriptions = subscribe.mock.calls.map(([, dependencies]) => dependencies).filter(dependencies => dependencies.length > 0)
            subscribe.mockRestore()

            expect(subscriptions).toEqual([
                [StyleDependency.Theme, StyleDependency.Variables],
                [StyleDependency.Theme, StyleDependency.Variables],
                [StyleDependency.Variables],
            ])
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

        test('catches up with theme changes while Activity hides text that re-rendered since mount', () => {
            useDefaults('Inter', 'Inter Dark')

            // Memoized so only a label change renders the text, never a hide or reveal.
            const Label = React.memo(({ label }: { label: string }) => <Text testID="text">{label}</Text>)
            const App = ({ hidden, label }: { hidden: boolean; label: string }) => (
                <React.Activity mode={hidden ? 'hidden' : 'visible'}>
                    <Label label={label} />
                </React.Activity>
            )
            const { getStylesFromId, rerender } = renderUniwind(<App hidden={false} label="Hello" />)

            rerender(<App hidden={false} label="Hello again" />)
            rerender(<App hidden label="Hello again" />)
            act(() => Uniwind.setTheme('dark'))
            rerender(<App hidden={false} label="Hello again" />)
            expect(getStylesFromId('text').fontFamily).toEqual('Inter Dark')
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

    describe('when the host registration changes the option', () => {
        // Runs before Testing Library unmounts the tree.
        afterEach(() => act(() => registerHostStyles()))

        test('drops the default from mounted root text when a registration turns it off', async () => {
            await act(() => registerHostStyles({ defaultFontFamily: true }))
            useDefaults('Inter')

            const unmounted = listenerCounts()
            const { getStylesFromId } = renderUniwind(
                <React.Fragment>
                    <Text testID="text">Hello</Text>
                    <TextInput testID="input" />
                </React.Fragment>,
            )

            expect(getStylesFromId('text').fontFamily).toEqual('Inter')
            expect(getStylesFromId('input').fontFamily).toEqual('Inter')
            expect(listenerCounts()).not.toEqual(unmounted)

            // Only the registration re-renders the elements here.
            await act(() => registerHostStyles())
            useDefaults('Inter')

            expect(getStylesFromId('text').fontFamily).toBeUndefined()
            expect(getStylesFromId('input').fontFamily).toBeUndefined()
            expect(listenerCounts()).toEqual(unmounted)
        })

        test('starts text from the default once a registration turns it on', async () => {
            useDefaults('Inter')

            const { getStylesFromId, rerender } = renderUniwind(<Text testID="text">Hello</Text>)

            expect(getStylesFromId('text').fontFamily).toBeUndefined()

            await act(() => registerHostStyles({ defaultFontFamily: true }))
            useDefaults('Inter')
            rerender(<Text testID="text">Hello again</Text>)

            expect(getStylesFromId('text').fontFamily).toEqual('Inter')

            act(() => Uniwind.updateCSSVariables('light', { '--default-font-family': 'Inter Display' }))

            expect(getStylesFromId('text').fontFamily).toEqual('Inter Display')
        })
    })
})
