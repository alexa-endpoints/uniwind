import { Uniwind } from '../../../src/core/config/config.native'
import { UniwindStore } from '../../../src/core/native'
import { runtimeOptions } from '../../../src/core/runtimeOptions'
import type { GenerateStyleSheetsCallback, UniwindRuntimeOptions } from '../../../src/core/types'

type UniwindForTest = typeof Uniwind & {
    __reinit: (
        initialize: GenerateStyleSheetsCallback,
        themes: Array<string>,
        fingerprint?: string,
        options?: UniwindRuntimeOptions,
    ) => void
    __mergeStyles: (id: string, initialize: GenerateStyleSheetsCallback, themes: Array<string>) => () => void
}

const uniwind = Uniwind as UniwindForTest
const generateStyles = () => ({ scopedVars: {}, stylesheet: {}, vars: {} })

describe('Uniwind native config', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    test('skips reinitialization when generated styles have not changed', () => {
        const reinit = jest.spyOn(UniwindStore, 'reinit')
        const initialize = jest.fn(generateStyles)

        uniwind.__reinit(initialize, ['light', 'dark'], 'unchanged-styles')
        uniwind.__reinit(initialize, ['light', 'dark'], 'unchanged-styles')

        expect(reinit).toHaveBeenCalledTimes(1)
    })

    test('reinitializes when generated styles change', () => {
        const reinit = jest.spyOn(UniwindStore, 'reinit')
        const initialize = jest.fn(generateStyles)

        uniwind.__reinit(initialize, ['light', 'dark'], 'styles-before')
        uniwind.__reinit(initialize, ['light', 'dark'], 'styles-after')

        expect(reinit).toHaveBeenCalledTimes(2)
    })

    test('retries the same generated styles after initialization fails', () => {
        const initialize = jest.fn(generateStyles)
        const reinit = jest
            .spyOn(UniwindStore, 'reinit')
            .mockImplementationOnce(() => {
                throw new Error('initialization failed')
            })

        expect(() => uniwind.__reinit(initialize, ['light', 'dark'], 'retry-styles')).toThrow(
            'initialization failed',
        )
        uniwind.__reinit(initialize, ['light', 'dark'], 'retry-styles')

        expect(reinit).toHaveBeenCalledTimes(2)
    })

    describe('runtime options', () => {
        afterEach(() => {
            uniwind.__reinit(generateStyles, ['light', 'dark'], undefined, { defaultFontFamily: false })
        })

        test('start with the default font family off', () => {
            expect(runtimeOptions.defaultFontFamily).toBe(false)
        })

        test('follow the host registration', () => {
            uniwind.__reinit(generateStyles, ['light', 'dark'], 'font-on', { defaultFontFamily: true })
            expect(runtimeOptions.defaultFontFamily).toBe(true)

            uniwind.__reinit(generateStyles, ['light', 'dark'], 'font-off', { defaultFontFamily: false })
            expect(runtimeOptions.defaultFontFamily).toBe(false)
        })

        test('stay as they are for a registration that passes none', () => {
            uniwind.__reinit(generateStyles, ['light', 'dark'], undefined, { defaultFontFamily: true })
            uniwind.__reinit(generateStyles, ['light', 'dark'])

            expect(runtimeOptions.defaultFontFamily).toBe(true)
        })

        test('are never changed by a federated remote registration', () => {
            uniwind.__reinit(generateStyles, ['light', 'dark'], undefined, { defaultFontFamily: true })
            const dispose = uniwind.__mergeStyles('remote-a', generateStyles, ['light', 'dark'])

            expect(runtimeOptions.defaultFontFamily).toBe(true)
            dispose()
            expect(runtimeOptions.defaultFontFamily).toBe(true)
        })

        test('leave the host to decide when a federated remote registers first', () => {
            jest.isolateModules(() => {
                const isolatedUniwind = require('../../../src/core/config/config.native').Uniwind as UniwindForTest
                const isolatedOptions = require('../../../src/core/runtimeOptions').runtimeOptions as typeof runtimeOptions
                const dispose = isolatedUniwind.__mergeStyles('remote-a', generateStyles, ['light', 'dark'])

                try {
                    expect(isolatedOptions.defaultFontFamily).toBe(false)

                    isolatedUniwind.__reinit(generateStyles, ['light', 'dark'], 'host', { defaultFontFamily: true })

                    expect(isolatedOptions.defaultFontFamily).toBe(true)
                } finally {
                    dispose()
                }
            })
        })
    })
})
