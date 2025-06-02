// filepath: /Users/dustin/Projects/conway-gol/convert-images.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const chokidar = require('chokidar'); // Added
const chalk = require('chalk'); // Added

const INPUT_DIR = 'images';
const OUTPUT_DIR = 'output';

// Define 4K limits for downscaling large images
const MAX_RESIZE_WIDTH = 3840;
const MAX_RESIZE_HEIGHT = 2160;

const OUTPUT_FORMATS = [
    { format: 'jpeg', extension: 'jpg', options: { quality: 85, progressive: true } },
    { format: 'webp', extension: 'webp', options: { quality: 85 } },
    { format: 'avif', extension: 'avif', options: { quality: 65, speed: 5 } } // speed: higher is faster, lower quality/larger file. 0-8 for libaom.
];

const CROPPINGS = [
    { name: 'original', resizeOptions: null },
    { name: 'square', resizeOptions: { width: 1080, height: 1080, fit: 'cover' } },
    { name: 'landscape', resizeOptions: { width: 1280, height: 720, fit: 'cover' } }
];

// Stats
let scannedCount = 0;
let skippedCompletelyCount = 0;
let successfullyProcessedCount = 0;
let errorCount = 0;
const errorFiles = []; // Keep this for short-term error bursts, maybe reset periodically or not used for summary

function generateHashedFilenameBase(originalFilename) {
    const nameWithoutExt = path.parse(originalFilename).name;
    return crypto.createHash('sha256').update(nameWithoutExt).digest('hex').substring(0, 12); // 12-char hash
}

async function ensureOutputDir() {
    try {
        await fs.access(OUTPUT_DIR);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(OUTPUT_DIR, { recursive: true });
            console.log(chalk.blue(`Created output directory: ${OUTPUT_DIR}`));
        } else {
            console.error(chalk.red(`Error ensuring output directory ${OUTPUT_DIR}:`), error);
            throw error;
        }
    }
}

async function processImage(filePath, isInitialScan = false) {
    const originalFilename = path.basename(filePath);
    // Prevent processing if the file is already in OUTPUT_DIR (e.g. if watcher picks up output files)
    if (path.dirname(filePath) === path.resolve(OUTPUT_DIR)) {
        return;
    }
    if (!isInitialScan) scannedCount++; // Count only new files after initial scan for ongoing stats

    console.log(chalk.cyan(`Processing ${originalFilename}...`));
    const hashedBase = generateHashedFilenameBase(originalFilename);

    // Check if all variants for this image already exist
    let allVariantsExist = true;
    const variantsToCheck = [];
    for (const crop of CROPPINGS) {
        for (const fmt of OUTPUT_FORMATS) {
            const outputFilename = `${hashedBase}_${crop.name}.${fmt.extension}`;
            variantsToCheck.push(path.join(OUTPUT_DIR, outputFilename));
        }
    }

    try {
        // Check existence of all variants
        const accessResults = await Promise.allSettled(variantsToCheck.map(p => fs.access(p)));
        allVariantsExist = accessResults.every(result => result.status === 'fulfilled');
    } catch (e) {
        allVariantsExist = false; // Should not happen with Promise.allSettled
    }


    if (allVariantsExist) {
        console.log(chalk.yellow(`Skipping ${originalFilename}: all ${variantsToCheck.length} output variants already exist.`));
        if (!isInitialScan) skippedCompletelyCount++;
        return;
    }

    console.log(chalk.blueBright(`  Processing ${originalFilename} (hash: ${hashedBase})`));
    let imageProcessingOverallSuccess = true;
    let variantsCreatedThisRun = 0;

    try {
        const sourceImage = sharp(filePath);
        const metadata = await sourceImage.metadata();
        let basePipeline = sourceImage.clone();

        if (metadata.width > MAX_RESIZE_WIDTH || metadata.height > MAX_RESIZE_HEIGHT) {
            console.log(chalk.magenta(`  Image ${originalFilename} (${metadata.width}x${metadata.height}) exceeds 4K, downscaling...`));
            basePipeline = basePipeline.resize({
                width: MAX_RESIZE_WIDTH,
                height: MAX_RESIZE_HEIGHT,
                fit: 'inside',
                withoutEnlargement: true
            });
        }

        for (const crop of CROPPINGS) {
            for (const fmt of OUTPUT_FORMATS) {
                const outputFilename = `${hashedBase}_${crop.name}.${fmt.extension}`;
                const outputFilePath = path.join(OUTPUT_DIR, outputFilename);

                try {
                    await fs.access(outputFilePath);
                    // console.log(chalk.gray(`  Variant ${outputFilename} already exists, skipping creation.`));
                    continue;
                } catch (e) {
                    // File doesn't exist, proceed
                }

                try {
                    let currentPipeline = basePipeline.clone();
                    if (crop.resizeOptions) {
                        currentPipeline = currentPipeline.resize({
                            ...crop.resizeOptions,
                            withoutEnlargement: true
                        });
                    }
                    await currentPipeline[fmt.format](fmt.options).toFile(outputFilePath);
                    console.log(chalk.green(`  Successfully created ${outputFilename}`));
                    variantsCreatedThisRun++;
                } catch (variantError) {
                    console.error(chalk.red(`  Error creating variant ${outputFilename} for ${originalFilename}: ${variantError.message}`));
                    imageProcessingOverallSuccess = false;
                }
            }
        }

        if (imageProcessingOverallSuccess && variantsCreatedThisRun > 0) {
            if (!isInitialScan) successfullyProcessedCount++;
            console.log(chalk.greenBright(`Successfully processed ${originalFilename} - ${variantsCreatedThisRun} new variants created.`));
        } else if (imageProcessingOverallSuccess && variantsCreatedThisRun === 0) {
            console.log(chalk.yellow(`No new variants needed for ${originalFilename} (all existed individually).`));
        } else if (!imageProcessingOverallSuccess) {
            if (!isInitialScan) errorCount++;
            // errorFiles logic can be kept if desired for recent errors
            console.error(chalk.red(`Finished processing ${originalFilename} with one or more errors.`));
        }

    } catch (err) {
        console.error(chalk.red(`Failed to load or process ${originalFilename}: ${err.message}`));
        if (err.message.includes('Input file contains unsupported image format')) {
            console.warn(chalk.yellow(`  Tip: Ensure libvips is compiled with support for all needed formats (e.g., HEIC, AVIF).`));
        }
        if (!isInitialScan) errorCount++;
    }
    logCurrentStats();
}

async function handleDeletedSourceImage(filePath) {
    const originalFilename = path.basename(filePath);
    // Prevent acting if the file is in OUTPUT_DIR
    if (path.dirname(filePath) === path.resolve(OUTPUT_DIR)) {
        return;
    }
    console.log(chalk.magenta(`Source image ${originalFilename} deleted. Removing corresponding output files...`));
    const hashedBase = generateHashedFilenameBase(originalFilename);
    let deletedCount = 0;
    let deletionErrorCount = 0;

    for (const crop of CROPPINGS) {
        for (const fmt of OUTPUT_FORMATS) {
            const outputFilename = `${hashedBase}_${crop.name}.${fmt.extension}`;
            const outputFilePath = path.join(OUTPUT_DIR, outputFilename);
            try {
                await fs.access(outputFilePath); // Check if it exists before trying to delete
                await fs.unlink(outputFilePath);
                console.log(chalk.green(`  Deleted ${outputFilename}`));
                deletedCount++;
            } catch (error) {
                if (error.code !== 'ENOENT') { // ENOENT means file didn't exist, which is fine
                    console.error(chalk.red(`  Error deleting ${outputFilename}: ${error.message}`));
                    deletionErrorCount++;
                }
            }
        }
    }
    if (deletedCount > 0) {
        console.log(chalk.greenBright(`Successfully deleted ${deletedCount} variants for ${originalFilename}.`));
    }
    if (deletionErrorCount > 0) {
        console.error(chalk.red(`${deletionErrorCount} errors occurred while deleting variants for ${originalFilename}.`));
    }
    if (deletedCount === 0 && deletionErrorCount === 0) {
        console.log(chalk.yellow(`No output variants found or needed to be deleted for ${originalFilename}.`));
    }
    logCurrentStats();
}

function logCurrentStats() {
    console.log(chalk.blueBright(`--- Current Stats ---`));
    console.log(chalk.blueBright(`New Files Scanned (since start): ${scannedCount}`));
    console.log(chalk.blueBright(`Skipped (all variants existed): ${skippedCompletelyCount}`));
    console.log(chalk.blueBright(`Successfully Processed (new variants): ${successfullyProcessedCount}`));
    console.log(chalk.blueBright(`Processing Errors: ${errorCount}`));
    console.log(chalk.blueBright(`---------------------`));
}


const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.heic', '.heif', '.tiff', '.svg'];

function isImageFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return imageExtensions.includes(ext);
}

async function main() {
    console.log(chalk.bold.underline.yellow("Starting Image Processing Server..."));
    console.log(chalk.gray(`Watching ${path.resolve(INPUT_DIR)} for changes.`));
    console.log(chalk.gray(`Outputting to ${path.resolve(OUTPUT_DIR)}.`));

    try {
        await ensureOutputDir();
    } catch (dirError) {
        console.error(chalk.red("Critical: Could not create or access output directory. Exiting."));
        process.exit(1);
    }

    // Initial scan of the input directory
    console.log(chalk.blue("Performing initial scan of input directory..."));
    let initialFiles;
    try {
        initialFiles = await fs.readdir(INPUT_DIR);
    } catch (readDirError) {
        console.error(chalk.red(`Error reading input directory ${INPUT_DIR} for initial scan: ${readDirError.message}`));
        initialFiles = []; // Proceed without initial scan if dir is problematic
    }

    let initialImageFilesProcessed = 0;
    for (const file of initialFiles) {
        const filePath = path.join(INPUT_DIR, file);
        if (isImageFile(filePath)) {
            try {
                const stats = await fs.stat(filePath);
                if (stats.isFile()) {
                    console.log(chalk.blue(`Initial scan: Found image ${file}. Processing...`));
                    await processImage(filePath, true); // Pass true for isInitialScan
                    initialImageFilesProcessed++;
                }
            } catch (statError) {
                console.error(chalk.red(`Initial scan: Error stating file ${file}: ${statError.message}`));
            }
        }
    }
    console.log(chalk.green(`Initial scan complete. Processed ${initialImageFilesProcessed} image(s).`));
    logCurrentStats(); // Log stats after initial scan (will be mostly 0s for ongoing)


    const watcher = chokidar.watch(INPUT_DIR, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true, // Already handled initial scan
        awaitWriteFinish: { // Helps with large file copies
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    watcher
        .on('add', async filePath => {
            if (isImageFile(filePath)) {
                console.log(chalk.bold.greenBright(`\n[EVENT] File Added: ${filePath}`));
                await processImage(filePath);
            }
        })
        .on('unlink', async filePath => {
            if (isImageFile(filePath)) {
                console.log(chalk.bold.magentaBright(`\n[EVENT] File Deleted: ${filePath}`));
                await handleDeletedSourceImage(filePath);
            }
        })
        .on('error', error => console.error(chalk.red(`Watcher error: ${error}`)))
        .on('ready', () => console.log(chalk.yellow.bold('Image processing server is now watching for changes.')));

    // Keep the process alive
    process.stdin.resume();

    function exitHandler(options, exitCode) {
        console.log(chalk.yellow.bold('\nShutting down image processing server...'));
        watcher.close().then(() => {
            console.log(chalk.gray('File watcher closed.'));
            logCurrentStats(); // Log final stats
            if (options.exit) process.exit();
        });
    }

    //do something when app is closing
    process.on('exit', exitHandler.bind(null,{cleanup:true}));
    //catches ctrl+c event
    process.on('SIGINT', exitHandler.bind(null, {exit:true}));
    // catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
    process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
    //catches uncaught exceptions
    process.on('uncaughtException', exitHandler.bind(null, {exit:true}));

}

main().catch(err => {
    console.error(chalk.red.bold("\nUnhandled critical error in main execution:"), err);
    process.exit(1);
});

// Removed the old summary log as stats are logged ongoingly or on exit.

