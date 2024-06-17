const fs = require('fs')
const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);
const glob = require('glob')

const searchDir = '/Users/vincentoosterwijk/Google Drive/My Drive/Obsidian_Personal'

async function findConflictedFiles() {
    // find conflicted files
    // return an array of conflicted files

    // find all .MD files in the searchDir recursively using glob
    const files = glob.sync(`${searchDir}/**/*.md`)

    // filter out the conflicted files
    const conflictedFiles = files.filter(file => file.includes('(conflict'))

    // create a map where the key is the filename without the conflict suffix
    const conflictedFilesMap = conflictedFiles.reduce((acc, file) => {
        const key = file.replace(/ *\(conflict.*/, '')
        acc[key] = acc[key] || []
        acc[key].push(file)
        return acc
    }, {})

    return conflictedFilesMap
}

async function parseMdHeader(filename) {
    const originalFile = await fs.promises.readFile(filename, 'utf8')
    let header = originalFile.match(/---\n(.*\n)+?---/g)
    // Remove the ---\n and ---\n from the header and trim 
    header = header[0].replace(/---\n/g, '').replace(/---/g, '').trim()

    const headerObject = header.split('\n').reduce((acc, line) => {
        const [key, value] = line.split(': ')
        acc[key] = value
        return acc
    }, {})
    return headerObject
}

async function mergeHeaders(originalHeader, conflictHeader) {
    // Use the earliest created date 
    // Use the latest modified date
    // Otherwise always use the conflict header
    console.log(originalHeader, conflictHeader)
    const mergedHeader = {
        ...conflictHeader,
        created: originalHeader.created,
        updated_backup: conflictHeader.updated,
    }
    return mergedHeader
}

async function mergeFile(filename, conflictFile, diffFile, targetFile) {
    console.log(`Merging ${filename} and ${conflictFile} through ${diffFile} into ${targetFile}`)

    // execute the diff command between the conflicted file and the conflict file
    try {
        const diff = await exec(`diff -U 1000000 -u  "${filename}" "${conflictFile}" > "${diffFile}"`)
    } catch (error) {
        console.error('Error while running diff command', error)
        // process.exit(1)
    }


    // parse the .MD header into an object from the original file
    const originalHeader = await parseMdHeader(filename)

    // parse the .MD header into an object from the conflict file
    const conflictHeader = await parseMdHeader(conflictFile)

    // merge the headers
    const mergedHeader = await mergeHeaders(originalHeader, conflictHeader)

    // Wait here a second
    await new Promise(resolve => setTimeout(resolve, 1000))

    // read the contents of the diff file
    const diffContents = await fs.promises.readFile(diffFile, 'utf8')

    // Remove lines where the first character column is a @ or \
    let cleanedDiffContents = diffContents.split('\n').filter(line => !line.startsWith('@') && !line.startsWith('\\')).join('\n')

    // Remove the first 2 lines of the diff file
    cleanedDiffContents = cleanedDiffContents.split('\n').slice(2).join('\n')

    // Shift every line by 1 to the left
    cleanedDiffContents = cleanedDiffContents.split('\n').map(line => line.slice(1)).join('\n')

    // Remove the .md header
    cleanedDiffContents = cleanedDiffContents.replace(/---\n(.*\n)+?---/g, '')

    // Add the merged header to the cleaned diff contents
    cleanedDiffContents = `---\n${Object.entries(mergedHeader).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n${cleanedDiffContents}`

    // Write the cleaned diff contents to the target file
    await fs.promises.writeFile(targetFile, cleanedDiffContents)

    // Move the conflict file to a backup file
    await fs.promises.rename(conflictFile, `${conflictFile}.bak`)
}

async function mergeConflictedFilesIntoOneFile(filename, conflictedFiles) {
    // sort files in reverse order
    const sortedFiles = conflictedFiles.sort().reverse()

    // merge the conflicted files into one file
    
    let i = 0
    
    for await (const file of sortedFiles) {
        const diffFile = `${filename}.diff${i}`
        const mergedFile = `${filename}.merged${i}`
        const mergeSource = i === 0 ? filename :  `${filename}.merged0`
        await mergeFile(mergeSource, file, diffFile, mergedFile)
        i++
    }

    // backup the original file
    await fs.promises.rename(filename, `${filename}.bak`)

    // rename the merged file to the original file
    await fs.promises.rename(`${filename}.merged${i - 1}`, filename)
}

async function run() {
    const conflictedFiles = await findConflictedFiles()

    // for each conflicted file
    for (const [filename, files] of Object.entries(conflictedFiles)) {
        mergedFile = await mergeConflictedFilesIntoOneFile(`${filename}.md`, files)
    }
}

run()