// Wrap entire script in an IIFE to create a private scope
(function () {
    'use strict';

    // --- CONFIGURATION & CONSTANTS ---
    const config = {
        ALLOWED_EXTENSIONS: new Set(['txt', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'htm', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sql', 'md', 'json', 'xml', 'yaml', 'yml', 'sh', 'bat', 'ini', 'log', 'svg', 'gitignore', 'env', 'dockerfile', 'conf', 'config', 'gradle', 'properties', 'toml', 'rst']),
        CONFIG_KEY: 'fileCombinerConfig'
    };

    // --- APPLICATION STATE ---
    const state = {
        selectedFiles: [],
        nextFileId: 0,
        lastCombinedContent: '',
        instances: {}, // To hold Materialize component instances
    };

    // --- DOM ELEMENT REFERENCES ---
    const dom = {
        mainCard: document.getElementById('mainCard'),
        fileInput: document.getElementById('fileInput'),
        fileListContainer: document.getElementById('fileListContainer'),
        noFilesMessage: document.getElementById('noFilesMessage'),
        combineButton: document.getElementById('combineButton'),
        mobileCombineButton: document.getElementById('mobileCombineButton'),
        clearAllButton: document.getElementById('clearAllButton'),
        fileCountSpan: document.getElementById('fileCount'),
        outputArea: document.getElementById('outputArea'),
        downloadLink: document.getElementById('downloadLink'),
        copyButton: document.getElementById('copyButton'),
        copyStatusMessage: document.getElementById('copyStatusMessage'),
        processingIndicator: document.getElementById('processingIndicator'),
        splitFileInput: document.getElementById('splitFileInput'),
        splitFileInfo: document.getElementById('splitFileInfo'),
        splitButton: document.getElementById('splitButton'),
        splitOutputArea: document.getElementById('splitOutputArea'),
        splitDownloadLink: document.getElementById('splitDownloadLink'),
        structureFormat: document.getElementById('structureFormat'),
        disableCommentsCheckbox: document.getElementById('disableCommentsCheckbox'),
        startComment: document.getElementById('startComment'),
        endComment: document.getElementById('endComment'),
        exclusionFilter: document.getElementById('exclusionFilter'),
        saveConfigButton: document.getElementById('saveConfigButton'),
        loadConfigButton: document.getElementById('loadConfigButton'),
        configStatus: document.getElementById('configStatus'),
        statsButton: document.getElementById('statsButton'),
        statsModal: document.getElementById('statsModal'),
        statsContent: document.getElementById('statsContent'),
        themeToggle: document.getElementById('themeToggle'),
        mobileCombineFab: document.getElementById('mobileCombineFab'),
    };

    // --- UTILITY FUNCTIONS ---
    const utils = {
        displayError: (msg) => M.toast({ html: msg, classes: 'red' }),
        displaySuccess: (msg) => M.toast({ html: msg, classes: 'green' }),
        getFileExtension: (filename) => filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase(),
        isLikelyTextFile: (name) => {
            const ext = utils.getFileExtension(name);
            if (config.ALLOWED_EXTENSIONS.has(ext)) return true;
            return /^\..*rc$/i.test(name) || /^\.?gitignore$/i.test(name) || name.toLowerCase() === 'dockerfile';
        },
        readFileAsText: (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (e) => reject(new Error(`Error reading ${file.name}: ${e.target.error}`));
            reader.readAsText(file);
        }),
        formatBytes: (bytes, decimals = 2) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }
    };

    // --- UI MANIPULATION ---
    const ui = {
        initMaterialize() {
            state.instances.tabs = M.Tabs.init(document.querySelector('.tabs'));
            state.instances.select = M.FormSelect.init(dom.structureFormat);
            state.instances.collapsible = M.Collapsible.init(document.querySelector('.collapsible'));
            state.instances.statsModal = M.Modal.init(dom.statsModal);
            M.updateTextFields();
        },
        updateTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            dom.themeToggle.querySelector('i').textContent = theme === 'dark' ? 'brightness_7' : 'brightness_4';
        },
        updateCombineButtons() {
            const count = state.selectedFiles.length;
            const isDisabled = count === 0;
            [dom.combineButton, dom.mobileCombineButton].forEach(btn => {
                isDisabled ? btn.classList.add('disabled') : btn.classList.remove('disabled');
            });
            dom.fileCountSpan.textContent = `(${count})`;
        },
        updateActionButtons() {
            const isDisabled = state.selectedFiles.length === 0;
            [dom.clearAllButton, dom.statsButton].forEach(btn => {
                isDisabled ? btn.classList.add('disabled') : btn.classList.remove('disabled');
            });
        },
        updateFileList() {
            dom.fileListContainer.innerHTML = '';
            if (state.selectedFiles.length === 0) {
                dom.fileListContainer.appendChild(dom.noFilesMessage);
            } else {
                state.selectedFiles.forEach(f => {
                    const li = document.createElement('li');
                    li.className = 'collection-item';
                    li.dataset.id = f.id;
                    const fileNameSpan = document.createElement('span');
                    fileNameSpan.className = 'file-name';
                    fileNameSpan.textContent = f.displayName;
                    fileNameSpan.title = f.displayName;
                    const removeLink = document.createElement('a');
                    removeLink.className = 'secondary-content';
                    removeLink.innerHTML = '<i class="material-icons">close</i>';
                    removeLink.onclick = (e) => { e.stopPropagation(); handlers.handleRemoveFile(f.id); };
                    li.appendChild(fileNameSpan);
                    li.appendChild(removeLink);
                    dom.fileListContainer.appendChild(li);
                });
            }
        },
        resetOutputArea() {
            dom.outputArea.style.display = 'none';
            state.lastCombinedContent = '';
            dom.copyStatusMessage.textContent = '';
            if (dom.downloadLink.href) {
                URL.revokeObjectURL(dom.downloadLink.href);
                dom.downloadLink.removeAttribute('href');
            }
        },
        updateAll() {
            this.updateFileList();
            this.updateCombineButtons();
            this.updateActionButtons();
            this.resetOutputArea();
        }
    };

    // --- EVENT HANDLERS ---
    const handlers = {
        handleThemeToggle() {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            ui.updateTheme(newTheme);
        },
        async handleFileChange(event) {
            await core.processFileSources(Array.from(event.target.files));
            event.target.value = ''; // Reset input
        },
        handleRemoveFile(id) {
            state.selectedFiles = state.selectedFiles.filter(f => f.id !== id);
            ui.updateAll();
        },
        handleClearAll() {
            state.selectedFiles = [];
            dom.fileInput.value = '';
            ui.updateAll();
        },
        handleSaveConfig() {
            const settings = {
                structureFormat: dom.structureFormat.value,
                disableComments: dom.disableCommentsCheckbox.checked,
                startComment: dom.startComment.value,
                endComment: dom.endComment.value,
                exclusionFilter: dom.exclusionFilter.value,
            };
            localStorage.setItem(config.CONFIG_KEY, JSON.stringify(settings));
            utils.displaySuccess('Configuration saved!');
        },
        handleLoadConfig() {
            const savedSettings = localStorage.getItem(config.CONFIG_KEY);
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                dom.structureFormat.value = settings.structureFormat || 'tree';
                state.instances.select = M.FormSelect.init(dom.structureFormat);
                dom.disableCommentsCheckbox.checked = settings.disableComments || false;
                dom.startComment.value = settings.startComment || '/* ==== START {index}/{totalFiles} - {filename} ({path}) ==== */';
                dom.endComment.value = settings.endComment || '/* ==== END - {filename} ==== */';
                dom.exclusionFilter.value = settings.exclusionFilter || '';
                M.updateTextFields(); // Important for labels
                dom.configStatus.textContent = 'Loaded!';
                setTimeout(() => dom.configStatus.textContent = '', 2000);
            }
        },
        handleStatsClick() {
            if (state.selectedFiles.length === 0) return;
            core.generateAndShowStats();
        },
        async handleCopyToClipboard() {
            if (!state.lastCombinedContent) {
                utils.displayError("No content to copy.");
                return;
            }
            try {
                await navigator.clipboard.writeText(state.lastCombinedContent);
                utils.displaySuccess('Copied to clipboard!');
            } catch (err) {
                utils.displayError(`Failed to copy: ${err}`);
            }
        },
        handleSplitFileChange() {
            dom.splitOutputArea.style.display = 'none';
            if (dom.splitDownloadLink.href) URL.revokeObjectURL(dom.splitDownloadLink.href);
            const file = dom.splitFileInput.files[0];
            dom.splitFileInfo.textContent = file ? file.name : '';
            file ? dom.splitButton.classList.remove('disabled') : dom.splitButton.classList.add('disabled');
        },
        // Drag and Drop Handlers
        handleDragEnter(e) { e.preventDefault(); e.stopPropagation(); dom.mainCard.classList.add('drag-over'); },
        handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); dom.mainCard.classList.remove('drag-over'); },
        async handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            dom.mainCard.classList.remove('drag-over');
            
            const items = e.dataTransfer.items;
            const files = [];
            const entryPromises = [];
    
            async function scanFiles(entry) {
                if (entry.isFile) {
                    return new Promise(resolve => entry.file(file => { files.push(file); resolve(); }));
                } else if (entry.isDirectory) {
                    let reader = entry.createReader();
                    let entries = await new Promise(resolve => reader.readEntries(e => resolve(e)));
                    await Promise.all(entries.map(scanFiles));
                }
            }
    
            for (const item of items) {
                const entry = item.webkitGetAsEntry();
                if (entry) entryPromises.push(scanFiles(entry));
                else files.push(item.getAsFile());
            }
            await Promise.all(entryPromises);
            await core.processFileSources(files);
        },
    };

    // --- CORE LOGIC ---
    const core = {
        async processFileSources(sources) {
            dom.processingIndicator.style.display = 'block';
            let filesToAdd = [];
            const exclusionPatterns = dom.exclusionFilter.value.split('\n').map(p => p.trim()).filter(Boolean);
            
            for (const source of sources) {
                const path = source.webkitRelativePath || source.name;
                const isExcluded = exclusionPatterns.some(pattern => {
                    const patternRegex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                    if (pattern.endsWith('/')) return (path + '/').startsWith(pattern);
                    return patternRegex.test(path.split('/').pop()) || patternRegex.test(path);
                });

                if (!isExcluded && utils.isLikelyTextFile(source.name)) {
                    if (source.name.toLowerCase().endsWith('.zip')) {
                        try {
                            const zip = await JSZip.loadAsync(source);
                            for (const [relativePath, entry] of Object.entries(zip.files)) {
                                if (!entry.dir && utils.isLikelyTextFile(entry.name)) {
                                    const content = await entry.async('string');
                                    filesToAdd.push({ id: state.nextFileId++, displayName: relativePath, content: content, originalSize: content.length });
                                }
                            }
                        } catch (err) { utils.displayError(`Error in ${source.name}: ${err.message}`); }
                    } else {
                        try {
                            const content = await utils.readFileAsText(source);
                            filesToAdd.push({ id: state.nextFileId++, displayName: path, content: content, originalSize: source.size });
                        } catch (err) { utils.displayError(err.message); }
                    }
                }
            }

            if (filesToAdd.length > 0) {
                state.selectedFiles.push(...filesToAdd);
                state.selectedFiles.sort((a, b) => a.displayName.localeCompare(b.displayName));
            } else if (sources.length > 0) {
                utils.displayError('No new processable text files found.');
            }

            dom.processingIndicator.style.display = 'none';
            ui.updateAll();
        },
        combineFiles() {
            if (state.selectedFiles.length === 0) {
                utils.displayError("No files to combine.");
                return;
            }
            // ... (The core combining logic is complex and remains the same as before)
            const manifest = state.selectedFiles.map(f => ({ path: f.displayName, size: f.content.length })); 
            let combinedContent = `/* FCS_MANIFEST_V1:${JSON.stringify(manifest)} */\n\n`; 
            const structureFormat = dom.structureFormat.value; 
            const disableComments = dom.disableCommentsCheckbox.checked; 
            if (!disableComments) { 
                const structureGenerators = { 'tree': this.generateTreeStructure, 'flat': this.generateFlatStructure, 'simple': this.generateSimpleListStructure, 'detailed': this.generateDetailedStructure, 'markdown': this.generateMarkdownStructure, 'none': () => '' }; 
                combinedContent += (structureGenerators[structureFormat] || (()=>''))(state.selectedFiles) + '\n'; 
            }
            const startTemplate = dom.startComment.value; const endTemplate = dom.endComment.value; 
            const totalFiles = state.selectedFiles.length; 
            state.selectedFiles.forEach((file, index) => { 
                const fileIndex = index + 1; const path = file.displayName; const filename = path.split('/').pop(); 
                if (!disableComments) { combinedContent += startTemplate.replace(/\{filename\}/g, filename).replace(/\{path\}/g, path).replace(/\{index\}/g, fileIndex).replace(/\{totalFiles\}/g, totalFiles) + '\n'; } 
                combinedContent += file.content + '\n'; 
                if (!disableComments) { combinedContent += endTemplate.replace(/\{filename\}/g, filename).replace(/\{path\}/g, path).replace(/\{index\}/g, fileIndex).replace(/\{totalFiles\}/g, totalFiles) + '\n\n'; } else { combinedContent += '\n'; } 
            }); 
            state.lastCombinedContent = combinedContent.trimEnd() + '\n'; 
            const blob = new Blob([state.lastCombinedContent], { type: 'text/plain;charset=utf-8' }); 
            const url = URL.createObjectURL(blob); 
            if (dom.downloadLink.href) URL.revokeObjectURL(dom.downloadLink.href); 
            dom.downloadLink.href = url; 
            dom.downloadLink.download = `combined_files_${new Date().toISOString().split('T')[0]}.txt`;
            dom.downloadLink.textContent = `Download Combined File`; 
            dom.outputArea.style.display = 'block';
        },
        async splitAndZip() {
            // ... (The core splitting logic is complex and remains the same as before)
            const file = dom.splitFileInput.files[0]; if (!file) return; 
            dom.splitButton.classList.add('disabled'); 
            dom.splitButton.innerHTML = '<div class="preloader-wrapper small active" style="width:24px; height:24px; vertical-align: middle;"><div class="spinner-layer"><div class="circle-clipper left"><div class="circle"></div></div><div class="gap-patch"><div class="circle"></div></div><div class="circle-clipper right"><div class="circle"></div></div></div></div>'; 
            try { 
                const text = await utils.readFileAsText(file); const zip = new JSZip(); 
                const manifestMatch = text.match(/\/\*\s*FCS_MANIFEST_V1:(\[.*?\])\s*\*\//); 
                if (manifestMatch && manifestMatch[1]) { 
                    const manifest = JSON.parse(manifestMatch[1]); let textCursor = text.substring(manifestMatch.index + manifestMatch[0].length); 
                    const firstStartCommentMatch = textCursor.match(/\/\*\s*====\s*START/); 
                    if (firstStartCommentMatch) { textCursor = textCursor.substring(firstStartCommentMatch.index); } else { const startOfContent = text.indexOf('\n\n', manifestMatch.index + manifestMatch[0].length) + 2; textCursor = startOfContent > 1 ? text.substring(startOfContent) : text.substring(manifestMatch.index + manifestMatch[0].length).trim(); } 
                    for (const fileEntry of manifest) { const fileContent = textCursor.substring(0, fileEntry.size); zip.file(fileEntry.path, fileContent); let chunkToEnd = textCursor.substring(fileEntry.size); const nextStartCommentMatch = chunkToEnd.match(/\/\*\s*====\s*START/); if (nextStartCommentMatch) { textCursor = chunkToEnd.substring(nextStartCommentMatch.index); } } 
                } else { 
                    const startCommentRegex = /\/\*\s*====\s*START\s*\d+\/\d+\s*-\s*(.*?)\s*\((.*?)\)\s*====\s*\*\//g; 
                    const matches = [...text.matchAll(startCommentRegex)]; if (matches.length === 0) throw new Error("Invalid format. No file start comments found."); 
                    for (let i = 0; i < matches.length; i++) { const match = matches[i]; const nextMatch = matches[i + 1]; const path = match[2].trim(); if (!path) continue; const contentStartIndex = match.index + match[0].length; const contentEndIndex = nextMatch ? nextMatch.index : text.length; let content = text.substring(contentStartIndex, contentEndIndex).replace(/\/\*\s*====\s*END\s*-\s*.*?\s*====\s*\*\//, '').trim(); zip.file(path, content); } 
                } 
                const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }); 
                const url = URL.createObjectURL(zipBlob); 
                const downloadFilename = `${file.name.replace(/\.txt$/i, '')}_split.zip`; 
                if (dom.splitDownloadLink.href) URL.revokeObjectURL(dom.splitDownloadLink.href); 
                dom.splitDownloadLink.href = url; dom.splitDownloadLink.download = downloadFilename; 
                dom.splitDownloadLink.textContent = `Download ${downloadFilename}`; 
                dom.splitOutputArea.style.display = 'block'; 
            } catch (err) { utils.displayError(`Error splitting file: ${err.message}`); } 
            finally { dom.splitButton.classList.remove('disabled'); dom.splitButton.innerHTML = '<i class="material-icons left">call_split</i>Split & Create Zip'; }
        },
        generateAndShowStats() {
            // ... (The core stats generation logic is the same)
            const totals = { files: 0, size: 0, lines: 0, chars: 0 }; const byExtension = {}; 
            state.selectedFiles.forEach(file => { const ext = utils.getFileExtension(file.displayName) || 'other'; const lines = file.content.split('\n').length; const chars = file.content.length; totals.files++; totals.size += file.originalSize; totals.lines += lines; totals.chars += chars; if (!byExtension[ext]) byExtension[ext] = { files: 0, size: 0, lines: 0, chars: 0 }; byExtension[ext].files++; byExtension[ext].size += file.originalSize; byExtension[ext].lines += lines; byExtension[ext].chars += chars; }); 
            let html = `<div class="row"><div class="col s6 m3 center-align"><h5>${totals.files.toLocaleString()}</h5><p class="grey-text">Files</p></div><div class="col s6 m3 center-align"><h5>${utils.formatBytes(totals.size)}</h5><p class="grey-text">Size</p></div><div class="col s6 m3 center-align"><h5>${totals.lines.toLocaleString()}</h5><p class="grey-text">Lines</p></div><div class="col s6 m3 center-align"><h5>${totals.chars.toLocaleString()}</h5><p class="grey-text">Characters</p></div></div><h6>By File Type</h6><table class="striped"><thead><tr><th>Extension</th><th class="right-align">Files</th><th class="right-align">Size</th><th class="right-align">Lines</th></tr></thead><tbody>`; 
            Object.entries(byExtension).sort((a,b) => b[1].files - a[1].files).forEach(([ext, data]) => { html += `<tr><td>.${ext}</td><td class="right-align">${data.files.toLocaleString()}</td><td class="right-align">${utils.formatBytes(data.size)}</td><td class="right-align">${data.lines.toLocaleString()}</td></tr>`; }); 
            html += `</tbody></table>`; 
            dom.statsContent.innerHTML = html; 
            state.instances.statsModal.open();
        },
        // --- Structure Generation Functions --- (These are helpers for combineFiles)
        generateTreeStructure: (files) => {
            const buildFileTree = (files) => { const tree = {}; files.forEach(f => { const segments = f.displayName.split('/').filter(Boolean); let currentLevel = tree; segments.forEach((segment, index) => { if (index === segments.length - 1) { if (!currentLevel.files) currentLevel.files = []; currentLevel.files.push(segment); } else { if (!currentLevel[segment]) currentLevel[segment] = { files: [] }; currentLevel = currentLevel[segment]; } }); }); return tree; };
            const renderTree = (node, depth = 0) => { let output = ''; const indent = '  '.repeat(depth); Object.keys(node).sort().forEach(key => { if (key !== 'files') { output += `${indent}└─ ${key}/\n`; output += renderTree(node[key], depth + 1); } }); if (node.files) { node.files.sort().forEach(file => { output += `${indent}└─ ${file}\n`; }); } return output; };
            return `/* ==== File Structure (Tree) ====\n${renderTree(buildFileTree(files))}=============================== */`;
        },
        generateFlatStructure: (files) => `/* ==== File List (Flat) ====\n${files.map(f => f.displayName).sort().join('\n')}\n========================== */`,
        generateSimpleListStructure: (files) => `/* ==== File List (Numbered) ====\n${files.map(f => f.displayName).sort().map((path, i) => `${i + 1}. ${path}`).join('\n')}\n============================ */`,
        generateDetailedStructure: (files) => `/* ==== Detailed Summary ====\nDate: ${new Date().toISOString()}\nTotal Files: ${files.length}\nTotal Size: ${utils.formatBytes(files.reduce((sum, f) => sum + (f.originalSize || 0), 0))}\n\nFiles:\n${files.map(f => `- ${f.displayName} (${utils.formatBytes(f.originalSize || 0)})`).sort().join('\n')}\n*/`,
        generateMarkdownStructure: (files) => `# File Structure\n\n${files.map(f => `- \`${f.displayName}\``).sort().join('\n')}\n`,
    };

    // --- MAIN APPLICATION CONTROLLER ---
    const App = {
        initEventListeners() {
            dom.themeToggle.addEventListener('click', handlers.handleThemeToggle);
            dom.fileInput.addEventListener('change', handlers.handleFileChange);
            dom.clearAllButton.addEventListener('click', handlers.handleClearAll);
            dom.combineButton.addEventListener('click', core.combineFiles);
            dom.mobileCombineButton.addEventListener('click', core.combineFiles);
            dom.saveConfigButton.addEventListener('click', handlers.handleSaveConfig);
            dom.loadConfigButton.addEventListener('click', handlers.handleLoadConfig);
            dom.statsButton.addEventListener('click', handlers.handleStatsClick);
            dom.copyButton.addEventListener('click', handlers.handleCopyToClipboard);
            dom.splitFileInput.addEventListener('change', handlers.handleSplitFileChange);
            dom.splitButton.addEventListener('click', core.splitAndZip);

            // Drag and Drop
            dom.mainCard.addEventListener('dragenter', handlers.handleDragEnter, false);
            dom.mainCard.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); }, false);
            dom.mainCard.addEventListener('dragleave', handlers.handleDragLeave, false);
            dom.mainCard.addEventListener('drop', handlers.handleDrop, false);
        },
        init() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            ui.updateTheme(savedTheme);
            ui.initMaterialize();
            this.initEventListeners();
            handlers.handleLoadConfig();
            ui.updateAll();
        }
    };

    // --- APPLICATION START ---
    App.init();

})();