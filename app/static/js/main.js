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
    const uploadFolderModal = new bootstrap.Modal(document.getElementById('uploadFolderModal'));
    const uploadFolderButton = document.getElementById('upload-folder-button');
    const folderInput = document.getElementById('folder-input');

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
                        <button class="btn btn-sm btn-outline-secondary" data-file-id="${file.id}"><i class="bi bi-download"></i></button>
                        <button class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
                    </td>
                `;

                if (file.is_folder) {
                    row.style.cursor = 'pointer';
                    row.addEventListener('click', (e) => {
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

    uploadFolderButton.addEventListener('click', async () => {
        const files = folderInput.files;
        if (files.length === 0) {
            alert('Please select a folder to upload.');
            return;
        }

        for (const file of files) {
            await uploadFile(file, file.webkitRelativePath);
        }

        uploadFolderModal.hide();
        fetchAndRenderFiles(currentParentId);
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

    fileListBody.addEventListener('click', (e) => {
        const target = e.target.closest('.btn-outline-secondary');
        if (target) {
            const fileId = target.dataset.fileId;
            if (fileId) {
                const downloadUrl = `/api/files/download/${fileId}`;
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = ''
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }
    });
});
