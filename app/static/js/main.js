document.addEventListener('DOMContentLoaded', function () {
    const fileContainer = document.getElementById('file-container');
    const uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
    const uploadButton = document.getElementById('upload-button');
    const fileInput = document.getElementById('file-input');
    const newFolderModal = new bootstrap.Modal(document.getElementById('newFolderModal'));
    const createFolderButton = document.getElementById('create-folder-button');
    const folderNameInput = document.getElementById('folder-name-input');
    const breadcrumbNav = document.getElementById('breadcrumb-nav');
    const sortOptions = document.querySelectorAll('.sort-option');
    const viewModeButtons = document.querySelectorAll('[data-view-mode]');
    const uploadFolderModalElement = document.getElementById('uploadFolderModal');
    const uploadFolderModal = new bootstrap.Modal(uploadFolderModalElement);
    const uploadFolderButton = document.getElementById('upload-folder-button');
    const folderInput = document.getElementById('folder-input');
    const uploadFolderStatus = document.getElementById('upload-folder-status');
    const transferStatus = document.getElementById('transfer-status');
    const transferStatusMessage = document.getElementById('transfer-status-message');
    const transferStatusDetail = document.getElementById('transfer-status-detail');
    const transferProgressBar = document.getElementById('transfer-progress');
    const transferSpinner = document.getElementById('transfer-spinner');
    let transferHideTimeout = null;

    let currentParentId = null;
    let breadcrumbState = [{folderId: null, folderName: 'Home'}];
    let currentFiles = [];
    let currentSort = { key: 'name', direction: 'asc' };
    let currentViewMode = 'details';

    function formatDuration(seconds) {
        if (!seconds || !isFinite(seconds) || seconds <= 0) {
            return null;
        }
        const minutes = Math.floor(seconds / 60);
        const secs = Math.max(1, Math.round(seconds % 60));
        if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        }
        return `${secs}s`;
    }

    function setTransferStatus({ active = true, message = '', percent = null, etaSeconds = null, detail = '', variant = 'info', indeterminate = false } = {}) {
        if (!transferStatus) return;
        if (transferHideTimeout) {
            clearTimeout(transferHideTimeout);
            transferHideTimeout = null;
        }
        if (!active) {
            transferStatus.classList.add('d-none');
            transferProgressBar.style.width = '0%';
            transferProgressBar.setAttribute('aria-valuenow', '0');
            transferProgressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
            transferSpinner.classList.remove('d-none');
            transferStatusDetail.textContent = '';
            return;
        }
        transferStatus.classList.remove('d-none');
        transferStatus.classList.remove('alert-info', 'alert-success', 'alert-danger');
        transferStatus.classList.add(`alert-${variant}`);
        transferStatusMessage.textContent = message;

        const showSpinner = indeterminate || percent === null || percent < 100;
        transferSpinner.classList.toggle('d-none', !showSpinner);

        if (percent === null || indeterminate) {
            transferProgressBar.style.width = '100%';
            transferProgressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
            transferProgressBar.setAttribute('aria-valuenow', '100');
        } else {
            const safePercent = Math.min(100, Math.max(0, percent));
            transferProgressBar.style.width = `${safePercent}%`;
            transferProgressBar.setAttribute('aria-valuenow', safePercent.toFixed(0));
            transferProgressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
        }

        if (detail) {
            transferStatusDetail.textContent = detail;
        } else if (etaSeconds && isFinite(etaSeconds)) {
            const etaText = formatDuration(etaSeconds);
            transferStatusDetail.textContent = etaText ? `Tempo restante estimado: ${etaText}` : 'Calculando tempo restante...';
        } else {
            transferStatusDetail.textContent = 'Calculando tempo restante...';
        }
    }

    function hideTransferStatus(delay = 1500) {
        if (!transferStatus) return;
        if (transferHideTimeout) {
            clearTimeout(transferHideTimeout);
        }
        transferHideTimeout = setTimeout(() => setTransferStatus({ active: false }), delay);
    }

    function updateBreadcrumb() {
        breadcrumbNav.innerHTML = '';
        breadcrumbState.forEach(item => {
            const breadcrumb = document.createElement('li');
            breadcrumb.className = 'breadcrumb-item';
            breadcrumb.innerHTML = `<a href="#" data-folder-id="${item.folderId}">${item.folderName}</a>`;
            breadcrumbNav.appendChild(breadcrumb);
        });
    }

    function applySorting(files) {
        const sorted = [...files];
        sorted.sort((a, b) => {
            let valueA;
            let valueB;

            switch (currentSort.key) {
                case 'date':
                    valueA = new Date(a.created_at).getTime();
                    valueB = new Date(b.created_at).getTime();
                    break;
                case 'type':
                    const typeA = a.is_folder ? 'folder' : (a.filename.split('.').pop() || '').toLowerCase();
                    const typeB = b.is_folder ? 'folder' : (b.filename.split('.').pop() || '').toLowerCase();
                    valueA = typeA;
                    valueB = typeB;
                    break;
                case 'name':
                default:
                    valueA = a.filename.toLowerCase();
                    valueB = b.filename.toLowerCase();
            }

            if (valueA < valueB) return currentSort.direction === 'asc' ? -1 : 1;
            if (valueA > valueB) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    function renderFiles() {
        if (!fileContainer) {
            return;
        }

        const files = applySorting(currentFiles);

        if (!files.length) {
            fileContainer.innerHTML = `
                <div class="placeholder text-center text-muted py-5">
                    Esta pasta está vazia.
                </div>
            `;
            return;
        }

        if (currentViewMode === 'details') {
            renderDetailsView(files);
        } else {
            renderGridView(files);
        }
    }

    function renderDetailsView(files) {
        const rows = files.map(file => {
            const iconClass = file.is_folder ? 'bi-folder-fill text-warning' : 'bi-file-earmark';
            const fileType = file.is_folder ? 'Pasta' : (file.filename.split('.').pop() || 'Arquivo');
            const date = new Date(file.created_at).toLocaleString();
            return `
                <tr class="file-row" data-file-entry="true" data-file-id="${file.id}" data-is-folder="${file.is_folder}" data-file-name="${file.filename}">
                    <td>
                        <i class="bi ${iconClass} file-icon"></i>
                        ${file.filename}
                    </td>
                    <td>${fileType}</td>
                    <td>${date}</td>
                    <td class="text-end">
                        <button type="button" class="btn btn-sm btn-outline-secondary download-btn" data-file-id="${file.id}" data-is-folder="${file.is_folder}" data-filename="${file.filename}">
                            <span class="spinner-border spinner-border-sm me-1 d-none" role="status" aria-hidden="true"></span>
                            <i class="bi bi-download"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger delete-btn" data-file-id="${file.id}" data-is-folder="${file.is_folder}" data-filename="${file.filename}">
                            <span class="spinner-border spinner-border-sm me-1 d-none" role="status" aria-hidden="true"></span>
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        fileContainer.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover align-middle">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Tipo</th>
                            <th>Modificado</th>
                            <th class="text-end">Ações</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    function renderGridView(files) {
        const cards = files.map(file => {
            const iconClass = file.is_folder ? 'bi-folder-fill text-warning' : 'bi-file-earmark-text';
            const fileType = file.is_folder ? 'Pasta' : (file.filename.split('.').pop() || 'Arquivo');
            const date = new Date(file.created_at).toLocaleDateString();
            return `
                <div class="col file-card-wrapper">
                    <div class="file-card" data-file-entry="true" data-file-id="${file.id}" data-is-folder="${file.is_folder}" data-file-name="${file.filename}">
                        <div class="file-card-icon">
                            <i class="bi ${iconClass}"></i>
                        </div>
                        <div class="file-card-body">
                            <div class="file-card-name" title="${file.filename}">${file.filename}</div>
                            <div class="file-card-meta">${fileType} · ${date}</div>
                        </div>
                        <div class="file-card-actions">
                            <button type="button" class="btn btn-sm btn-outline-secondary download-btn" data-file-id="${file.id}" data-is-folder="${file.is_folder}" data-filename="${file.filename}">
                                <span class="spinner-border spinner-border-sm me-1 d-none" role="status" aria-hidden="true"></span>
                                <i class="bi bi-download"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger delete-btn" data-file-id="${file.id}" data-is-folder="${file.is_folder}" data-filename="${file.filename}">
                                <span class="spinner-border spinner-border-sm me-1 d-none" role="status" aria-hidden="true"></span>
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        fileContainer.innerHTML = `
            <div class="row row-cols-2 row-cols-md-3 row-cols-lg-5 g-3 file-grid">
                ${cards}
            </div>
        `;
    }

    async function fetchAndRenderFiles(parentId = null, folderName = null) {
        currentParentId = parentId;
        if (fileContainer) {
            fileContainer.innerHTML = `
                <div class="placeholder text-center text-muted py-5">
                    Carregando arquivos...
                </div>
            `;
        }

        try {
            let url = '/api/files';
            const params = new URLSearchParams();
            if (parentId) {
                params.append('parent_id', parentId);
            }
            const response = await fetch(`${url}?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            currentFiles = await response.json();
            renderFiles();
        } catch (error) {
            console.error('Failed to fetch files:', error);
            if (fileContainer) {
                fileContainer.innerHTML = `
                    <div class="placeholder text-center text-danger py-5">
                        Não foi possível carregar os arquivos.
                    </div>
                `;
            }
        }
    }

    function uploadFile({ file, relativePath, parentId, onProgress }) {
        let xhr = null;
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            if (typeof parentId === 'number') {
                formData.append('parent_id', parentId);
            }
            if (relativePath) {
                formData.append('relative_path', relativePath);
            }

            xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/files/upload', true);
            let lastLoaded = 0;

            xhr.upload.addEventListener('progress', (event) => {
                if (!onProgress || !event.lengthComputable) {
                    return;
                }
                const delta = event.loaded - lastLoaded;
                lastLoaded = event.loaded;
                onProgress(delta > 0 ? delta : 0, event.loaded, event.total);
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (onProgress) {
                        const totalSize = file.size || lastLoaded;
                        const remainingDelta = totalSize - lastLoaded;
                        if (remainingDelta > 0) {
                            onProgress(remainingDelta, totalSize, totalSize);
                        }
                    }
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Network error during upload'));
            });

            try {
                xhr.send(formData);
            } catch (sendError) {
                reject(sendError);
            }
        });
    }

    viewModeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.dataset.viewMode;
            if (mode === currentViewMode) {
                return;
            }
            currentViewMode = mode;
            viewModeButtons.forEach(btn => btn.classList.toggle('active', btn === button));
            renderFiles();
        });
    });

    sortOptions.forEach(option => {
        option.addEventListener('click', (event) => {
            event.preventDefault();
            const { sortKey, sortDirection } = option.dataset;
            currentSort = {
                key: sortKey || 'name',
                direction: sortDirection || 'asc'
            };
            const sortLabel = document.getElementById('current-sort-label');
            if (sortLabel) {
                sortLabel.textContent = option.textContent.trim();
            }
            renderFiles();
        });
    });

    breadcrumbNav.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            const folderId = e.target.dataset.folderId === 'null' ? null : parseInt(e.target.dataset.folderId);
            const clickedIndex = breadcrumbState.findIndex(item => item.folderId === folderId);
            breadcrumbState = breadcrumbState.slice(0, clickedIndex + 1);
            updateBreadcrumb();
            fetchAndRenderFiles(folderId);
        }
    });

    uploadButton.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file to upload.');
            return;
        }

        try {
            await uploadFile({ file, relativePath: file.name, parentId: currentParentId ?? null });
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Upload failed for ${file.name}. Please try again.`);
        }
        uploadModal.hide();
        fetchAndRenderFiles(currentParentId);
    });

    function updateUploadFolderUI({ loading = false, message = '', variant = 'info', autoHide = false }) {
        if (uploadFolderStatus) {
            if (message) {
                uploadFolderStatus.textContent = message;
                uploadFolderStatus.classList.remove('d-none', 'alert-info', 'alert-success', 'alert-danger');
                uploadFolderStatus.classList.add(`alert-${variant}`);
                if (autoHide) {
                    setTimeout(() => uploadFolderStatus.classList.add('d-none'), 2000);
                }
            } else {
                uploadFolderStatus.classList.add('d-none');
            }
        }
        const spinner = uploadFolderButton.querySelector('.spinner-border');
        if (spinner) {
            spinner.classList.toggle('d-none', !loading);
        }
        uploadFolderButton.disabled = loading;
    }

    uploadFolderModalElement.addEventListener('hidden.bs.modal', () => {
        folderInput.value = '';
        updateUploadFolderUI({ loading: false, message: '' });
    });

    uploadFolderButton.addEventListener('click', async () => {
        const files = Array.from(folderInput.files);
        if (files.length === 0) {
            alert('Please select a folder to upload.');
            return;
        }

        const parentIdSnapshot = currentParentId ?? null;
        const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
        const startTime = performance.now();
        let uploadedBytes = 0;
        let uploadedFilesCount = 0;

        updateUploadFolderUI({ loading: true, message: `Uploading ${files.length} files...`, variant: 'info' });
        setTransferStatus({
            active: true,
            message: `Enviando ${files.length} arquivos...`,
            percent: totalBytes ? 0 : null,
            etaSeconds: null,
            variant: 'info',
            indeterminate: totalBytes === 0
        });

        const handleProgress = (delta = 0) => {
            uploadedBytes += delta;
            const elapsedSeconds = (performance.now() - startTime) / 1000;
            const speed = elapsedSeconds > 0 ? uploadedBytes / elapsedSeconds : 0;
            const remainingBytes = totalBytes - uploadedBytes;
            const etaSeconds = speed > 0 && remainingBytes > 0 ? remainingBytes / speed : null;
            const percent = totalBytes ? (uploadedBytes / totalBytes) * 100 : (uploadedFilesCount / files.length) * 100;
            setTransferStatus({
                active: true,
                message: `Enviando ${files.length} arquivos (${Math.min(percent, 100).toFixed(0)}%)`,
                percent: totalBytes ? percent : Math.min(100, percent),
                etaSeconds: etaSeconds || null,
                variant: 'info',
                indeterminate: totalBytes === 0
            });
        };

        try {
            for (const file of files) {
                await uploadFile({
                    file,
                    relativePath: file.webkitRelativePath,
                    parentId: parentIdSnapshot,
                    onProgress: handleProgress
                });
                uploadedFilesCount += 1;
                if (totalBytes === 0) {
                    handleProgress(0);
                }
            }
            uploadFolderModal.hide();
            fetchAndRenderFiles(currentParentId);
            updateUploadFolderUI({ loading: false, message: 'Upload completed!', variant: 'success', autoHide: true });
            setTransferStatus({
                active: true,
                message: 'Upload concluído!',
                percent: 100,
                detail: `${files.length} arquivos enviados.`,
                variant: 'success',
                indeterminate: false
            });
            hideTransferStatus();
        } catch (error) {
            console.error('Folder upload failed', error);
            updateUploadFolderUI({ loading: false, message: 'Folder upload failed. Please try again.', variant: 'danger' });
            setTransferStatus({
                active: true,
                message: 'Falha no upload da pasta.',
                percent: null,
                detail: 'Verifique sua conexão e tente novamente.',
                variant: 'danger',
                indeterminate: true
            });
            hideTransferStatus(4000);
        }
    });

    createFolderButton.addEventListener('click', async () => {
        const folderName = folderNameInput.value.trim();
        if (!folderName) {
            alert('Please enter a folder name.');
            return;
        }

        try {
            const response = await fetch('/api/folders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ folder_name: folderName, parent_id: currentParentId })
            });

            if (!response.ok) {
                throw new Error('Folder creation failed');
            }

            newFolderModal.hide();
            folderNameInput.value = ''; // Clear input
            fetchAndRenderFiles(currentParentId);
        } catch (error) {
            console.error('Folder creation error:', error);
            alert('Folder creation failed. Please try again.');
        }
    });

    // Initial fetch for root directory
    updateBreadcrumb();
    fetchAndRenderFiles();

    function toggleButtonSpinner(button, show) {
        const spinner = button.querySelector('.spinner-border');
        const icon = button.querySelector('i');
        if (spinner) spinner.classList.toggle('d-none', !show);
        if (icon) icon.classList.toggle('d-none', show);
        button.disabled = show;
    }

    async function downloadFolder(button, fileId, filename) {
        toggleButtonSpinner(button, true);
        setTransferStatus({
            active: true,
            message: `Preparando "${filename}"...`,
            percent: null,
            etaSeconds: null,
            variant: 'info',
            indeterminate: true
        });
        try {
            const response = await fetch(`/api/files/download/${fileId}`);
            if (!response.ok) {
                throw new Error('Failed to download folder');
            }

            const contentLength = Number(response.headers.get('Content-Length'));
            const chunks = [];
            let received = 0;
            const startTime = performance.now();

            if (response.body && response.body.getReader && contentLength) {
                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    received += value.length;
                    const percent = (received / contentLength) * 100;
                    const elapsedSeconds = (performance.now() - startTime) / 1000;
                    const speed = elapsedSeconds > 0 ? received / elapsedSeconds : 0;
                    const remainingBytes = contentLength - received;
                    const etaSeconds = speed > 0 ? remainingBytes / speed : null;
                    setTransferStatus({
                        active: true,
                        message: `Baixando "${filename}" (${Math.min(percent, 100).toFixed(0)}%)`,
                        percent,
                        etaSeconds,
                        variant: 'info'
                    });
                }
                const blob = new Blob(chunks, { type: 'application/zip' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${filename}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            } else {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${filename}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            }

            setTransferStatus({
                active: true,
                message: `Download de "${filename}" concluído!`,
                percent: 100,
                detail: 'Arquivo zip pronto.',
                variant: 'success',
                indeterminate: false
            });
            hideTransferStatus();
        } catch (error) {
            console.error(error);
            alert('Failed to download folder. Please try again.');
            setTransferStatus({
                active: true,
                message: 'Falha ao baixar a pasta.',
                percent: null,
                detail: 'Não foi possível preparar o download.',
                variant: 'danger',
                indeterminate: true
            });
            hideTransferStatus(4000);
        } finally {
            toggleButtonSpinner(button, false);
        }
    }

    async function deleteItem(button, fileId, isFolder, filename) {
        toggleButtonSpinner(button, true);
        try {
            const response = await fetch(`/api/files/${fileId}`, {
                method: 'DELETE'
            });

            const payload = await response.json().catch(() => ({}));

            if (response.status === 403) {
                alert(payload.error || 'Você não tem permissão para excluir este item.');
                return;
            }
            if (!response.ok) {
                throw new Error(payload.error || 'Failed to delete item');
            }

            fetchAndRenderFiles(currentParentId);
        } catch (error) {
            console.error('Delete failed', error);
            alert(error.message || 'Não foi possível excluir o item. Tente novamente.');
        } finally {
            toggleButtonSpinner(button, false);
        }
    }

    fileContainer.addEventListener('click', async (e) => {
        const downloadBtn = e.target.closest('.download-btn');
        if (downloadBtn) {
            e.stopPropagation();
            const fileId = downloadBtn.dataset.fileId;
            const isFolder = downloadBtn.dataset.isFolder === 'true';
            const filename = downloadBtn.dataset.filename || 'download';
            if (!fileId) {
                return;
            }

            if (isFolder) {
                await downloadFolder(downloadBtn, fileId, filename);
            } else {
                const downloadUrl = `/api/files/download/${fileId}`;
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = '';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            return;
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            e.stopPropagation();
            const fileId = deleteBtn.dataset.fileId;
            const isFolder = deleteBtn.dataset.isFolder === 'true';
            const filename = deleteBtn.dataset.filename || '';
            if (!fileId) {
                return;
            }
            const label = isFolder ? 'pasta' : 'arquivo';
            const confirmed = window.confirm(`Tem certeza que deseja excluir a ${label} "${filename}"? Esta ação não pode ser desfeita.`);
            if (!confirmed) {
                return;
            }
            await deleteItem(deleteBtn, fileId, isFolder, filename);
        }

        const entry = e.target.closest('[data-file-entry="true"]');
        if (entry && entry.dataset.isFolder === 'true' && !e.target.closest('.download-btn') && !e.target.closest('.delete-btn')) {
            e.stopPropagation();
            const folderId = parseInt(entry.dataset.fileId, 10);
            const folderName = entry.dataset.fileName;
            breadcrumbState.push({ folderId, folderName });
            updateBreadcrumb();
            fetchAndRenderFiles(folderId);
        }
    });
});
