document.addEventListener('DOMContentLoaded', function () {
    const fileListBody = document.getElementById('file-list');
    const uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
    const uploadButton = document.getElementById('upload-button');
    const fileInput = document.getElementById('file-input');
    const newFolderModal = new bootstrap.Modal(document.getElementById('newFolderModal'));
    const createFolderButton = document.getElementById('create-folder-button');
    const folderNameInput = document.getElementById('folder-name-input');
    const breadcrumbNav = document.getElementById('breadcrumb-nav');
    const sortByDropdown = document.getElementById('sort-by-dropdown');
    const uploadFolderModalElement = document.getElementById('uploadFolderModal');
    const uploadFolderModal = new bootstrap.Modal(uploadFolderModalElement);
    const uploadFolderButton = document.getElementById('upload-folder-button');
    const folderInput = document.getElementById('folder-input');
    const uploadFolderStatus = document.getElementById('upload-folder-status');

    let currentParentId = null;
    let breadcrumbState = [{folderId: null, folderName: 'Home'}];
    let currentSort = 'name';

    function updateBreadcrumb() {
        breadcrumbNav.innerHTML = '';
        breadcrumbState.forEach(item => {
            const breadcrumb = document.createElement('li');
            breadcrumb.className = 'breadcrumb-item';
            breadcrumb.innerHTML = `<a href="#" data-folder-id="${item.folderId}">${item.folderName}</a>`;
            breadcrumbNav.appendChild(breadcrumb);
        });
    }

    async function fetchAndRenderFiles(parentId = null, folderName = null) {
        currentParentId = parentId;
        // Clear current list and show loading indicator
        fileListBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Loading files...</td></tr>';

        try {
            let url = '/api/files';
            const params = new URLSearchParams();
            if (parentId) {
                params.append('parent_id', parentId);
            }
            params.append('sort_by', currentSort);
            url += `?${params.toString()}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const files = await response.json();

            // Clear loading indicator
            fileListBody.innerHTML = '';

            if (files.length === 0) {
                fileListBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">This folder is empty.</td></tr>';
            }

            files.forEach(file => {
                const row = document.createElement('tr');
                
                const iconClass = file.is_folder ? 'bi-folder-fill' : 'bi-file-earmark';
                const fileType = file.is_folder ? 'Folder' : 'File';
                const date = new Date(file.created_at).toLocaleDateString();

                row.innerHTML = `
                    <td>
                        <i class="bi ${iconClass} file-icon"></i> 
                        ${file.filename}
                    </td>
                    <td>${fileType}</td>
                    <td>${date}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-secondary download-btn" data-file-id="${file.id}" data-is-folder="${file.is_folder}" data-filename="${file.filename}">
                            <span class="spinner-border spinner-border-sm me-1 d-none" role="status" aria-hidden="true"></span>
                            <i class="bi bi-download"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
                    </td>
                `;

                if (file.is_folder) {
                    row.style.cursor = 'pointer';
                    row.addEventListener('click', (e) => {
                        if (e.target.closest('.download-btn')) {
                            return;
                        }
                        e.stopPropagation();
                        const newBreadcrumb = {folderId: file.id, folderName: file.filename};
                        breadcrumbState.push(newBreadcrumb);
                        updateBreadcrumb();
                        fetchAndRenderFiles(file.id, file.filename);
                    });
                }

                fileListBody.appendChild(row);
            });
        } catch (error) {
            console.error('Failed to fetch files:', error);
            fileListBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load files.</td></tr>';
        }
    }

    async function uploadFile(file, relativePath) {
        const formData = new FormData();
        formData.append('file', file);
        if (currentParentId) {
            formData.append('parent_id', currentParentId);
        }
        formData.append('relative_path', relativePath);

        try {
            const response = await fetch('/api/files/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Upload failed for ${file.name}. Please try again.`);
        }
    }

    sortByDropdown.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            currentSort = e.target.dataset.sort;
            fetchAndRenderFiles(currentParentId);
        }
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

        await uploadFile(file, file.name);
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
        const files = folderInput.files;
        if (files.length === 0) {
            alert('Please select a folder to upload.');
            return;
        }

        updateUploadFolderUI({ loading: true, message: `Uploading ${files.length} files...`, variant: 'info' });
        try {
            for (const file of files) {
                await uploadFile(file, file.webkitRelativePath);
            }
            uploadFolderModal.hide();
            fetchAndRenderFiles(currentParentId);
            updateUploadFolderUI({ loading: false, message: 'Upload completed!', variant: 'success', autoHide: true });
        } catch (error) {
            console.error('Folder upload failed', error);
            updateUploadFolderUI({ loading: false, message: 'Folder upload failed. Please try again.', variant: 'danger' });
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
        try {
            const response = await fetch(`/api/files/download/${fileId}`);
            if (!response.ok) {
                throw new Error('Failed to download folder');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        } catch (error) {
            console.error(error);
            alert('Failed to download folder. Please try again.');
        } finally {
            toggleButtonSpinner(button, false);
        }
    }

    fileListBody.addEventListener('click', async (e) => {
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
        }
    });
});
