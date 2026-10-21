import { render } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, test, vi } from 'vitest'
import { ScopedVariables } from '../../../src'
import { getWebStyles, getWebVariable } from '../../../src/core/web'
import { useCSSVariable } from '../../../src/hooks/useCSSVariable'

// The hidden element getWebStyles and getWebVariable resolve against, found through the class getWebStyles gives its child.
const getProbeParent = () => {
    getWebStyles('scoped-variables-probe', undefined, { scopedTheme: null, rtl: null, variables: null })

    return document.querySelector('.scoped-variables-probe')!.parentElement!
}

describe('ScopedVariables (web)', () => {
    test('scoped custom property resolves on a child, falls back outside', () => {
        const outside = vi.fn()
        const inside = vi.fn()

        const Probe = ({ test }: { test: (value: string | number | undefined) => void }) => {
            test(useCSSVariable('--color-primary'))

            return null
        }

        render(
            <React.Fragment>
                <Probe test={outside} />
                <ScopedVariables variables={{ '--color-primary': '#3b82f6' }}>
                    <Probe test={inside} />
                </ScopedVariables>
            </React.Fragment>,
        )

        // Not defined by the theme in the web test env -> empty string
        expect(outside).toHaveBeenCalledWith('')
        // Inside the provider the scoped value resolves through the DOM cascade
        expect(inside).toHaveBeenCalledWith('#3b82f6')
    })

    test('useCSSVariable reflects an updated variables prop through the cascade', () => {
        const seen: Array<string | number | undefined> = []

        const Probe = () => {
            seen.push(useCSSVariable('--color-primary'))

            return null
        }

        const Wrapper = ({ color }: { color: string }) => (
            <ScopedVariables variables={{ '--color-primary': color }}>
                <Probe />
            </ScopedVariables>
        )

        const { rerender } = render(<Wrapper color="#3b82f6" />)

        rerender(<Wrapper color="#ff0000" />)

        // Mounts with the initial value, then reflects the updated prop
        expect(seen[0]).toEqual('#3b82f6')
        expect(seen.at(-1)).toEqual('#ff0000')
    })

    test('nested providers inherit ancestors and the nearest wins', () => {
        const values: Array<Record<string, string | number | undefined>> = []

        const Probe = () => {
            values.push({
                primary: useCSSVariable('--color-primary'),
                gap: useCSSVariable('--gap'),
            })

            return null
        }

        render(
            <ScopedVariables variables={{ '--color-primary': '#3b82f6', '--gap': 8 }}>
                <Probe />
                <ScopedVariables variables={{ '--color-primary': '#ff0000' }}>
                    <Probe />
                </ScopedVariables>
            </ScopedVariables>,
        )

        const [outer, inner] = values

        expect(outer).toEqual({ primary: '#3b82f6', gap: '8px' })
        // Inner overrides the color but inherits --gap from the ancestor
        expect(inner).toEqual({ primary: '#ff0000', gap: '8px' })
    })

    test('renders a display:contents wrapper around children', () => {
        const { getByText } = render(
            <ScopedVariables variables={{ '--color-primary': '#3b82f6' }}>
                <span>scoped content</span>
            </ScopedVariables>,
        )

        expect(getByText('scoped content').parentElement).toHaveStyle({ display: 'contents' })
    })

    test('applies the variables as inline custom properties on the wrapper', () => {
        const { getByText } = render(
            <ScopedVariables variables={{ '--color-primary': '#3b82f6', '--gap': 8 }}>
                <span>scoped content</span>
            </ScopedVariables>,
        )

        const wrapper = getByText('scoped content').parentElement!

        expect(wrapper.style.getPropertyValue('--color-primary')).toEqual('#3b82f6')
        // Numbers are converted to px, matching updateCSSVariables on web
        expect(wrapper.style.getPropertyValue('--gap')).toEqual('8px')
    })

    test('nested wrappers each carry only their own overrides inline', () => {
        const { getByText } = render(
            <ScopedVariables variables={{ '--color-primary': '#3b82f6', '--gap': 8 }}>
                <ScopedVariables variables={{ '--color-primary': '#ff0000' }}>
                    <span>inner content</span>
                </ScopedVariables>
            </ScopedVariables>,
        )

        const innerWrapper = getByText('inner content').parentElement!

        expect(innerWrapper.style.getPropertyValue('--color-primary')).toEqual('#ff0000')
        // Inner does not redeclare --gap; it inherits through the cascade
        expect(innerWrapper.style.getPropertyValue('--gap')).toEqual('')
    })

    test('invalid keys are not written to the wrapper inline styles', () => {
        const { getByText } = render(
            <ScopedVariables variables={{ 'color-primary': '#3b82f6', '--gap': 8 }}>
                <span>scoped content</span>
            </ScopedVariables>,
        )

        const wrapper = getByText('scoped content').parentElement!

        expect(wrapper.style.getPropertyValue('color-primary')).toEqual('')
        expect(wrapper.style.getPropertyValue('--gap')).toEqual('8px')
    })

    test('getWebVariable applies number values as px and drops them for a read without them', () => {
        expect(
            getWebVariable('--gap', { scopedTheme: null, rtl: null, variables: { '--gap': 8 } }),
        ).toEqual('8px')

        // A read without scoped variables removes them from the dummy parent, so it falls back
        expect(
            getWebVariable('--gap', { scopedTheme: null, rtl: null, variables: null }),
        ).toEqual('')
    })

    test('reads with unchanged scoped variables leave the probe styles untouched', () => {
        const probeParent = getProbeParent()
        const context = { scopedTheme: null, rtl: null, variables: { '--color-primary': '#3b82f6', '--gap': 8 } }

        expect(getWebVariable('--gap', context)).toEqual('8px')

        const setProperty = vi.spyOn(probeParent.style, 'setProperty')
        const removeProperty = vi.spyOn(probeParent.style, 'removeProperty')

        try {
            expect(getWebVariable('--gap', context)).toEqual('8px')
            expect(getWebVariable('--color-primary', { ...context, variables: { ...context.variables } })).toEqual('#3b82f6')
            getWebStyles('scoped-variables-probe', undefined, context)

            expect(setProperty).not.toHaveBeenCalled()
            expect(removeProperty).not.toHaveBeenCalled()
        } finally {
            setProperty.mockRestore()
            removeProperty.mockRestore()
        }
    })

    test('switching scopes removes the previous scope\'s variables and applies changed values', () => {
        const probeParent = getProbeParent()
        const outer = { scopedTheme: null, rtl: null, variables: { '--color-primary': '#3b82f6', '--gap': 8 } as Record<string, string | number> }
        const inner = { scopedTheme: null, rtl: null, variables: { '--color-primary': '#ff0000' } }

        expect(getWebVariable('--gap', outer)).toEqual('8px')
        expect(getWebVariable('--color-primary', inner)).toEqual('#ff0000')
        expect(getWebVariable('--gap', inner)).toEqual('')
        expect(probeParent.style.getPropertyValue('--gap')).toEqual('')

        // A value changed in place on the same variables object is applied too.
        outer.variables['--gap'] = 12

        expect(getWebVariable('--gap', outer)).toEqual('12px')
        expect(getWebVariable('--color-primary', outer)).toEqual('#3b82f6')

        expect(getWebVariable('--gap', { scopedTheme: null, rtl: null, variables: null })).toEqual('')
        expect(probeParent.style.getPropertyValue('--color-primary')).toEqual('')
    })
})
