import fs from 'fs'

// Builds of different projects run at once and share the installed package's artifacts, so a
// reader must never observe a truncated or half-written file.
export const writeFileAtomic = (filePath: string, content: string) => {
    const temporaryPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`

    fs.writeFileSync(temporaryPath, content)
    fs.renameSync(temporaryPath, filePath)
}
