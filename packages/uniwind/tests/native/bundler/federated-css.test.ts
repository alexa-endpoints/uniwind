import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import { compileCSS } from '../../../src/bundler/css-compiler'
import { compileNativeCSS } from '../../../src/bundler/css-compiler/compileNativeCSS'
import { Platform, StyleDependency } from '../../../src/common/consts'
import { UniwindListener } from '../../../src/core/listener'
import { Logger } from '../../../src/core/logger'
import { UniwindStore } from '../../../src/core/native'
import type { ComponentState, GenerateStyleSheetsCallback, UniwindContextType } from '../../../src/core/types'

const context = {
    rtl: null,
    scopedTheme: null,
} satisfies UniwindContextType

const compileRegistration = (css: string, federated: boolean): GenerateStyleSheetsCallback => {
    const config = UniwindBundlerConfig.fromMetroConfig(
        {
            cssEntryFile: './unused.css',
            ...(federated
                ? {
                    federation: {
                        role: 'remote' as const,
                        id: 'remote-a',
                    },
                }
                : {}),
        },
        Platform.iOS,
    )
    const virtualCode = compileNativeCSS(config, css)

    return rt => {
        // oxlint-disable-next-line no-eval
        return eval(`(${virtualCode})`)
    }
}

describe('federated native CSS', () => {
    test('resolves host-owned runtime globals without remote conflicts', () => {
        const warn = jest.spyOn(Logger, 'warn').mockImplementation()

        UniwindStore.reinit(compileRegistration('', false), ['light', 'dark'])
        const dispose = UniwindStore.merge(
            'remote-a',
            compileRegistration('.runtime-globals { color: currentColor; width: 1em; }', true),
            ['light', 'dark'],
        )

        expect(UniwindStore.getStyles('runtime-globals', undefined, undefined, context).styles).toMatchObject({
            color: '#000000',
            width: 16,
        })
        expect(warn).not.toHaveBeenCalled()

        dispose()
        warn.mockRestore()
    })

    test('cascades remote rules as if the remote stylesheet followed the host stylesheet', () => {
        const hostCSS = `
            @layer theme, base, components, utilities;
            @layer components {
                .host-card { opacity: 0.1; }
                .host-card-important { opacity: 0.15 !important; }
            }
            @layer utilities {
                .host-faint { opacity: 0.2; }
                .host-pressed:active { opacity: 0.3; }
                .host-important { opacity: 0.4 !important; }
            }
            .host-unlayered { opacity: 0.5; }
        `
        // Declares the host's layers in another order, which the host's declaration overrides, and a new layer.
        const remoteCSS = `
            @layer utilities, components, remote;
            @layer utilities {
                .rma\\:faint { opacity: 0.6; }
                .rma\\:pressed:active { opacity: 0.7; }
                .rma\\:important { opacity: 0.8 !important; }
            }
            @layer components {
                .rma\\:card { opacity: 0.85; }
            }
            @layer remote {
                .rma\\:layer { opacity: 0.9; }
            }
            .rma\\:unlayered { opacity: 0.95; }
        `
        const classNames = [
            'host-card',
            'host-card-important',
            'host-faint',
            'host-pressed',
            'host-important',
            'host-unlayered',
            'rma:faint',
            'rma:pressed',
            'rma:important',
            'rma:card',
            'rma:layer',
            'rma:unlayered',
        ]
        const resolveAll = () =>
            classNames.flatMap(first =>
                classNames.filter(second => second !== first).flatMap(second =>
                    [{}, { isPressed: true }].map(state => [
                        `${first} ${second} ${JSON.stringify(state)}`,
                        UniwindStore.getStyles(`${first} ${second}`, undefined, state, context).styles.opacity,
                    ])
                )
            )
        const opacity = (className: string, state?: ComponentState) => UniwindStore.getStyles(className, undefined, state, context).styles.opacity

        UniwindStore.reinit(compileRegistration(hostCSS + remoteCSS, false), ['light', 'dark'])
        const concatenated = resolveAll()

        UniwindStore.reinit(compileRegistration(hostCSS, false), ['light', 'dark'])
        const dispose = UniwindStore.merge('remote-a', compileRegistration(remoteCSS, true), ['light', 'dark'])

        try {
            expect(resolveAll()).toEqual(concatenated)
            // Same layer and specificity: the remote follows the host.
            expect(opacity('rma:faint host-faint')).toBe(0.6)
            expect(opacity('host-faint rma:faint')).toBe(0.6)
            expect(opacity('rma:faint host-pressed', { isPressed: true })).toBe(0.3)
            expect(opacity('host-pressed rma:pressed', { isPressed: true })).toBe(0.7)
            // Layers merge by name in the order the host declared them; new remote layers follow them.
            expect(opacity('rma:card host-faint')).toBe(0.2)
            expect(opacity('host-faint rma:layer')).toBe(0.9)
            expect(opacity('rma:layer host-unlayered')).toBe(0.5)
            // Important declarations outrank every normal one and reverse layer order.
            expect(opacity('host-pressed rma:important', { isPressed: true })).toBe(0.8)
            expect(opacity('rma:important host-card-important')).toBe(0.15)
        } finally {
            dispose()
        }
    })

    test('matches remote media, state, theme and data variants through generated predicates', async () => {
        const directory = mkdtempSync(path.join(process.cwd(), '.tmp-federated-remote-'))
        const cssPath = path.join(directory, 'remote.css')
        const originalScreen = UniwindStore.runtime.screen
        const setWidth = (width: number) => {
            UniwindStore.runtime.screen = { ...originalScreen, width }
            UniwindListener.notify([StyleDependency.Dimensions])
        }

        writeFileSync(
            cssPath,
            [
                '@layer theme, base, components, utilities;',
                '@import "tailwindcss/theme.css" layer(theme) prefix(rma);',
                '@import "tailwindcss/utilities.css" layer(utilities) prefix(rma);',
                '@import "uniwind";',
                '@source inline("rma:opacity-25 rma:md:opacity-50 rma:active:opacity-75 rma:dark:opacity-90 rma:data-[state=open]:opacity-60");',
            ].join('\n'),
        )

        UniwindStore.reinit(
            compileRegistration('@layer utilities { .host-faint { opacity: 0.2; } .host-pressed:active { opacity: 0.3; } }', false),
            ['light', 'dark'],
        )

        try {
            const config = UniwindBundlerConfig.fromMetroConfig(
                {
                    cssEntryFile: path.relative(process.cwd(), cssPath),
                    federation: { role: 'remote', id: 'remote-a' },
                },
                Platform.iOS,
            )
            const virtualCode = await compileCSS(config)
            // oxlint-disable-next-line no-eval
            const dispose = UniwindStore.merge('remote-a', rt => eval(`(${virtualCode})`), ['light', 'dark'])
            const opacity = (className: string, state?: ComponentState, props?: Record<string, unknown>, scopedTheme: string | null = null) =>
                UniwindStore.getStyles(className, props, state, { ...context, scopedTheme }).styles.opacity

            try {
                setWidth(767)
                expect(opacity('rma:md:opacity-50')).toBeUndefined()
                expect(opacity('host-pressed rma:md:opacity-50', { isPressed: true })).toBe(0.3)
                setWidth(768)
                expect(opacity('rma:md:opacity-50')).toBe(0.5)
                expect(opacity('host-pressed rma:md:opacity-50')).toBe(0.5)
                expect(opacity('host-pressed rma:md:opacity-50', { isPressed: true })).toBe(0.3)

                expect(opacity('rma:active:opacity-75')).toBeUndefined()
                expect(opacity('rma:active:opacity-75 host-pressed', { isPressed: true })).toBe(0.75)
                expect(opacity('host-faint rma:opacity-25')).toBe(0.25)

                expect(opacity('rma:dark:opacity-90', undefined, undefined, 'light')).toBeUndefined()
                expect(opacity('rma:dark:opacity-90', undefined, undefined, 'dark')).toBe(0.9)

                expect(opacity('rma:data-[state=open]:opacity-60', undefined, { 'data-state': 'closed' })).toBeUndefined()
                expect(opacity('rma:data-[state=open]:opacity-60', undefined, { 'data-state': 'open' })).toBe(0.6)
            } finally {
                dispose()
            }
        } finally {
            setWidth(originalScreen.width)
            rmSync(directory, { force: true, recursive: true })
        }
    })
})
