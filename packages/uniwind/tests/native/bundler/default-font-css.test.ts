import { readFileSync } from 'fs'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import { compileCSS } from '../../../src/bundler/css-compiler'
import { Platform } from '../../../src/common/consts'

const RULE = '.uniwind-default-font {'

describe('Default font CSS', () => {
    test('ships the root text rule in uniwind.css', () => {
        expect(readFileSync('./uniwind.css', 'utf-8')).toContain(RULE)
    })

    test('compiles the rule into the base layer of web CSS', async () => {
        const config = UniwindBundlerConfig.fromMetroConfig({ cssEntryFile: './tests/test.css' }, Platform.Web)
        const css = await compileCSS(config)
        const rule = css.indexOf(RULE)
        const layer = css.lastIndexOf('@layer ', rule)

        expect(rule).toBeGreaterThan(-1)
        expect(css.slice(layer, css.indexOf('{', layer)).trim()).toEqual('@layer base')
        expect(css.slice(rule, css.indexOf('}', rule))).toContain('font-family: var(--default-font-family, -apple-system,')
    })
})
