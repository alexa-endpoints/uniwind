import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Uniwind, useCSSVariable } from '../../../src'
import { CSSListener } from '../../../src/core/web'

// Whether the active rules CSSListener finds for a class string include the given selector.
const hasRule = (className: string, selector = `.${CSS.escape(className)}`) =>
    CSSListener.getRulesForClassName(className).some(rule => rule.selectorText === selector)

const mockMatchMedia = (media: string) => {
    const originalMatchMedia = window.matchMedia
    const mediaListeners = new Set<EventListener>()
    const mediaQueryList = {
        addEventListener: (_: string, listener: EventListener) => mediaListeners.add(listener),
        dispatchEvent: () => true,
        matches: false,
        media,
        onchange: null,
        removeEventListener: (_: string, listener: EventListener) => mediaListeners.delete(listener),
    }

    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => mediaQueryList),
    })

    return {
        mediaListeners,
        setMatches: (matches: boolean) => {
            mediaQueryList.matches = matches
            mediaListeners.forEach(mediaListener => mediaListener(new Event('change')))
        },
        restore: () => {
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                value: originalMatchMedia,
            })
        },
    }
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

test.each(['timeout', 'idle callback'])('ignores a pending %s scan after document teardown', async scheduler => {
    vi.useFakeTimers()
    vi.stubGlobal(
        'requestIdleCallback',
        scheduler === 'idle callback'
            ? (callback: VoidFunction) => setTimeout(callback, 50)
            : undefined,
    )
    vi.stubGlobal('cancelIdleCallback', (handle: number) => clearTimeout(handle))

    const style = document.createElement('style')
    style.textContent = '.accent-teardown { accent-color: rgb(255, 0, 0); }'

    const listener = vi.fn()
    const dispose = CSSListener.subscribeToClassName('accent-teardown', listener)

    try {
        document.head.appendChild(style)
        await Promise.resolve()
        expect(vi.getTimerCount()).toBeGreaterThan(0)

        vi.stubGlobal('document', undefined)

        await vi.advanceTimersByTimeAsync(50)
        expect(vi.getTimerCount()).toBe(0)
        expect(listener).not.toHaveBeenCalled()
    } finally {
        vi.unstubAllGlobals()
        dispose()
        style.remove()
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(50)
    }
})

test('notifies class subscribers after discovering a stylesheet injected later', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)

    const style = document.createElement('style')
    style.textContent = '.accent-late { accent-color: rgb(255, 0, 0); }'

    const listener = vi.fn(() => {
        const rule = CSSListener.getRulesForClassName('accent-late').find(rule => rule.selectorText === '.accent-late')
        return rule?.style.getPropertyValue('accent-color')
    })
    const dispose = CSSListener.subscribeToClassName('accent-late', listener)

    try {
        document.head.appendChild(style)
        await Promise.resolve()

        expect(listener).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(50)

        expect(listener).toHaveBeenCalledTimes(1)
        expect(listener).toHaveLastReturnedWith('rgb(255, 0, 0)')

        // A scan with no new stylesheet should not invalidate resolved styles.
        const meta = document.createElement('meta')
        document.head.appendChild(meta)
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(50)
        expect(listener).toHaveBeenCalledTimes(1)
        meta.remove()
    } finally {
        dispose()
        style.remove()
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(50)
    }
})

describe('CSSListener', () => {
    test('notifies class subscribers when a stylesheet loads, unloads, and reloads', async () => {
        const listener = vi.fn()
        const dispose = CSSListener.subscribeToClassName('remote-class', listener)
        const style = document.createElement('style')

        try {
            style.textContent = '.remote-class { background-color: rgb(250, 204, 21); }'
            document.head.appendChild(style)

            await waitFor(() => {
                expect(hasRule('remote-class')).toBe(true)
                expect(listener).toHaveBeenCalled()
            })

            listener.mockClear()
            style.remove()

            await waitFor(() => {
                expect(hasRule('remote-class')).toBe(false)
                expect(listener).toHaveBeenCalled()
            })

            listener.mockClear()
            document.head.appendChild(style)

            await waitFor(() => {
                expect(hasRule('remote-class')).toBe(true)
                expect(listener).toHaveBeenCalled()
            })
        } finally {
            dispose()
            style.remove()
        }
    })

    test('removes rules while a stylesheet is disabled', async () => {
        const listener = vi.fn()
        const dispose = CSSListener.subscribeToClassName('disabled-class', listener)
        const style = document.createElement('style')

        try {
            style.textContent = '.disabled-class { background-color: red; }'
            document.head.appendChild(style)

            await waitFor(() => {
                expect(hasRule('disabled-class')).toBe(true)
            })

            listener.mockClear()
            style.setAttribute('disabled', '')

            await waitFor(() => {
                expect(hasRule('disabled-class')).toBe(false)
                expect(listener).toHaveBeenCalled()
            })

            listener.mockClear()
            style.removeAttribute('disabled')

            await waitFor(() => {
                expect(hasRule('disabled-class')).toBe(true)
                expect(listener).toHaveBeenCalled()
            })
        } finally {
            dispose()
            style.remove()
        }
    })

    test('drops a disabled stylesheet from cached class lookups before the next scan', async () => {
        vi.useFakeTimers()
        vi.stubGlobal('requestIdleCallback', undefined)

        const style = document.createElement('style')
        style.textContent = '.cached-class { background-color: red; }'

        try {
            document.head.appendChild(style)
            await Promise.resolve()
            await vi.advanceTimersByTimeAsync(50)

            expect(CSSListener.getRulesForClassName('cached-class').map(rule => rule.selectorText)).toEqual(['.cached-class'])

            // The observer drops the sheet's rules at once and schedules a scan; the lookup must not wait for it.
            style.setAttribute('disabled', '')
            await Promise.resolve()

            expect(vi.getTimerCount()).toBeGreaterThan(0)
            expect(CSSListener.getRulesForClassName('cached-class')).toEqual([])
        } finally {
            style.remove()
            await Promise.resolve()
            await vi.advanceTimersByTimeAsync(50)
        }
    })

    test('drops a stylesheet whose media stops matching from cached class lookups before the next scan', async () => {
        const media = mockMatchMedia('(min-width: 920px)')
        const style = document.createElement('style')

        try {
            media.setMatches(true)
            style.media = '(min-width: 920px)'
            style.textContent = '.cached-sheet-media-class { background-color: red; }'
            document.head.appendChild(style)

            await waitFor(() => expect(hasRule('cached-sheet-media-class')).toBe(true))

            vi.useFakeTimers()
            vi.stubGlobal('requestIdleCallback', undefined)
            media.setMatches(false)

            expect(vi.getTimerCount()).toBeGreaterThan(0)
            expect(CSSListener.getRulesForClassName('cached-sheet-media-class')).toEqual([])
        } finally {
            if (vi.isFakeTimers()) {
                // Lets the scheduled scan run before the timers it was scheduled on go away.
                await vi.advanceTimersByTimeAsync(50)
            }

            vi.useRealTimers()
            vi.unstubAllGlobals()
            style.remove()

            await waitFor(() => expect(media.mediaListeners.size).toBe(0))
            media.restore()
        }
    })

    test('refreshes cached class lookups when a media query toggles a rule', async () => {
        const media = mockMatchMedia('(min-width: 650px)')
        const style = document.createElement('style')

        try {
            style.textContent = '@media (min-width: 650px) { .cached-media-class { background-color: blue; } }'
            document.head.appendChild(style)

            await waitFor(() => expect(media.mediaListeners.size).toBe(1))
            expect(CSSListener.getRulesForClassName('cached-media-class')).toEqual([])

            media.setMatches(true)
            expect(CSSListener.getRulesForClassName('cached-media-class').map(rule => rule.selectorText)).toEqual(['.cached-media-class'])

            media.setMatches(false)
            expect(CSSListener.getRulesForClassName('cached-media-class')).toEqual([])
        } finally {
            style.remove()

            await waitFor(() => expect(media.mediaListeners.size).toBe(0))
            media.restore()
        }
    })

    test('tracks stylesheet-level media queries', async () => {
        const originalMatchMedia = window.matchMedia
        const mediaListeners = new Set<EventListener>()
        const mediaQueryList = {
            addEventListener: (_: string, listener: EventListener) => mediaListeners.add(listener),
            dispatchEvent: () => true,
            matches: false,
            media: '(min-width: 900px)',
            onchange: null,
            removeEventListener: (_: string, listener: EventListener) => mediaListeners.delete(listener),
        }

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn(() => mediaQueryList),
        })

        const listener = vi.fn()
        const dispose = CSSListener.subscribeToClassName('sheet-media-class', listener)
        const style = document.createElement('style')

        try {
            style.media = '(min-width: 900px)'
            style.textContent = '.sheet-media-class { background-color: red; }'
            document.head.appendChild(style)

            await waitFor(() => {
                expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 900px)')
                expect(mediaListeners.size).toBe(1)
                expect(hasRule('sheet-media-class')).toBe(false)
            })

            listener.mockClear()
            mediaQueryList.matches = true
            mediaListeners.forEach(mediaListener => mediaListener(new Event('change')))

            await waitFor(() => {
                expect(hasRule('sheet-media-class')).toBe(true)
                expect(listener).toHaveBeenCalled()
            })

            listener.mockClear()
            mediaQueryList.matches = false
            mediaListeners.forEach(mediaListener => mediaListener(new Event('change')))

            await waitFor(() => {
                expect(hasRule('sheet-media-class')).toBe(false)
                expect(listener).toHaveBeenCalled()
            })
        } finally {
            dispose()
            style.remove()

            await waitFor(() => expect(mediaListeners.size).toBe(0))
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                value: originalMatchMedia,
            })
        }
    })

    test('reuses stylesheet lookups across a media-query change batch', async () => {
        const originalMatchMedia = window.matchMedia
        const mediaListeners = new Set<EventListener>()
        const mediaQueryList = {
            addEventListener: (_: string, listener: EventListener) => mediaListeners.add(listener),
            dispatchEvent: () => true,
            matches: false,
            media: '(min-width: 1000px)',
            onchange: null,
            removeEventListener: (_: string, listener: EventListener) => mediaListeners.delete(listener),
        }

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn(() => mediaQueryList),
        })

        const querySelectorAll = vi.spyOn(document, 'querySelectorAll')
        const style = document.createElement('style')
        const styleSheetSelector = 'link[rel~="stylesheet"], style'
        const styleSheetQueryCount = () =>
            querySelectorAll.mock.calls
                .filter(([selector]) => selector === styleSheetSelector)
                .length

        try {
            style.textContent = `
                @media (min-width: 1000px) {
                    .batch-class-a { background-color: red; }
                    .batch-class-b { background-color: blue; }
                }
            `
            const baselineQueryCount = styleSheetQueryCount()

            document.head.appendChild(style)

            await waitFor(() => expect(mediaListeners.size).toBe(2))

            expect(styleSheetQueryCount() - baselineQueryCount).toBeGreaterThan(0)

            querySelectorAll.mockClear()
            mediaQueryList.matches = true
            mediaListeners.forEach(mediaListener => mediaListener(new Event('change')))

            expect(styleSheetQueryCount()).toBe(1)
            expect(CSSListener.getRulesForClassName('batch-class-a batch-class-b').map(rule => rule.selectorText)).toEqual([
                '.batch-class-a',
                '.batch-class-b',
            ])
        } finally {
            style.remove()

            await waitFor(() => expect(mediaListeners.size).toBe(0))
            querySelectorAll.mockRestore()
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                value: originalMatchMedia,
            })
        }
    })

    test('retains media-query subscriptions for classes loaded later', async () => {
        const originalMatchMedia = window.matchMedia
        const mediaListeners = new Set<EventListener>()
        const mediaQueryList = {
            addEventListener: (_: string, listener: EventListener) => mediaListeners.add(listener),
            dispatchEvent: () => true,
            matches: false,
            media: '(min-width: 600px)',
            onchange: null,
            removeEventListener: (_: string, listener: EventListener) => mediaListeners.delete(listener),
        }

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn(() => mediaQueryList),
        })

        const listener = vi.fn()
        const dispose = CSSListener.subscribeToClassName('rma:md:bg-blue-500', listener)
        const style = document.createElement('style')

        try {
            style.textContent = '@media (min-width: 600px) { .rma\\:md\\:bg-blue-500 { background-color: blue; } }'
            document.head.appendChild(style)

            await waitFor(() => {
                expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 600px)')
                expect(listener).toHaveBeenCalled()
            })

            listener.mockClear()
            const snapshot = CSSListener.getSnapshot('rma:md:bg-blue-500')
            mediaQueryList.matches = true
            mediaListeners.forEach(mediaListener => mediaListener(new Event('change')))

            expect(hasRule('rma:md:bg-blue-500')).toBe(true)
            expect(listener).toHaveBeenCalled()
            expect(CSSListener.getSnapshot('rma:md:bg-blue-500')).not.toBe(snapshot)
        } finally {
            dispose()
            style.remove()

            await waitFor(() => expect(mediaListeners.size).toBe(0))
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                value: originalMatchMedia,
            })
        }
    })

    test('notifies theme-variant media-query subscribers', async () => {
        const originalMatchMedia = window.matchMedia
        const mediaListeners = new Set<EventListener>()
        const mediaQueryList = {
            addEventListener: (_: string, listener: EventListener) => mediaListeners.add(listener),
            dispatchEvent: () => true,
            matches: false,
            media: '(min-width: 700px)',
            onchange: null,
            removeEventListener: (_: string, listener: EventListener) => mediaListeners.delete(listener),
        }

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn(() => mediaQueryList),
        })

        const className = 'rma:md:dark:bg-blue-500'
        const listener = vi.fn()
        const dispose = CSSListener.subscribeToClassName(className, listener)
        const style = document.createElement('style')
        const selector = '.rma\\:md\\:dark\\:bg-blue-500:where(.dark, .dark *)'

        try {
            style.textContent = `@media (min-width: 700px) { ${selector} { background-color: blue; } }`
            document.head.appendChild(style)

            await waitFor(() => {
                expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 700px)')
                expect(listener).toHaveBeenCalled()
            })

            listener.mockClear()
            mediaQueryList.matches = true
            mediaListeners.forEach(mediaListener => mediaListener(new Event('change')))

            expect(hasRule(className, selector)).toBe(true)
            expect(listener).toHaveBeenCalledTimes(1)
        } finally {
            dispose()
            style.remove()

            await waitFor(() => expect(mediaListeners.size).toBe(0))
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                value: originalMatchMedia,
            })
        }
    })

    test('removes media-query handlers when stylesheets reload', async () => {
        const originalMatchMedia = window.matchMedia
        const mediaListeners = new Set<EventListener>()
        const mediaQueryList = {
            addEventListener: (_: string, listener: EventListener) => mediaListeners.add(listener),
            dispatchEvent: () => true,
            matches: false,
            media: '(min-width: 800px)',
            onchange: null,
            removeEventListener: (_: string, listener: EventListener) => mediaListeners.delete(listener),
        }

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn(() => mediaQueryList),
        })

        const listener = vi.fn()
        const dispose = CSSListener.subscribeToClassName('rma:lg:bg-blue-500', listener)
        const style = document.createElement('style')
        style.textContent = '@media (min-width: 800px) { .rma\\:lg\\:bg-blue-500 { background-color: blue; } }'

        try {
            document.head.appendChild(style)
            await waitFor(() => expect(mediaListeners.size).toBe(1))

            style.remove()
            await waitFor(() => expect(mediaListeners.size).toBe(0))

            document.head.appendChild(style)
            await waitFor(() => expect(mediaListeners.size).toBe(1))

            listener.mockClear()
            mediaQueryList.matches = true
            mediaListeners.forEach(mediaListener => mediaListener(new Event('change')))

            expect(listener).toHaveBeenCalledTimes(1)
        } finally {
            dispose()
            style.remove()

            await waitFor(() => expect(mediaListeners.size).toBe(0))
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                value: originalMatchMedia,
            })
        }
    })

    test('updates public CSS variable APIs as a remote stylesheet loads and unloads', async () => {
        const variableName = '--rma-color-mf-shared'
        const style = document.createElement('style')
        const { result } = renderHook(() => useCSSVariable(variableName))

        expect(Uniwind.getCSSVariable(variableName)).toBe('')
        expect(result.current).toBe('')

        try {
            style.textContent = `.light, .light * { ${variableName}: #facc15; }`
            act(() => document.head.appendChild(style))

            await waitFor(() => {
                expect(Uniwind.getCSSVariable(variableName)).toBe('#facc15')
                expect(result.current).toBe('#facc15')
            })

            act(() => style.remove())

            await waitFor(() => {
                expect(Uniwind.getCSSVariable(variableName)).toBe('')
                expect(result.current).toBe('')
            })
        } finally {
            style.remove()
        }
    })
})
