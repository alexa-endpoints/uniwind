import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import { compileCSS } from '../../../src/bundler/css-compiler'
import { compileNativeCSS } from '../../../src/bundler/css-compiler/compileNativeCSS'
import { Platform } from '../../../src/common/consts'
import { Logger } from '../../../src/core/logger'
import { UniwindStore } from '../../../src/core/native'
import type { GenerateStyleSheetsCallback, UniwindContextType } from '../../../src/core/types'
import { TW_RED_500 } from '../../consts'

const context = {
    rtl: null,
    scopedTheme: null,
    variables: null,
} satisfies UniwindContextType

const toRegistration = (virtualCode: string): GenerateStyleSheetsCallback => rt => new Function('rt', `return (${virtualCode})`)(rt)

const compileRegistration = (css: string, federated: boolean): GenerateStyleSheetsCallback => {
    const config = UniwindBundlerConfig.fromMetroConfig(
        {
            cssEntryFile: './unused.css',
            ...(federated
                ? {
                    experimental: {
                        federation: {
                            role: 'remote' as const,
                            id: 'remote-a',
                        },
                    },
                }
                : {}),
        },
        Platform.iOS,
    )

    return toRegistration(compileNativeCSS(config, css))
}

describe('federated native CSS', () => {
    test('keeps runtime globals in a federation host build', () => {
        const config = UniwindBundlerConfig.fromMetroConfig(
            {
                cssEntryFile: './unused.css',
                experimental: {
                    federation: {
                        role: 'host',
                    },
                },
            },
            Platform.iOS,
        )
        const virtualCode = compileNativeCSS(config, '')

        expect(virtualCode).toContain('currentColor')
        expect(virtualCode).toContain('"--uniwind-em"')
    })

    test('resolves host-owned runtime globals without remote conflicts', () => {
        const warn = jest.spyOn(Logger, 'warn').mockImplementation()
        let dispose = () => {}

        try {
            UniwindStore.reinit(compileRegistration('', false), ['light', 'dark'])
            dispose = UniwindStore.merge(
                'remote-a',
                compileRegistration('.runtime-globals { color: currentColor; width: 1em; }', true),
                ['light', 'dark'],
            )

            expect(UniwindStore.getStyles('runtime-globals', undefined, undefined, context).styles).toMatchObject({
                color: '#000000',
                width: 16,
            })
            expect(warn).not.toHaveBeenCalled()
        } finally {
            dispose()
            warn.mockRestore()
        }
    })

    test('merges a Tailwind-compiled remote that follows the prefix contract without conflicts', async () => {
        const directory = mkdtempSync(path.join(process.cwd(), '.tmp-federated-remote-'))
        const remoteCSSPath = path.join(directory, 'remote.css')
        const warn = jest.spyOn(Logger, 'warn').mockImplementation()
        let dispose = () => {}

        writeFileSync(
            remoteCSSPath,
            [
                '@layer theme, base, components, utilities;',
                '@import "tailwindcss/theme.css" layer(theme) prefix(rmt);',
                '@import "tailwindcss/utilities.css" layer(utilities) prefix(rmt);',
                '@import "uniwind";',
                '@source inline("rmt:bg-red-500");',
            ].join('\n'),
        )

        try {
            const host = await compileCSS(
                UniwindBundlerConfig.fromMetroConfig(
                    { cssEntryFile: './tests/test.css', experimental: { federation: { role: 'host' } } },
                    Platform.iOS,
                ),
            )
            const remote = await compileCSS(
                UniwindBundlerConfig.fromMetroConfig(
                    {
                        cssEntryFile: path.relative(process.cwd(), remoteCSSPath),
                        experimental: { federation: { role: 'remote', id: 'remote-a' } },
                    },
                    Platform.iOS,
                ),
            )

            UniwindStore.reinit(toRegistration(host), ['light', 'dark'])
            dispose = UniwindStore.merge('remote-a', toRegistration(remote), ['light', 'dark'])

            expect(UniwindStore.getStyles('rmt:bg-red-500', undefined, undefined, context).styles).toEqual({ backgroundColor: TW_RED_500 })
            expect(warn).not.toHaveBeenCalled()
            // Uniwind's own stylesheet adds no class for the remote to register again.
            expect(remote.match(/"uniwind-default-font"/g)).toBeNull()
        } finally {
            dispose()
            warn.mockRestore()
            rmSync(directory, { force: true, recursive: true })
        }
    })
})
