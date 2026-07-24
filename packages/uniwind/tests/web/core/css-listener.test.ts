import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Uniwind, useCSSVariable } from '../../../src'
import { CSSListener } from '../../../src/core/web'

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
        const rule = Array.from(CSSListener.activeRules).find(rule => rule.selectorText === '.accent-late')
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
        style.textContent = '.remote-class { background-color: rgb(250, 204, 21); }'
        document.head.appendChild(style)

        await waitFor(() => {
            expect(Array.from(CSSListener.activeRules).some(rule => rule.selectorText === '.remote-class')).toBe(true)
            expect(listener).toHaveBeenCalled()
        })

        listener.mockClear()
        style.remove()

        await waitFor(() => {
            expect(Array.from(CSSListener.activeRules).some(rule => rule.selectorText === '.remote-class')).toBe(false)
            expect(listener).toHaveBeenCalled()
        })

        listener.mockClear()
        document.head.appendChild(style)

        await waitFor(() => {
            expect(Array.from(CSSListener.activeRules).some(rule => rule.selectorText === '.remote-class')).toBe(true)
            expect(listener).toHaveBeenCalled()
        })

        dispose()
        style.remove()
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

            expect(Array.from(CSSListener.activeRules).some(rule => rule.selectorText === '.rma\\:md\\:bg-blue-500')).toBe(true)
            expect(listener).toHaveBeenCalled()
            expect(CSSListener.getSnapshot('rma:md:bg-blue-500')).not.toBe(snapshot)
        } finally {
            dispose()
            style.remove()
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
