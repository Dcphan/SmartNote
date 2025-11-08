const fileStore = [];
    let currentFileId = null;
    const fileListEl = document.getElementById('fileList');
    const noFilesEl = document.getElementById('noFiles');
    const currentTitleEl = document.getElementById('currentTitle');
    const currentMetaEl = document.getElementById('currentMeta');
    const markdownInput = document.getElementById('markdownInput');
    const mdPreview = document.getElementById('mdPreview');
    const mdEditor = document.getElementById('mdEditor');
    const toggleEditViewBtn = document.getElementById('toggleEditView');
    const renameBtn = document.getElementById('renameBtn');
    const deleteBtn = document.getElementById('deleteBtn');

    // Utility: create id
    const makeId = () => 'f' + Date.now() + Math.floor(Math.random()*1000);

    // Render file list
    function refreshFileList() {
      fileListEl.innerHTML = '';
      if (fileStore.length === 0) {
        noFilesEl.style.display = 'block';
      } else {
        noFilesEl.style.display = 'none';
      }

      fileStore.forEach(f => {
        const row = document.createElement('div');
        row.className = 'file-item rounded-md p-2 cursor-pointer flex items-center gap-2 hover:bg-gray-50';
        row.dataset.fileid = f.id;

        const titleDiv = document.createElement('div');
        titleDiv.className = 'flex-1 min-w-0 text-sm font-medium truncate';
        titleDiv.textContent = f.title;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'text-xs text-gray-400';
        timeDiv.textContent = new Date(f.updated).toLocaleString();

        row.appendChild(titleDiv);
        row.appendChild(timeDiv);

        row.addEventListener('click', () => selectFile(f.id));
        row.addEventListener('dblclick', () => {
          // Quick rename on double click
          const newTitle = prompt('Rename note', f.title);
          if (newTitle && newTitle.trim()) updateFileTitle(f.id, newTitle.trim());
        });

        if (f.id === currentFileId) row.classList.add('active');

        fileListEl.appendChild(row);
      });
    }

    // Add file
    function addFile(title = 'Untitled', content = '') {
      const id = makeId();
      const file = { id, title, content, updated: Date.now() };
      fileStore.unshift(file); // newest first by default
      refreshFileList();
      selectFile(id);
      return id;
    }

    // Update title
    function updateFileTitle(id, newTitle) {
      const f = fileStore.find(x => x.id === id);
      if (!f) return false;
      f.title = newTitle;
      f.updated = Date.now();
      refreshFileList();
      if (id === currentFileId) currentTitleEl.textContent = newTitle;
      return true;
    }

    // Delete file
    function deleteFile(id) {
      const idx = fileStore.findIndex(x => x.id === id);
      if (idx === -1) return false;
      fileStore.splice(idx, 1);
      if (id === currentFileId) {
        currentFileId = null;
        clearEditor();
      }
      refreshFileList();
      return true;
    }

    // Get files (shallow copy)
    function getFiles() {
      return fileStore.map(f => ({ id: f.id, title: f.title, updated: f.updated }));
    }

    // Select file
    function selectFile(id) {
      const f = fileStore.find(x => x.id === id);
      if (!f) return false;
      currentFileId = id;
      // mark active in list
      document.querySelectorAll('.file-item').forEach(el => {
        el.classList.toggle('active', el.dataset.fileid === id);
      });

      currentTitleEl.textContent = f.title;
      currentMetaEl.textContent = ' • updated ' + new Date(f.updated).toLocaleString();
      // load into editor
      markdownInput.value = f.content || '';
      renderPreview(); // ensure preview up to date
      // default to edit mode
      showEditor();
      return true;
    }

    // Save current editor content into store
    function saveCurrentContent() {
      if (!currentFileId) return;
      const f = fileStore.find(x => x.id === currentFileId);
      if (!f) return;
      f.content = markdownInput.value;
      f.updated = Date.now();
      currentMetaEl.textContent = ' • updated ' + new Date(f.updated).toLocaleString();
      refreshFileList();
    }

    // Clear editor when no file selected
    function clearEditor() {
      currentTitleEl.textContent = 'No file selected';
      currentMetaEl.textContent = '';
      markdownInput.value = '';
      mdPreview.innerHTML = '';
      showEditor();
    }

    // Editor <-> Preview toggles
    function showEditor() {
      mdEditor.classList.remove('hidden');
      mdPreview.classList.add('hidden');
      toggleEditViewBtn.textContent = 'Preview';
    }
    function showPreview() {
      mdEditor.classList.add('hidden');
      mdPreview.classList.remove('hidden');
      toggleEditViewBtn.textContent = 'Edit';
    }

    // Render markdown to preview
    function renderPreview() {
      const text = markdownInput.value || '';
      // Save current content before rendering
      saveCurrentContent();
      // Use marked.js to render
      try {
        mdPreview.innerHTML = marked.parse(text);
      } catch (e) {
        mdPreview.innerHTML = '<pre class="text-red-600">Rendering error</pre>';
      }
    }

    // Wire UI buttons
    document.getElementById('newNoteBtn').addEventListener('click', () => addFile('Untitled', '# New note\n\nStart writing...'));
    document.getElementById('createQuick').addEventListener('click', () => addFile('Quick Note', ''));
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());

    // File input: accept plaintext or markdown. For docx/pdf you should wire server-side conversion.
    document.getElementById('fileInput').addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const name = f.name;
      // Only do a quick client-side read for .md / .txt
      if (name.endsWith('.md') || name.endsWith('.txt')) {
        const text = await f.text();
        addFile(name.replace(/\.[^/.]+$/, ''), text);
      } else {
        // For other types (docx/pdf) we create a placeholder and you can call your conversion API later.
        addFile(name.replace(/\.[^/.]+$/, ''), `*Uploaded: ${name}*\n\nConversion required (server-side).`);
      }
      ev.target.value = '';
    });

    // Rename and delete behaviour
    renameBtn.addEventListener('click', () => {
      if (!currentFileId) return alert('Select a file to rename.');
      const f = fileStore.find(x => x.id === currentFileId);
      const newTitle = prompt('Rename file', f.title);
      if (newTitle && newTitle.trim()) updateFileTitle(currentFileId, newTitle.trim());
    });

    deleteBtn.addEventListener('click', () => {
      if (!currentFileId) return alert('Select a file to delete.');
      const ok = confirm('Delete this note?');
      if (!ok) return;
      deleteFile(currentFileId);
    });

    // Toggle edit/preview
    toggleEditViewBtn.addEventListener('click', () => {
      if (mdEditor.classList.contains('hidden')) {
        showEditor();
      } else {
        renderPreview();
        showPreview();
      }
    });

    // Live-render on input while preview is shown
    markdownInput.addEventListener('input', () => {
      if (!mdEditor.classList.contains('hidden')) {
        // still editing — autosave but not re-render live
        saveCurrentContent();
      } else {
        // preview visible: re-render
        renderPreview();
      }
    });

    // Expose DOM API globally so other scripts or console can use
    window.SmartNotes = {
      addFile,
      updateFileTitle,
      deleteFile,
      selectFile,
      getFiles,
      saveCurrentContent,
      renderPreview,
    };

    // initial demo files
    addFile('Project Brief', '# Project Brief\n\nThis is a demo note converted from a Word document.\n\n## Goals\n- Convert headings\n- Keep structure');
    addFile('Meeting Notes Jan', '# Meeting Notes — Jan\n\n- Attendees\n- Decisions\n');
    // Select the most recent file
    if (fileStore.length) selectFile(fileStore[0].id);