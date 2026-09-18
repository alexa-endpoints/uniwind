import { expect, test } from '@playwright/test'

test('loads a remote that consumes the eager host shares', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    await page.goto('http://localhost:8081')

    await expect(page.getByTestId('mf-uniwind-remote-host')).toBeVisible()
    await expect(page.getByText('host-ready')).toBeVisible()
    await page.getByRole('button', { name: 'load-remote' }).click()
    await expect(page.getByTestId('mf-uniwind-remote')).toBeVisible()
    await expect(page.getByText('remote-one')).toBeVisible()
    expect(errors).toEqual([])
})
