import { expect, test } from '@playwright/test'

test('initializes eager React Native and Uniwind shares', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    await page.goto('http://localhost:8081')

    await expect(page.getByTestId('mf-uniwind-repro')).toBeVisible()
    await expect(page.getByText('one')).toBeVisible()
    expect(errors).toEqual([])
})
