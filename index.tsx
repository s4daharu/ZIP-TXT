// NOTE: @google/genai and related types are removed as AI feature is removed.

declare var JSZip: any; // Assuming JSZip is loaded globally via CDN script or local file

// Globals
let selectedFiles: { id: number, sourceName: string, sourceZipName?: string, displayName: string, content: string, originalSize: number }[] = [];
let nextFileId = 0;
let lastCombinedContent = ''; // To store content for copy

// Whitelist of likely text file extensions
const ALLOWED_EXTENSIONS = new Set([
    'txt', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'htm', 'py', 'rb', 'java',
    'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sql', 'md', 'json', 'xml',
    'yaml', 'yml', 'sh', 'bat', 'ini', 'log', 'svg', 'gitignore', 'env',
    'dockerfile', 'conf', 'config', 'gradle', 'properties', 'toml', 'rst'
]);

// DOM References
const structureFormatSelect = document.getElementById('structureFormat') as HTMLSelectElement;
const disableCommentsCheckbox = document.getElementById('disableCommentsCheckbox') as HTMLInputElement;
const commentStylePresetSelect = document.getElementById('commentStylePreset') as HTMLSelectElement;
const startCommentInput = document.getElementById('startComment') as HTMLInputElement;
const endCommentInput = document.getElementById('endComment') as HTMLInputElement;
const fileInputEl = document.getElementById('fileInput') as HTMLInputElement;
const fileDropZone = document.getElementById('fileDropZone') as HTMLDivElement;
const processingIndicator = document.getElementById('processingIndicator') as HTMLDivElement;
const errorMessageElement = document.getElementById('errorMessage') as HTMLParagraphElement;
const clearAllButton = document.getElementById('clearAllButton') as HTMLButtonElement;
const fileListContainer = document.getElementById('fileListContainer') as HTMLDivElement;
const fileListDiv = document.getElementById('fileList') as HTMLDivElement;
const noFilesMessageEl = document.getElementById('noFilesMessage') as HTMLParagraphElement;
const combineButton = document.getElementById('combineButton') as HTMLButtonElement;
const fileCountSpan = document.getElementById('fileCount') as HTMLSpanElement;
const outputActionsContainer = document.getElementById('outputActionsContainer') as HTMLDivElement;
const downloadLink = document.getElementById('downloadLink') as HTMLAnchorElement;
const copyButton = document.getElementById('copyButton') as HTMLButtonElement;
const copyStatusMessage = document.getElementById('copyStatusMessage') as HTMLParagraphElement;

// Comment Presets
const commentPresets = [
    {
        name: "Default (Block)",
        start: "/* ==== START {index}/{totalFiles} - {filename} ({path}) ==== */",
        end: "/* ==== END - {filename} ==== */"
    },
    {
        name: "Simple (Line)",
        start: "// --- Start: {filename} ({path}) ---",
        end: "// --- End: {filename} ---"
    },
    {
        name: "Boxed (Block)",
        start: "/******************** START: {filename} ********************/",
        end: "/********************* END: {filename} *********************/"
    },
    {
        name: "Minimal (Line)",
        start: "// {filename}",
        end: "// end {filename}"
    },
    {
        name: "HTML Style",
        start: "<!-- START: {filename} ({path}) -->",
        end: "<!-- END: {filename} -->"
    },
    {
        name: "Python/Shell Style",
        start: "# START: {filename} ({path})",
        end: "# END: {filename}"
    }
];


// --- JSZip Loading ---
const JSZIP_SOURCES = [
    './jszip.min.js', // Prioritize local copy for PWA offline
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
];
let jszipLoadingPromise: Promise<boolean> | null = null;
let jszipLoaded = (typeof JSZip !== 'undefined');

async function loadJSZipIfNeeded(): Promise<boolean> {
    if (jszipLoaded) return true;
    if (jszipLoadingPromise) return jszipLoadingPromise;

    console.log("Attempting to load JSZip...");
    jszipLoadingPromise = new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = JSZIP_SOURCES.length;

        function tryLoad() {
            if (attempts >= maxAttempts) {
                console.error('Failed to load JSZip after trying all sources.');
                jszipLoadingPromise = null;
                return reject(new Error('Failed to load JSZip library. Cannot process Zip files.'));
            }

            const source = JSZIP_SOURCES[attempts++];
            console.log(`Trying source ${attempts}: ${source}`);
            const script = document.createElement('script');
            script.src = source;
            script.async = true;

            const timeoutDuration = 5000;
            let timeoutId = setTimeout(() => {
                console.warn(`Timeout loading JSZip from ${source}`);
                script.remove();
                tryLoad();
            }, timeoutDuration);

            script.onload = () => {
                clearTimeout(timeoutId);
                if (typeof JSZip !== 'undefined') {
                    console.log(`JSZip loaded successfully from ${source}`);
                    jszipLoaded = true;
                    jszipLoadingPromise = null;
                    resolve(true);
                } else {
                    console.warn(`JSZip script loaded from ${source}, but JSZip object not found.`);
                    script.remove();
                    tryLoad();
                }
            };

            script.onerror = (event) => {
                clearTimeout(timeoutId);
                 if (!source.startsWith('http') && attempts === 1) { // Only log specifically for local if it's the first try
                     console.warn(`Local JSZip file (${source}) not found or failed to load. Trying CDNs...`);
                } else if (source.startsWith('http')) {
                     console.warn(`Error loading JSZip from ${source}`, event);
                }
                script.remove();
                tryLoad();
            };
            document.head.appendChild(script);
        }
        tryLoad();
    });
    return jszipLoadingPromise;
}

// --- Utility Functions ---
function clearError(element: HTMLElement = errorMessageElement) { element.textContent = ''; }
function displayError(msg: string, duration = 5000, element: HTMLElement = errorMessageElement) {
    console.error(msg);
    element.textContent = msg;
    if (duration > 0) { setTimeout(() => clearError(element), duration); }
}
function getFileExtension(filename: string): string { return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase(); }
function isLikelyTextFile(name: string): boolean { return ALLOWED_EXTENSIONS.has(getFileExtension(name)); }
function readFileAsText(file: File): Promise<string> {
     return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(new Error(`Error reading ${file.name}: ${e.target?.error}`));
        reader.readAsText(file);
    });
}
function getRelativePath(file: File & { webkitRelativePath?: string }): string { return file.webkitRelativePath || file.name; }
function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function getFileNameFromPath(path: string): string {
    return path.substring(path.lastIndexOf('/') + 1);
}

// Font Awesome file type icon mapping
function getFileTypeIconClass(filename: string): string {
    const ext = getFileExtension(filename);
    if (filename.toLowerCase().endsWith('.zip')) return 'fas fa-file-archive'; // For zip source itself
    switch (ext) {
        case 'js': return 'fab fa-js-square text-yellow-400';
        case 'ts': case 'tsx': return 'fas fa-code text-blue-400'; // Using generic code for TS/TSX
        case 'jsx': return 'fab fa-react text-sky-400';
        case 'py': return 'fab fa-python text-green-400';
        case 'css': return 'fab fa-css3-alt text-indigo-400';
        case 'html': case 'htm': return 'fab fa-html5 text-orange-400';
        case 'json': return 'fas fa-file-code text-purple-400'; // More specific than generic code
        case 'md': return 'fab fa-markdown text-gray-400';
        case 'txt': return 'fas fa-file-alt text-gray-300';
        case 'xml': return 'fas fa-file-code text-orange-500';
        case 'svg': return 'fas fa-image text-pink-400'; // Represent SVG as an image type
        case 'java': return 'fab fa-java text-red-500';
        case 'php': return 'fab fa-php text-purple-500';
        case 'rb': return 'fas fa-gem text-red-400'; // Ruby gem
        case 'c': case 'cpp': case 'h': case 'hpp': case 'cs': return 'fas fa-file-code text-sky-500'; // Generic for C-like
        case 'sql': return 'fas fa-database text-amber-500';
        case 'sh': case 'bat': return 'fas fa-terminal text-green-300';
        case 'ini': case 'conf': case 'config': case 'properties': case 'toml': return 'fas fa-cog text-gray-500';
        case 'log': return 'fas fa-file-medical-alt text-yellow-500'; // Log files
        case 'env': return 'fas fa-shield-alt text-lime-500'; // Env often for security/config
        case 'gitignore': return 'fab fa-git-alt text-orange-600';
        case 'dockerfile': return 'fab fa-docker text-blue-600';
        case 'gradle': return 'fas fa-cogs text-teal-500'; // Build system
        case 'yaml': case 'yml': return 'fas fa-file-alt text-cyan-400'; // Yet another generic file, distinct color
        default: return 'fas fa-file text-gray-400'; // Generic file for unknown
    }
}

// --- UI Update Functions ---
function createFileListItem(f: typeof selectedFiles[0], depth: number = 0): HTMLDivElement {
    const div = document.createElement('div');
    div.className = `flex justify-between items-center bg-gray-600 px-3 py-1.5 rounded hover:bg-gray-500 transition-colors duration-150 ease-in-out`;
    div.setAttribute('role', 'listitem');
    if (depth > 0) {
        div.style.marginLeft = `${depth * 20}px`; // 20px indentation per depth level
    }

    const textContainer = document.createElement('div');
    textContainer.className = 'mr-2 flex-1 flex items-center min-w-0';

    const iconEl = document.createElement('i');
    let iconFileName = f.displayName;
    if (f.sourceZipName) {
        const pathInZip = f.displayName.substring(f.sourceZipName.length + 3);
        iconFileName = getFileNameFromPath(pathInZip);
    }
    iconEl.className = `${getFileTypeIconClass(iconFileName)} fa-fw mr-2 text-base`; // fa-fw for fixed width
    iconEl.setAttribute('aria-hidden', 'true');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'text-gray-100 break-words';

    let displayFilename = f.displayName;
    if (f.sourceZipName) {
        const pathInZip = f.displayName.substring(f.sourceZipName.length + 3); // "zipName > path/to/file"
        displayFilename = getFileNameFromPath(pathInZip);
        nameSpan.title = pathInZip; // Show full path in zip on hover
    } else {
        nameSpan.title = f.displayName; // Full path on hover
    }
    nameSpan.textContent = displayFilename;


    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'text-gray-400 text-xs ml-2 flex-shrink-0';
    sizeSpan.textContent = `(${formatBytes(f.originalSize)})`;

    textContainer.appendChild(iconEl);
    textContainer.appendChild(nameSpan);
    textContainer.appendChild(sizeSpan);

    const removeButton = document.createElement('button');
    removeButton.onclick = () => removeFile(f.id);
    removeButton.className = 'ml-2 text-red-400 hover:text-red-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded px-1 flex-shrink-0';
    removeButton.innerHTML = '<i class="fas fa-times"></i>';
    removeButton.setAttribute('aria-label', `Remove ${displayFilename}`);
    removeButton.setAttribute('tabindex', '0');

    div.appendChild(textContainer);
    div.appendChild(removeButton);
    return div;
}

function renderZipContentsRecursive(
    parentElement: HTMLElement,
    allFilesFromZip: typeof selectedFiles,
    currentPathPrefixInZip: string, // e.g., "folderA/subFolderB/" or "" for root
    zipName: string,
    depth: number
) {
    const directSubfolders = new Set<string>();
    const directFiles: typeof selectedFiles[0][] = [];

    for (const file of allFilesFromZip) {
        const fullInternalPath = file.displayName.substring(zipName.length + 3); // path/to/file.txt

        if (!fullInternalPath.startsWith(currentPathPrefixInZip)) {
            continue; // Not relevant to this level
        }

        const pathSegmentAfterPrefix = fullInternalPath.substring(currentPathPrefixInZip.length);
        const slashIndex = pathSegmentAfterPrefix.indexOf('/');

        if (slashIndex > -1) { // It's in a subfolder or is a subfolder
            directSubfolders.add(pathSegmentAfterPrefix.substring(0, slashIndex));
        } else if (pathSegmentAfterPrefix.length > 0) { // It's a direct file
            directFiles.push(file);
        }
    }

    // Render sorted subfolders
    Array.from(directSubfolders).sort().forEach(folderName => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'flex justify-between items-center py-1 rounded';
        folderDiv.style.marginLeft = `${depth * 20}px`;
        folderDiv.setAttribute('role', 'listitem');


        const folderNameSpan = document.createElement('span');
        folderNameSpan.className = 'text-gray-300 font-medium flex items-center';
        folderNameSpan.innerHTML = `<i class="fas fa-folder fa-fw mr-2 text-yellow-500"></i> ${folderName}`; // Folder icon

        const removeFolderButton = document.createElement('button');
        removeFolderButton.className = 'ml-2 px-1.5 py-0.5 text-xs bg-red-800 text-white rounded shadow-sm hover:bg-red-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-600 active:bg-red-900 transition-all flex items-center';
        removeFolderButton.innerHTML = '<i class="fas fa-trash-alt fa-fw mr-1"></i> Remove';
        const fullFolderPath = currentPathPrefixInZip + folderName;
        removeFolderButton.setAttribute('aria-label', `Remove folder ${folderName} and its contents`);
        removeFolderButton.onclick = () => removeFilesInZipFolder(zipName, fullFolderPath);

        const folderInfoContainer = document.createElement('div');
        folderInfoContainer.className = 'flex-1 flex items-center min-w-0';
        folderInfoContainer.appendChild(folderNameSpan);
        
        folderDiv.appendChild(folderInfoContainer);
        folderDiv.appendChild(removeFolderButton);
        parentElement.appendChild(folderDiv);

        // Recursively render contents of this subfolder
        renderZipContentsRecursive(parentElement, allFilesFromZip, currentPathPrefixInZip + folderName + '/', zipName, depth + 1);
    });

    // Render sorted direct files
    directFiles.sort((a,b) => getFileNameFromPath(a.displayName).localeCompare(getFileNameFromPath(b.displayName))).forEach(file => {
        parentElement.appendChild(createFileListItem(file, depth));
    });
}


function updateFileListUI() {
    fileListDiv.innerHTML = '';

    if (selectedFiles.length === 0) {
        fileListDiv.appendChild(noFilesMessageEl);
        noFilesMessageEl.classList.remove('hidden');
    } else {
        noFilesMessageEl.classList.add('hidden');

        const groupedByZip: { [key: string]: typeof selectedFiles } = {};
        const individualFiles: typeof selectedFiles = [];

        selectedFiles.forEach(f => {
            if (f.sourceZipName) {
                if (!groupedByZip[f.sourceZipName]) {
                    groupedByZip[f.sourceZipName] = [];
                }
                groupedByZip[f.sourceZipName].push(f);
            } else {
                individualFiles.push(f);
            }
        });

        // Render files grouped by Zip
        Object.keys(groupedByZip).sort().forEach(zipName => {
            const groupContainer = document.createElement('div');
            groupContainer.className = 'bg-gray-700/50 p-2 rounded mb-2 shadow';

            const groupHeader = document.createElement('div');
            groupHeader.className = 'flex justify-between items-center mb-1.5 pb-1 border-b border-gray-600';

            const groupNameSpan = document.createElement('span');
            groupNameSpan.className = 'font-semibold text-gray-100 text-sm flex items-center';
            groupNameSpan.innerHTML = `<i class="fas fa-file-archive fa-fw mr-2 text-yellow-400"></i> ${zipName}`;
            groupNameSpan.title = `Files from ${zipName}`;

            const removeGroupButton = document.createElement('button');
            removeGroupButton.className = 'px-2 py-0.5 text-xs bg-red-700 text-white rounded shadow-sm hover:bg-red-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 active:bg-red-800 transition-all flex items-center';
            removeGroupButton.innerHTML = '<i class="fas fa-trash-alt fa-fw mr-1"></i> Remove All';
            removeGroupButton.setAttribute('aria-label', `Remove all files from ${zipName}`);
            removeGroupButton.onclick = () => removeFilesBySourceZip(zipName);

            groupHeader.appendChild(groupNameSpan);
            groupHeader.appendChild(removeGroupButton);
            groupContainer.appendChild(groupHeader);

            const filesInGroup = groupedByZip[zipName].sort((a,b) => a.displayName.localeCompare(b.displayName));
            renderZipContentsRecursive(groupContainer, filesInGroup, "", zipName, 0); // Start recursive rendering for zip contents

            fileListDiv.appendChild(groupContainer);
        });

        // Render individual files (not in a zip)
        individualFiles.sort((a,b) => a.displayName.localeCompare(b.displayName));
        individualFiles.forEach(f => {
            fileListDiv.appendChild(createFileListItem(f, 0)); // No depth for non-zip files
        });
    }

    const count = selectedFiles.length;
    combineButton.disabled = count === 0;
    clearAllButton.disabled = count === 0;
    fileCountSpan.textContent = `(${count})`;

    outputActionsContainer.classList.add('hidden');
    lastCombinedContent = '';
    copyStatusMessage.textContent = '';
    if (downloadLink.href) {
        URL.revokeObjectURL(downloadLink.href);
        downloadLink.removeAttribute('href');
        downloadLink.innerHTML = ''; // Clear icon and text
    }
}


function removeFile(id: number) {
    selectedFiles = selectedFiles.filter(f => f.id !== id);
    updateFileListUI();
}

function removeFilesBySourceZip(zipNameToRemove: string) {
    selectedFiles = selectedFiles.filter(f => f.sourceZipName !== zipNameToRemove);
    updateFileListUI();
}

function removeFilesInZipFolder(zipName: string, folderPathInZip: string) {
    // folderPathInZip is like "folderA" or "folderA/subFolderB", without trailing slash
    const prefixToRemove = folderPathInZip + '/';
    selectedFiles = selectedFiles.filter(f => {
        if (f.sourceZipName !== zipName) return true; // Keep files not in this zip
        const internalPath = f.displayName.substring(zipName.length + 3); // path/to/file.txt
        // Remove if internalPath starts with folderPathInZip + '/'
        return !internalPath.startsWith(prefixToRemove);
    });
    updateFileListUI();
}

function clearAllFiles() {
    selectedFiles = [];
    if (fileInputEl) fileInputEl.value = ''; // Reset file input to allow re-selection of same file
    updateFileListUI();
    clearError();
}

// --- Core Logic ---
async function processFiles(inputFiles: FileList | File[]) {
    clearError();
    const files = Array.from(inputFiles);
    let processedCount = 0;
    const filesToAdd: { id: number, sourceName: string, sourceZipName?: string, displayName: string, content: string, originalSize: number }[] = [];

    if (files.length === 0) return;

    processingIndicator.classList.remove('hidden');

    for (const file of files) {
        const isZip = file.name.toLowerCase().endsWith('.zip');

        if (isZip) {
            try {
                await loadJSZipIfNeeded();
                const zip = await JSZip.loadAsync(file);
                const zipEntries = Object.entries(zip.files as { [key: string]: any });

                for (const [relativePath, entry] of zipEntries) {
                    if (!entry.dir && isLikelyTextFile(relativePath)) {
                        try {
                            const content = await entry.async('string');
                            filesToAdd.push({
                                id: nextFileId++, sourceName: file.name, sourceZipName: file.name,
                                displayName: `${file.name} > ${relativePath}`, content: content, originalSize: content.length // Using content.length as approx size for zip content
                            });
                            processedCount++;
                        } catch (readError: any) { displayError(`Error reading ${relativePath} from ${file.name}: ${readError.message}`, 0); }
                    } else if (!entry.dir) { console.log(`Skipping non-text file in zip: ${relativePath}`); }
                }
            } catch (zipError: any) { displayError(`Error processing ${file.name}: ${zipError.message}`, 0); }
        } else if (isLikelyTextFile(file.name)) {
            try {
                const content = await readFileAsText(file);
                filesToAdd.push({
                    id: nextFileId++, sourceName: file.name, displayName: getRelativePath(file as File & { webkitRelativePath?: string }),
                    content: content, originalSize: file.size
                });
                processedCount++;
            } catch (readError: any) { displayError(readError.message, 0); }
        } else { console.log(`Skipping unsupported file type: ${file.name}`); }
    }

    processingIndicator.classList.add('hidden');

    if (filesToAdd.length > 0) {
        selectedFiles.push(...filesToAdd);
        updateFileListUI();
    }

    if (processedCount === 0 && files.length > 0) {
         displayError(`No text files found or processed from the selection.`, 5000);
    }
}

function handleFileSelectionChanged() {
    if (fileInputEl.files) {
        processFiles(fileInputEl.files);
        fileInputEl.value = ''; // Reset file input to allow re-selection of same file(s)
    }
}


// --- Structure Generation Functions ---
function buildFileTree(files: typeof selectedFiles) {
    const tree: any = {};
    files.forEach(f => {
        const pathParts = f.displayName.split(' > ');
        const sourceKey = pathParts[0]; // This could be a zip name or a direct file name
        let relativePathInSource = pathParts.slice(1).join('/');

        if (!tree[sourceKey]) { tree[sourceKey] = { files: [], folders: {} }; }

        if (pathParts.length === 1 || (pathParts.length === 2 && !relativePathInSource.includes('/'))) {
            tree[sourceKey].files.push(relativePathInSource || sourceKey);
            tree[sourceKey].files.sort();
            return;
        }
        
        const segments = relativePathInSource.split('/').filter(Boolean);
        let currentLevel = tree[sourceKey];
        segments.forEach((segment, index) => {
            if (index === segments.length - 1) { // It's a file
                currentLevel.files.push(segment);
                currentLevel.files.sort();
            } else { // It's a folder
                if (!currentLevel.folders[segment]) { currentLevel.folders[segment] = { files: [], folders: {} }; }
                currentLevel = currentLevel.folders[segment];
            }
        });
    }); return tree;
}
function renderTreeSimple(node: any, depth = 0): string {
    let output = ''; const indent = '  '.repeat(depth);
    const folderKeys = Object.keys(node.folders).sort(); const files = node.files.sort();
    folderKeys.forEach(key => { output += `${indent}- ${key}/\n`; output += renderTreeSimple(node.folders[key], depth + 1); });
    files.forEach(file => { output += `${indent}- ${file}\n`; }); return output;
}
function generateTreeStructure(files: typeof selectedFiles): string {
    const fileTree = buildFileTree(files); let output = "/* ==== File Structure (Tree) ==== */\n";
    const sourceKeys = Object.keys(fileTree).sort();
    sourceKeys.forEach(sourceKey => {
        const isSingleSourceNonZip = sourceKeys.length === 1 && selectedFiles.every(f => f.sourceName === sourceKey && !f.sourceZipName);
        
        if (!isSingleSourceNonZip) { output += `${sourceKey}:\n`; }
        output += renderTreeSimple(fileTree[sourceKey], isSingleSourceNonZip ? 0 : 1);
        if (!isSingleSourceNonZip && sourceKeys.length > 1) output += "\n";
    });
    output = output.trimEnd() + "\n";
    output += "/* =============================== */\n";
    return output;
}
function generateFlatStructure(files: typeof selectedFiles): string {
    const filePaths = files.map(f => {
        const pathParts = f.displayName.split(' > ');
        if (files.some(other => other.sourceZipName) || new Set(files.map(fl => fl.sourceName)).size > 1) {
            return f.displayName;
        } else { 
            return pathParts.length > 1 ? pathParts.slice(1).join('/') : f.displayName;
        }
    }).sort();
    return "/* ==== File List (Flat) ==== */\n" + filePaths.join('\n') + "\n/* ========================== */\n";
}
function generateSimpleListStructure(files: typeof selectedFiles): string {
     const filePaths = files.map(f => {
        const pathParts = f.displayName.split(' > ');
        if (files.some(other => other.sourceZipName) || new Set(files.map(fl => fl.sourceName)).size > 1) { return f.displayName; }
        else { return pathParts.length > 1 ? pathParts.slice(1).join('/') : f.displayName; }
    }).sort();
    return "/* ==== File List (Numbered) ==== */\n" +
        filePaths.map((path, i) => `${i + 1}. ${path}`).join('\n') + "\n/* ============================ */\n";
}
function generateDetailedStructure(files: typeof selectedFiles): string {
    const totalBytes = files.reduce((sum, f) => sum + (f.originalSize || 0), 0);
    const fileLines = files.map(f => {
         const pathParts = f.displayName.split(' > '); let displayPath;
         if (files.some(other => other.sourceZipName) || new Set(files.map(fl => fl.sourceName)).size > 1) { displayPath = f.displayName; }
         else { displayPath = pathParts.length > 1 ? pathParts.slice(1).join('/') : f.displayName; }
        const size = formatBytes(f.originalSize || 0); return `- ${displayPath} (${size})`;
    }).sort();
    return `/* ==== Detailed Summary ====
Date: ${new Date().toISOString()}
Total Files: ${files.length}
Total Size: ${formatBytes(totalBytes)}

Files:
${fileLines.join('\n')}
*/\n`;
}
function generateMarkdownStructure(files: typeof selectedFiles): string {
    let md = "# File Structure\n\n"; const groups: { [key: string]: string[] } = {};
    let hasMultipleSourcesOrZips = new Set(files.map(f => f.sourceName)).size > 1 || files.some(f => f.sourceZipName);

    files.forEach(f => {
        const pathParts = f.displayName.split(' > ');
        const sourceKey = pathParts[0]; 
        const relativePath = pathParts.slice(1).join('/'); 

        const groupDisplayKey = hasMultipleSourcesOrZips ? sourceKey : 'Files';
        if (!groups[groupDisplayKey]) groups[groupDisplayKey] = [];
        
        let pathToList = relativePath || sourceKey;
        if (pathParts.length === 1 && !f.sourceZipName) { 
             pathToList = f.displayName;
        } else if (f.sourceZipName && relativePath) { 
             pathToList = relativePath;
        } else if (f.sourceZipName && !relativePath) { 
            pathToList = pathParts[1] || sourceKey; 
        }
        groups[groupDisplayKey].push(pathToList);
    });

    const sortedGroupKeys = Object.keys(groups).sort();
    sortedGroupKeys.forEach(key => {
        if (hasMultipleSourcesOrZips) { md += `## ${key}\n\n`; }
        const sortedPaths = groups[key].sort();
        sortedPaths.forEach(path => md += `- \`${path}\`\n`);
        if (sortedPaths.length > 0) md += '\n';
    });
    return md.trimEnd() + '\n';
}


// --- Combine and Download ---
function combineFiles() {
    clearError();
    copyStatusMessage.textContent = '';

    if (selectedFiles.length === 0) {
        displayError("No files selected to combine.", 3000);
        return;
    }

    const structureFormat = structureFormatSelect.value;
    const disableComments = disableCommentsCheckbox.checked;
    let header = '';

    try {
        if (!disableComments) { 
             switch (structureFormat) {
                case 'tree':     header = generateTreeStructure(selectedFiles); break;
                case 'flat':     header = generateFlatStructure(selectedFiles); break;
                case 'simple':   header = generateSimpleListStructure(selectedFiles); break;
                case 'detailed': header = generateDetailedStructure(selectedFiles); break;
                case 'markdown': header = generateMarkdownStructure(selectedFiles); break;
                case 'none':     header = ''; break;
            }
        }
    } catch (e: any) {
         displayError(`Error generating file structure: ${e.message}`, 0);
         console.error("Structure generation error:", e);
         return;
    }

    const startTemplate = startCommentInput.value;
    const endTemplate = endCommentInput.value;
    let combinedOutputContent = header + (header && !header.endsWith('\n\n') ? '\n' : ''); 
    const totalFiles = selectedFiles.length;

    selectedFiles.forEach((file, index) => {
         const fileIndex = index + 1;
         const pathParts = file.displayName.split(' > ');
         const path = file.sourceZipName ? pathParts.slice(1).join('/') : file.sourceName;
         const filename = getFileNameFromPath(path) || getFileNameFromPath(file.sourceName);


         if (!disableComments) {
             const startComment = startTemplate
                .replace(/\{filename\}/g, filename)
                .replace(/\{path\}/g, path)
                .replace(/\{index\}/g, String(fileIndex))
                .replace(/\{totalFiles\}/g, String(totalFiles));
             combinedOutputContent += startComment + '\n';
         }
         combinedOutputContent += file.content.trim() + '\n'; 
         if (!disableComments) {
             const endComment = endTemplate
                 .replace(/\{filename\}/g, filename)
                 .replace(/\{path\}/g, path)
                 .replace(/\{index\}/g, String(fileIndex))
                 .replace(/\{totalFiles\}/g, String(totalFiles));
             combinedOutputContent += endComment + '\n\n'; 
         } else {
             combinedOutputContent += '\n'; 
         }
    });

    combinedOutputContent = combinedOutputContent.trimEnd() + '\n';
    lastCombinedContent = combinedOutputContent;

    let downloadFilename;
    const uniqueSourceNames = new Set(selectedFiles.map(f => f.sourceName));
    const singleFileSource = uniqueSourceNames.size === 1 ? selectedFiles[0].sourceName : null;

    if (singleFileSource && !selectedFiles[0].sourceZipName && selectedFiles.length === 1) { 
        const baseName = singleFileSource.substring(0, singleFileSource.lastIndexOf('.'));
        downloadFilename = `${baseName}_combined.txt`;
    } else if (selectedFiles.every(f => f.sourceZipName === selectedFiles[0].sourceZipName && selectedFiles[0].sourceZipName)) { 
        const zipBaseName = selectedFiles[0].sourceZipName!.replace(/\.zip$/i, '');
        downloadFilename = `${zipBaseName}_combined.txt`;
    }
    else {
        const dateStamp = new Date().toISOString().split('T')[0];
        downloadFilename = `combined_files_${dateStamp}.txt`;
    }


    try {
        const blob = new Blob([lastCombinedContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        if (downloadLink.href) { URL.revokeObjectURL(downloadLink.href); }
        downloadLink.href = url;
        downloadLink.download = downloadFilename;
        downloadLink.innerHTML = `<i class="fas fa-download mr-2"></i>Download ${downloadFilename}`;
        outputActionsContainer.classList.remove('hidden');

    } catch (e: any) {
         displayError(`Error creating download file: ${e.message}`, 0);
         console.error("Blob creation error:", e);
         outputActionsContainer.classList.add('hidden');
         lastCombinedContent = '';
    }
}

async function copyToClipboard() {
    copyStatusMessage.textContent = '';
    if (!lastCombinedContent) {
        displayError("No content generated to copy.", 3000);
        return;
    }
    if (!navigator.clipboard) {
        displayError("Clipboard API not available in this browser.", 5000);
        return;
    }
    try {
        await navigator.clipboard.writeText(lastCombinedContent);
        copyStatusMessage.textContent = 'Copied to clipboard!';
        setTimeout(() => { copyStatusMessage.textContent = ''; }, 3000);
    } catch (err: any) {
        displayError(`Failed to copy: ${err.message || err}`, 5000);
        console.error('Clipboard write failed: ', err);
    }
}


// --- Initialization & Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    updateFileListUI();
    if (!jszipLoaded) {
        loadJSZipIfNeeded().catch(err => {
             console.warn("Preloading JSZip failed (might load on demand):", err.message);
        });
    }

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
        });
    }


    commentPresets.forEach((preset, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = preset.name;
        commentStylePresetSelect.appendChild(option);
    });

    if (commentPresets.length > 0) {
        startCommentInput.value = commentPresets[0].start;
        endCommentInput.value = commentPresets[0].end;
        commentStylePresetSelect.value = "0";
    }

    commentStylePresetSelect.addEventListener('change', (event) => {
        const selectedIndex = parseInt((event.target as HTMLSelectElement).value, 10);
        if (selectedIndex >= 0 && selectedIndex < commentPresets.length) {
            startCommentInput.value = commentPresets[selectedIndex].start;
            endCommentInput.value = commentPresets[selectedIndex].end;
        }
    });

    if (fileInputEl) fileInputEl.addEventListener('change', handleFileSelectionChanged);
    if (clearAllButton) clearAllButton.addEventListener('click', clearAllFiles);
    if (combineButton) combineButton.addEventListener('click', combineFiles);
    if (copyButton) copyButton.addEventListener('click', copyToClipboard);

    if (fileDropZone) {
        fileDropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.stopPropagation();
            fileDropZone.classList.add('drag-over');
        });
        fileDropZone.addEventListener('dragleave', (event) => {
            event.preventDefault();
            event.stopPropagation();
            fileDropZone.classList.remove('drag-over');
        });
        fileDropZone.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            fileDropZone.classList.remove('drag-over');
            const files = event.dataTransfer?.files;
            if (files) {
                processFiles(files);
            }
        });
        // Add event listeners to document to catch dragend/mouseleave if drag originated outside dropzone
        document.addEventListener('dragend', () => fileDropZone.classList.remove('drag-over'), false);
        document.addEventListener('dragleave', (event) => {
            // Check if the mouse is leaving the window or moving to an element outside the dropzone
            if (event.relatedTarget === null || !fileDropZone.contains(event.relatedTarget as Node)) {
                 fileDropZone.classList.remove('drag-over');
            }
        }, false);
    }

    const toggleCommentInputs = () => {
        const disabled = disableCommentsCheckbox.checked;
        startCommentInput.disabled = disabled;
        endCommentInput.disabled = disabled;
        commentStylePresetSelect.disabled = disabled;

        startCommentInput.classList.toggle('opacity-50', disabled);
        startCommentInput.classList.toggle('cursor-not-allowed', disabled);
        endCommentInput.classList.toggle('opacity-50', disabled);
        endCommentInput.classList.toggle('cursor-not-allowed', disabled);
        commentStylePresetSelect.classList.toggle('opacity-50', disabled);
        commentStylePresetSelect.classList.toggle('cursor-not-allowed', disabled);
    };
    disableCommentsCheckbox.addEventListener('change', toggleCommentInputs);
    toggleCommentInputs(); 
});