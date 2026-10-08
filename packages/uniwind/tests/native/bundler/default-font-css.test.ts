import { readFileSync } from 'fs'
import { transform } from 'lightningcss'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import { compileCSS } from '../../../src/bundler/css-compiler'
import { Platform } from '../../../src/common/consts'

const RULE = '.uniwind-default-font {'

// The at-rules around each `.uniwind-default-font` rule, outermost first.
const enclosingRules = (css: string) => {
    const stack: Array<string> = []
    const found: Array<Array<string>> = []

    transform({
        code: Buffer.from(css),
        filename: 'uniwind.css',
        visitor: {
            Rule: rule => {
                if (rule.type === 'layer-block') {
                    stack.push(`@layer ${rule.value.name?.join('.')}`)
                }

                if (rule.type === 'supports') {
                    const { condition } = rule.value

                    stack.push(`@supports ${condition.type === 'selector' ? `selector(${condition.value})` : condition.type}`)
                }

                if (rule.type === 'style') {
                    const selector = rule.value.selectors.at(0)

                    if (selector?.length === 1 && selector[0]?.type === 'class' && selector[0].name === 'uniwind-default-font') {
                        found.push([...stack])
                    }
                }
            },
            RuleExit: rule => {
                if (rule.type === 'layer-block' || rule.type === 'supports') {
                    stack.pop()
                }
            },
        },
    })

    return found
}

describe('Default font CSS', () => {
    test('ships the root text rule in uniwind.css', () => {
        expect(readFileSync('./uniwind.css', 'utf-8')).toContain(RULE)
    })

    test('compiles the rule into the base layer of web CSS, behind the web-only condition', async () => {
        const config = UniwindBundlerConfig.fromMetroConfig({ cssEntryFile: './tests/test.css' }, Platform.Web)
        const css = await compileCSS(config)
        const rule = css.indexOf(RULE)

        expect(enclosingRules(css)).toEqual([['@layer base', '@supports selector(div > div)']])
        expect(css.slice(rule, css.indexOf('}', rule))).toContain('font-family: var(--default-font-family, -apple-system,')
    })

    test.each([Platform.iOS, Platform.Android])('keeps the web-only rule out of %s stylesheets', async platform => {
        const config = UniwindBundlerConfig.fromMetroConfig({ cssEntryFile: './tests/test.css' }, platform)
        const code = await compileCSS(config)

        expect(code.match(/"uniwind-default-font"/g)).toBeNull()
        // Native Text and TextInput read the token itself.
        expect(code.match(/"--default-font-family": vars =>/g)).toHaveLength(1)
    })
})
