// Editor Engine
const Editor = {
  blocks: [],
  metadata: {
    title: '', eyebrow: '', prevLink: '', nextLink: '', sourceNote: ''
  },
  history: [],
  historyIndex: -1,
  isRestoringHistory: false,
  selectedBlockId: null,
  
  init() {
    ImageManager.init();
    
    this.container = document.getElementById('blocksContainer');
    this.titleInput = document.getElementById('metaTitle');
    this.eyebrowInput = document.getElementById('metaEyebrow');
    this.prevInput = document.getElementById('metaPrevLink');
    this.nextInput = document.getElementById('metaNextLink');
    this.previewContent = document.getElementById('previewContent');
    this.saveStatus = document.getElementById('saveStatus');
    this.themeSelect = document.getElementById('previewTheme');
    
    this.navFilterAll = document.getElementById('navFilterAll');
    this.navFilterImage = document.getElementById('navFilterImage');
    this.navBody = document.getElementById('navBody');
    this.navFilter = 'all';
    
    this.bindEvents();
    
    // Check URL params for existing file to load
    const urlParams = new URLSearchParams(window.location.search);
    const folder = urlParams.get('folder');
    const file = urlParams.get('file');
    
    if (folder && file) {
      document.getElementById('editorTitle').innerText = `Edit: ${file}`;
      
      const draftKey = `amy_admin_draft_${folder}_${file}`;
      const draftData = localStorage.getItem(draftKey);
      
      if (draftData) {
        if (confirm("Ada draft lokal yang belum disimpan. Pulihkan draft?\n[OK = Pulihkan] [Cancel = Abaikan]")) {
          try {
            const parsed = JSON.parse(draftData);
            this.metadata = parsed.metadata || this.metadata;
            this.blocks = parsed.blocks || [];
            this.titleInput.value = this.metadata.title || '';
            this.eyebrowInput.value = this.metadata.eyebrow || '';
            this.prevInput.value = this.metadata.prevLink || '';
            this.nextInput.value = this.metadata.nextLink || '';
            this.renderBlocks();
            this.triggerPreviewUpdate();
            this.saveHistory();
          } catch(e) {
            console.error('Draft parsing error', e);
            this.loadFromServer(folder, file);
          }
        } else {
          localStorage.removeItem(draftKey);
          this.loadFromServer(folder, file);
        }
      } else {
        this.loadFromServer(folder, file);
      }
    } else {
      // Empty state
      this.addBlock('paragraph');
    }
    
    // Start auto-save
    setInterval(() => this.autoSave(), 30000);
    
    // Add global click listener for closing dropdowns
    document.addEventListener('click', () => {
      document.querySelectorAll('.type-dropdown-menu').forEach(menu => {
        menu.style.display = 'none';
      });
    });
  },
  
  bindEvents() {
    // Toggle Add Block Drawer
    const btnToggleAddBlock = document.getElementById('btnToggleAddBlock');
    const layout = document.getElementById('editorLayout');
    
    if (btnToggleAddBlock) {
      btnToggleAddBlock.addEventListener('click', (e) => {
        e.stopPropagation();
        layout.classList.toggle('show-add-block');
        layout.classList.remove('show-nav');
      });
    }
    
    const addBlockCloseBtn = document.getElementById('addBlockCloseBtn');
    if (addBlockCloseBtn) {
      addBlockCloseBtn.addEventListener('click', () => {
        layout.classList.remove('show-add-block');
      });
    }

    // Add block buttons
    document.querySelectorAll('#addBlockBarBody button.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.dataset.type;
        this.addBlock(type, this.selectedBlockId);
        layout.classList.remove('show-add-block');
      });
    });
    
    // Undo / Redo
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.addEventListener('click', () => this.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => this.redo());
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        this.redo();
      }
    });
    
    // Metadata inputs
    const updateMeta = () => {
      this.metadata.title = this.titleInput.value;
      this.metadata.eyebrow = this.eyebrowInput.value;
      this.metadata.prevLink = this.prevInput.value;
      this.metadata.nextLink = this.nextInput.value;
      this.triggerPreviewUpdate();
    };
    
    this.titleInput.addEventListener('input', updateMeta);
    this.eyebrowInput.addEventListener('input', updateMeta);
    this.prevInput.addEventListener('input', updateMeta);
    this.nextInput.addEventListener('input', updateMeta);
    
    this.titleInput.addEventListener('blur', () => this.saveHistory());
    this.eyebrowInput.addEventListener('blur', () => this.saveHistory());
    this.prevInput.addEventListener('blur', () => this.saveHistory());
    this.nextInput.addEventListener('blur', () => this.saveHistory());
    
    // Export/Import
    document.getElementById('btnExport').addEventListener('click', () => this.exportHTML());
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFileInput').click());
    
    // Navigator Filter
    if (this.navFilterAll) {
      this.navFilterAll.addEventListener('click', () => {
        this.navFilter = 'all';
        this.navFilterAll.classList.add('active');
        this.navFilterImage.classList.remove('active');
        this.renderNavigator();
      });
      this.navFilterImage.addEventListener('click', () => {
        this.navFilter = 'image';
        this.navFilterImage.classList.add('active');
        this.navFilterAll.classList.remove('active');
        this.renderNavigator();
      });
    }
    
    // Toggle mobile views
    const btnTogglePreview = document.getElementById('btnTogglePreview');
    if (btnTogglePreview) {
      btnTogglePreview.addEventListener('click', () => {
        const layout = document.getElementById('editorLayout');
        layout.classList.toggle('show-preview');
        if (layout.classList.contains('show-preview')) {
          btnTogglePreview.innerText = '✏️ Editor';
        } else {
          btnTogglePreview.innerText = '👁️ Preview';
        }
      });
    }
    
    const btnToggleNav = document.getElementById('btnToggleNav');
    if (btnToggleNav) {
      btnToggleNav.addEventListener('click', () => {
        document.getElementById('editorLayout').classList.add('show-nav');
        document.getElementById('editorLayout').classList.remove('show-add-block');
      });
    }
    
    const navCloseBtn = document.getElementById('navCloseBtn');
    if (navCloseBtn) {
      navCloseBtn.addEventListener('click', () => {
        document.getElementById('editorLayout').classList.remove('show-nav');
      });
    }
    
    const navOverlay = document.getElementById('navOverlay');
    if (navOverlay) {
      navOverlay.addEventListener('click', () => {
        document.getElementById('editorLayout').classList.remove('show-nav');
        document.getElementById('editorLayout').classList.remove('show-add-block');
      });
    }
    
    // GitHub Save & Settings
    document.getElementById('btnGithubSettings').addEventListener('click', () => {
      const token = localStorage.getItem('amy_github_token') || '';
      const imgbbKey = localStorage.getItem('amy_imgbb_api_key') || '';
      document.getElementById('githubTokenInput').value = token;
      document.getElementById('imgbbApiKey').value = imgbbKey;
      document.getElementById('githubModalOverlay').classList.add('active');
    });
    
    document.getElementById('githubModalClose').addEventListener('click', () => {
      document.getElementById('githubModalOverlay').classList.remove('active');
    });
    
    document.getElementById('githubModalCancel').addEventListener('click', () => {
      document.getElementById('githubModalOverlay').classList.remove('active');
    });
    
    document.getElementById('githubModalSave').addEventListener('click', () => {
      const token = document.getElementById('githubTokenInput').value.trim();
      const imgbbKey = document.getElementById('imgbbApiKey').value.trim();
      
      if (token) {
        localStorage.setItem('amy_github_token', token);
      } else {
        localStorage.removeItem('amy_github_token');
      }
      
      if (imgbbKey) {
        localStorage.setItem('amy_imgbb_api_key', imgbbKey);
      } else {
        localStorage.removeItem('amy_imgbb_api_key');
      }
      
      document.getElementById('githubModalOverlay').classList.remove('active');
      this.showToast('Pengaturan Editor disimpan lokal', 'success');
    });
    
    document.getElementById('btnSaveGithub').addEventListener('click', () => this.saveToGithub());
    const btnPushGithub = document.getElementById('btnPushGithub');
    if (btnPushGithub) btnPushGithub.addEventListener('click', () => this.saveToGithub());
    
    document.getElementById('importFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      this.currentFileName = file.name;
      document.getElementById('editorTitle').innerText = `Edit: ${this.currentFileName}`;
      
      const reader = new FileReader();
      reader.onload = (ev) => this.importHTML(ev.target.result);
      reader.readAsText(file);
    });
    
    // Theme switch
    this.themeSelect.addEventListener('change', (e) => {
      const theme = e.target.value;
      const iframeDoc = this.previewContent.ownerDocument; // We are rendering directly into a div, so just update body dataset
      if (theme) {
        document.documentElement.dataset.theme = theme;
      } else {
        delete document.documentElement.dataset.theme;
      }
    });

    // Mobile toggle preview
    const btnToggle = document.getElementById('btnTogglePreview');
    btnToggle.addEventListener('click', () => {
      const layout = document.getElementById('editorLayout');
      layout.classList.toggle('show-preview');
      btnToggle.innerText = layout.classList.contains('show-preview') ? '📝 Editor' : '👁️ Preview';
    });
    
    if (window.innerWidth <= 900) {
      btnToggle.style.display = 'block';
    }
  },
  
  generateId() {
    return 'block_' + Math.random().toString(36).substr(2, 9);
  },
  
  saveHistory() {
    if (this.isRestoringHistory) return;
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    const snapshot = {
      blocks: JSON.parse(JSON.stringify(this.blocks)),
      metadata: JSON.parse(JSON.stringify(this.metadata))
    };
    this.history.push(snapshot);
    if (this.history.length > 50) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
    this.updateHistoryButtons();
  },
  
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreHistoryState(this.history[this.historyIndex]);
    }
  },
  
  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreHistoryState(this.history[this.historyIndex]);
    }
  },
  
  restoreHistoryState(state) {
    this.isRestoringHistory = true;
    this.blocks = JSON.parse(JSON.stringify(state.blocks));
    this.metadata = JSON.parse(JSON.stringify(state.metadata));
    
    this.titleInput.value = this.metadata.title;
    this.eyebrowInput.value = this.metadata.eyebrow;
    this.prevInput.value = this.metadata.prevLink;
    this.nextInput.value = this.metadata.nextLink;
    
    this.renderBlocks();
    this.triggerPreviewUpdate();
    
    this.updateHistoryButtons();
    
    setTimeout(() => { this.isRestoringHistory = false; }, 50);
  },
  
  updateHistoryButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = this.historyIndex <= 0;
    if (btnRedo) btnRedo.disabled = this.historyIndex >= this.history.length - 1;
  },
  
  addBlock(type, afterId = null, initialContent = '') {
    const newBlock = {
      id: this.generateId(),
      type: type,
      content: initialContent
    };
    
    if (type === 'list') {
      newBlock.listType = 'ul';
      newBlock.listItems = [''];
    }
    
    if (afterId) {
      const index = this.blocks.findIndex(b => b.id === afterId);
      if (index !== -1) {
        this.blocks.splice(index + 1, 0, newBlock);
      } else {
        this.blocks.push(newBlock);
      }
    } else {
      this.blocks.push(newBlock);
    }
    
    this.renderBlocks();
    this.saveHistory();
    
    // Focus new block
    setTimeout(() => {
      const el = document.getElementById(newBlock.id);
      if (el) {
        this.scrollToEditorBlock(newBlock.id);
        
        setTimeout(() => {
          const editable = el.querySelector('.block-content');
          if (editable) editable.focus();
        }, 200); // Wait for scroll
      }
    }, 50);
  },
  
  removeBlock(id) {
    this.blocks = this.blocks.filter(b => b.id !== id);
    this.renderBlocks();
    this.triggerPreviewUpdate();
    this.saveHistory();
  },
  
  moveBlock(id, direction) {
    const index = this.blocks.findIndex(b => b.id === id);
    if (index === -1) return;
    
    if (direction === 'up' && index > 0) {
      const temp = this.blocks[index];
      this.blocks[index] = this.blocks[index - 1];
      this.blocks[index - 1] = temp;
    } else if (direction === 'down' && index < this.blocks.length - 1) {
      const temp = this.blocks[index];
      this.blocks[index] = this.blocks[index + 1];
      this.blocks[index + 1] = temp;
    } else if (direction === 'top' && index > 0) {
      const block = this.blocks.splice(index, 1)[0];
      this.blocks.unshift(block);
    } else if (direction === 'bottom' && index < this.blocks.length - 1) {
      const block = this.blocks.splice(index, 1)[0];
      this.blocks.push(block);
    } else if (direction === 'mid') {
      const block = this.blocks.splice(index, 1)[0];
      const middleIndex = Math.floor(this.blocks.length / 2);
      this.blocks.splice(middleIndex, 0, block);
    }
    
    this.renderBlocks();
    this.triggerPreviewUpdate();
    this.saveHistory();
  },
  
  updateBlockContent(id, content) {
    const block = this.blocks.find(b => b.id === id);
    if (block) {
      block.content = content;
      this.triggerPreviewUpdate();
    }
  },
  
  updateListBlock(id, index, content) {
    const block = this.blocks.find(b => b.id === id);
    if (block && block.listItems) {
      block.listItems[index] = content;
      this.triggerPreviewUpdate();
    }
  },
  
  changeBlockType(id, newType) {
    const block = this.blocks.find(b => b.id === id);
    if (!block || block.type === newType) return;
    
    let oldContent = block.content || '';
    if (block.type === 'image') oldContent = block.imageCaption || '';
    if (block.type === 'list') oldContent = block.listItems ? block.listItems.join('<br>') : '';
    
    // Changing TO list
    if (newType === 'list') {
      block.listType = 'ul';
      const items = oldContent.replace(/<\/div>/g, '').split(/<br>|<div>/);
      block.listItems = items.filter(i => i.trim() !== '');
      if (block.listItems.length === 0) block.listItems = [''];
    } 
    // Changing FROM list
    else if (block.type === 'list') {
      block.content = block.listItems.join('<br>');
    }
    // Changing TO image
    else if (newType === 'image') {
      block.imageCaption = oldContent.replace(/<[^>]+>/g, ''); // strip HTML
      block.imageUrl = ''; // Empty image
    }
    // Changing FROM image
    else if (block.type === 'image') {
      block.content = block.imageCaption || '';
    }
    // Changing Text to Text
    else {
      block.content = oldContent;
    }
    
    block.type = newType;
    this.renderBlocks();
    this.triggerPreviewUpdate();
    this.saveHistory();
  },
  
  renderBlocks() {
    this.container.innerHTML = '';
    
    this.blocks.forEach(block => {
      const blockEl = document.createElement('div');
      blockEl.className = 'editor-block';
      blockEl.id = block.id;
      blockEl.dataset.type = block.type;
      
      const typeIndicator = document.createElement('div');
      typeIndicator.className = 'block-type-indicator';
      
      const typeLabel = document.createElement('span');
      typeLabel.innerText = block.type.toUpperCase() + ' ▾';
      typeIndicator.appendChild(typeLabel);
      
      const dropdown = document.createElement('div');
      dropdown.className = 'type-dropdown-menu';
      dropdown.style.display = 'none';
      dropdown.innerHTML = `
        <div data-val="paragraph">Paragraph</div>
        <div data-val="heading2">Heading 2</div>
        <div data-val="heading3">Heading 3</div>
        <div data-val="list">List</div>
        <div data-val="image">Image</div>
        <div data-val="warning">Warning</div>
        <div data-val="note">Note</div>
        <div data-val="blockquote">Quote</div>
        <div data-val="code">Code</div>
      `;
      typeIndicator.appendChild(dropdown);
      
      typeIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.type-dropdown-menu').forEach(menu => {
           if (menu !== dropdown) menu.style.display = 'none';
        });
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
      });
      
      dropdown.querySelectorAll('div').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.style.display = 'none';
          Editor.changeBlockType(block.id, item.getAttribute('data-val'));
        });
      });
      
      blockEl.appendChild(typeIndicator);
      
      // Global click to select block
      blockEl.addEventListener('mousedown', () => {
        document.querySelectorAll('.editor-block').forEach(el => el.classList.remove('selected'));
        blockEl.classList.add('selected');
        Editor.selectedBlockId = block.id;
      });
      
      const actions = document.createElement('div');
      actions.className = 'block-actions';
      actions.innerHTML = `
        <button onclick="Editor.moveBlock('${block.id}', 'up')" title="Move Up">↑</button>
        <button onclick="Editor.moveBlock('${block.id}', 'down')" title="Move Down">↓</button>
        <button onclick="Editor.removeBlock('${block.id}')" class="delete" title="Delete">❌</button>
      `;
      blockEl.appendChild(actions);
      
      if (block.type === 'list') {
        const listContainer = document.createElement('div');
        block.listItems.forEach((item, index) => {
          const itemEl = document.createElement('div');
          itemEl.style.display = 'flex';
          itemEl.style.gap = '8px';
          itemEl.style.marginBottom = '4px';
          itemEl.innerHTML = `
            <span style="color:var(--text-muted)">•</span>
            <div class="block-content" contenteditable="true" style="flex:1" data-placeholder="List item...">${item}</div>
          `;
          
          const editable = itemEl.querySelector('.block-content');
          editable.addEventListener('input', (e) => this.updateListBlock(block.id, index, e.target.innerHTML));
          
          editable.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              block.listItems.splice(index + 1, 0, '');
              this.renderBlocks();
              // focus next
            } else if (e.key === 'Backspace' && editable.innerHTML === '') {
              e.preventDefault();
              if (block.listItems.length > 1) {
                block.listItems.splice(index, 1);
                this.renderBlocks();
              } else {
                this.removeBlock(block.id);
              }
            }
          });
          
          listContainer.appendChild(itemEl);
        });
        blockEl.appendChild(listContainer);
        
      } else if (block.type === 'image') {
        const imgContainer = document.createElement('div');
        imgContainer.className = 'image-block';
        
        if (block.imageUrl) {
          imgContainer.innerHTML = `
            <img src="${block.imageUrl}">
            ${block.imageCaption ? `<div style="font-size:12px; color:var(--text-muted); margin-top:8px;">${block.imageCaption}</div>` : ''}
            <div class="image-controls">
              <button onclick="Editor.editImage('${block.id}')">⚙️ Edit Gambar</button>
            </div>
          `;
        } else {
          imgContainer.innerHTML = `
            <div class="placeholder" onclick="Editor.editImage('${block.id}')">
              <div style="font-size:24px;">🖼️</div>
              <div>Klik untuk upload gambar</div>
            </div>
          `;
        }
        blockEl.appendChild(imgContainer);
        
      } else {
        // Text blocks (paragraph, heading, warning, note, blockquote)
        const contentEl = document.createElement('div');
        contentEl.className = `block-content ${block.type}-content`;
        contentEl.contentEditable = true;
        contentEl.innerHTML = block.content;
        contentEl.dataset.placeholder = `Type ${block.type} here...`;
        
        contentEl.addEventListener('input', (e) => this.updateBlockContent(block.id, e.target.innerHTML));
        contentEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.addBlock('paragraph', block.id);
          } else if (e.key === 'Backspace' && contentEl.innerHTML === '') {
            e.preventDefault();
            this.removeBlock(block.id);
          }
        });
        
        // Focus state
        contentEl.addEventListener('focus', () => {
          blockEl.classList.add('selected');
          Editor.selectedBlockId = block.id;
        });
        contentEl.addEventListener('blur', () => {
          blockEl.classList.remove('selected');
          this.saveHistory();
        });
        
        blockEl.appendChild(contentEl);
      }
      
      this.container.appendChild(blockEl);
      
      // Add inline + button
      const addBtn = document.createElement('div');
      addBtn.className = 'add-block-btn';
      addBtn.innerHTML = '+';
      addBtn.onclick = () => this.addBlock('paragraph', block.id);
      this.container.appendChild(addBtn);
    });
    
    this.renderNavigator();
    this.triggerPreviewUpdate();
  },
  
  editImage(blockId) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return;
    
    ImageManager.showModal(block, (newData) => {
      block.imageUrl = newData.imageUrl;
      block.imageCaption = newData.imageCaption;
      block.imageSize = newData.imageSize;
      block.imagePosition = newData.imagePosition;
      
      this.renderBlocks();
      this.triggerPreviewUpdate();
      this.saveHistory();
    });
  },
  
  // Preview
  previewTimeout: null,
  triggerPreviewUpdate() {
    clearTimeout(this.previewTimeout);
    this.previewTimeout = setTimeout(() => {
      this.updatePreview();
      this.autoSave();
      this.saveStatus.innerText = '• Perubahan belum disimpan';
    }, 300);
  },
  
  updatePreview() {
    const html = HtmlIO.exportHtml(this.metadata, this.blocks);
    
    // We only want the inner part of article for the preview div
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const article = doc.querySelector('.article');
    
    if (article) {
      this.previewContent.innerHTML = article.innerHTML;
    }
  },
  
  // I/O
  importHTML(htmlString) {
    const result = HtmlIO.importHtml(htmlString);
    this.metadata = result.metadata;
    this.blocks = result.blocks;
    
    this.titleInput.value = this.metadata.title;
    this.eyebrowInput.value = this.metadata.eyebrow;
    this.prevInput.value = this.metadata.prevLink;
    this.nextInput.value = this.metadata.nextLink;
    
    this.renderBlocks();
    this.showToast('HTML berhasil di-import', 'success');
  },
  
  exportHTML() {
    const html = HtmlIO.exportHtml(this.metadata, this.blocks);
    
    // Create download link
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const urlParams = new URLSearchParams(window.location.search);
    const fileName = urlParams.get('file') || 'materi-export.html';
    
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.saveStatus.innerText = '✓ Tersimpan';
    this.showToast(`HTML diekspor sebagai ${fileName}`, 'success');
  },
  
  async saveToGithub() {
    const urlParams = new URLSearchParams(window.location.search);
    const folder = urlParams.get('folder');
    // Prioritas path save: Gunakan "folder" + "file" dari URL editor secara absolut
    const file = urlParams.get('file');
    
    if (!folder || !file) {
      alert("Error: Folder atau file tidak ditemukan di URL. Anda harus membuka materi melalui Dashboard Admin.");
      return;
    }
    
    const token = localStorage.getItem('amy_github_token');
    if (!token) {
      alert("GitHub token belum diisi. Silakan klik tombol ⚙️ Pengaturan Editor.");
      return;
    }
    
    const actualFilePath = `${folder}/${file}`;
    const baseFilename = file.replace('.html', '');
    const timestamp = Date.now();
    let imageCounter = 0;
    
    const filesToCommit = [];
    
    // Process images
    this.blocks.forEach(block => {
      if (block.type === 'image' && block.imageUrl && block.imageUrl.startsWith('data:image/')) {
        imageCounter++;
        const imagePath = `images/materi/${folder}/${baseFilename}-${timestamp}-${imageCounter}.jpg`;
        const relativeHtmlPath = `../images/materi/${folder}/${baseFilename}-${timestamp}-${imageCounter}.jpg`;
        
        // Extract base64 (remove 'data:image/jpeg;base64,')
        const base64Data = block.imageUrl.split(',')[1];
        
        filesToCommit.push({
          path: imagePath,
          content: base64Data
        });
        
        // Update URL to relative path for HTML export
        block.imageUrl = relativeHtmlPath;
      }
    });
    
    const html = HtmlIO.exportHtml(this.metadata, this.blocks);
    
    // Validasi gambar base64 tersisa yang mungkin tidak tertangkap
    if (html.includes('data:image/') || html.includes('base64,')) {
      alert('Peringatan: Masih ada gambar base64 yang tidak valid di konten.');
      this.saveStatus.innerText = '❌ Gagal menyimpan';
      return;
    }
    
    const confirmMsg = `File yang akan disimpan ke GitHub:\n1. ${actualFilePath}\n${filesToCommit.length > 0 ? '+ ' + filesToCommit.length + ' file gambar' : ''}\n\nLanjutkan?`;
    if (!confirm(confirmMsg)) {
      this.saveStatus.innerText = 'Batal menyimpan';
      return;
    }
    
    // Encode UTF-8 to Base64 safely for HTML
    const encoder = new TextEncoder();
    const data = encoder.encode(html);
    let binary = '';
    for (let i = 0; i < data.byteLength; i++) {
      binary += String.fromCharCode(data[i]);
    }
    const contentBase64 = btoa(binary);
    
    filesToCommit.push({
      path: actualFilePath,
      content: contentBase64
    });
    
    this.saveStatus.innerText = 'Menyimpan ke GitHub...';
    
    try {
      await this.commitMultipleFiles(
        token, 
        'suhaimitoamy/amy-trading-academy', 
        'main', 
        filesToCommit, 
        `Update materi: ${file} beserta ${filesToCommit.length - 1} gambar`
      );
      this.saveStatus.innerText = '✓ Berhasil disimpan';
      this.showToast('Berhasil disimpan ke GitHub secara instan.', 'success');
      
      // Remove draft after successful save
      const draftKey = `amy_admin_draft_${folder}_${file}`;
      localStorage.removeItem(draftKey);
      
      this.triggerPreviewUpdate(); // re-render preview
    } catch (err) {
      console.error(err);
      this.saveStatus.innerText = '❌ Gagal menyimpan';
      alert('Gagal mengirim ke GitHub. Error: ' + err.message);
    }
  },

  async commitMultipleFiles(token, repo, branch, files, commitMessage) {
    const baseUrl = `https://api.github.com/repos/${repo}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    // 1. Get branch ref
    let res = await fetch(`${baseUrl}/git/ref/heads/${branch}`, { headers });
    if (!res.ok) throw new Error('Gagal membaca branch reference');
    const refData = await res.json();
    const commitSha = refData.object.sha;

    // 2. Get commit
    res = await fetch(`${baseUrl}/git/commits/${commitSha}`, { headers });
    if (!res.ok) throw new Error('Gagal membaca detail commit');
    const commitData = await res.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs
    const treeItems = [];
    for (const file of files) {
      res = await fetch(`${baseUrl}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: file.content,
          encoding: 'base64'
        })
      });
      if (!res.ok) throw new Error(`Gagal membuat blob untuk ${file.path}`);
      const blobData = await res.json();
      treeItems.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha
      });
    }

    // 4. Create tree
    res = await fetch(`${baseUrl}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });
    if (!res.ok) throw new Error('Gagal membuat tree');
    const treeData = await res.json();
    const newTreeSha = treeData.sha;

    // 5. Create commit
    res = await fetch(`${baseUrl}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: commitMessage,
        tree: newTreeSha,
        parents: [commitSha]
      })
    });
    if (!res.ok) throw new Error('Gagal membuat commit');
    const newCommitData = await res.json();
    const newCommitSha = newCommitData.sha;

    // 6. Update reference
    res = await fetch(`${baseUrl}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sha: newCommitSha
      })
    });
    if (!res.ok) throw new Error('Gagal mengupdate branch reference');
    return await res.json();
  },
  
  async loadFromServer(folder, file) {
    try {
      this.saveStatus.innerText = 'Memuat...';
      const response = await fetch(`../${folder}/${file}`);
      if (response.ok) {
        const html = await response.text();
        this.importHTML(html);
        this.saveStatus.innerText = '✓ Dimuat';
      } else {
        throw new Error('File not found');
      }
    } catch (err) {
      this.showToast('Gagal memuat file dari server. Mulai dokumen kosong.', 'error');
      this.addBlock('paragraph');
      this.saveStatus.innerText = 'Gagal memuat';
    }
  },
  
  autoSave() {
    const urlParams = new URLSearchParams(window.location.search);
    const folder = urlParams.get('folder');
    const file = urlParams.get('file');
    const key = `amy_admin_draft_${folder || 'new'}_${file || 'materi'}`;
    
    const data = {
      metadata: this.metadata,
      blocks: this.blocks
    };
    
    localStorage.setItem(key, JSON.stringify(data));
  },
  
  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
  
  scrollToEditorBlock(blockId) {
    const layout = document.getElementById('editorLayout');
    const targetBlock = document.getElementById(blockId);
    const editorPanel = document.querySelector('.editor-panel');
    const topbar = document.querySelector('.admin-topbar');

    if (!targetBlock) return;

    if (layout) {
      layout.classList.remove('show-nav');
      layout.classList.remove('show-add-block');
    }

    setTimeout(() => {
      const safeOffset = (topbar?.offsetHeight || 120) + 24;

      if (editorPanel) {
        const panelRect = editorPanel.getBoundingClientRect();
        const blockRect = targetBlock.getBoundingClientRect();
        const targetTop = editorPanel.scrollTop + blockRect.top - panelRect.top - safeOffset;

        editorPanel.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'smooth'
        });
      } else {
        const elementPosition = targetBlock.getBoundingClientRect().top + window.scrollY;
        const offsetPosition = elementPosition - safeOffset;

        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });
      }

      targetBlock.classList.add('highlight');
      setTimeout(() => targetBlock.classList.remove('highlight'), 2000);
      this.selectedBlockId = blockId;
    }, 180);
  },

  renderNavigator() {
    if (!this.navBody) return;
    this.navBody.innerHTML = '';
    
    this.blocks.forEach((block, index) => {
      if (this.navFilter === 'image' && block.type !== 'image') return;
      
      const el = document.createElement('div');
      el.className = 'nav-item';
      el.draggable = true;
      el.dataset.id = block.id;
      
      let label = '';
      if (block.type === 'paragraph') label = 'P — ' + (block.content.replace(/<[^>]+>/g, '').substring(0, 30) || 'Kosong...');
      else if (block.type === 'heading2') label = 'H2 — ' + block.content.replace(/<[^>]+>/g, '');
      else if (block.type === 'heading3') label = 'H3 — ' + block.content.replace(/<[^>]+>/g, '');
      else if (block.type === 'image') label = '🖼️ Gambar — ' + (block.imageCaption || 'tanpa caption');
      else if (block.type === 'warning') label = '⚠️ Warning';
      else if (block.type === 'note') label = '💡 Note';
      else if (block.type === 'list') label = 'List — ' + (block.listItems?.[0]?.replace(/<[^>]+>/g, '').substring(0,20) || 'Kosong');
      else if (block.type === 'blockquote') label = '❞ Quote';
      else if (block.type === 'code') label = '</> Code';
      else label = block.type;
      
      const titleEl = document.createElement('div');
      titleEl.className = 'nav-item-title';
      titleEl.innerText = label;
      el.appendChild(titleEl);
      
      // Jump to block
      el.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        Editor.scrollToEditorBlock(block.id);
      });
      
      // Drag & Drop
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', block.id);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== block.id) {
          const draggedIndex = this.blocks.findIndex(b => b.id === draggedId);
          const targetIndex = this.blocks.findIndex(b => b.id === block.id);
          if (draggedIndex > -1 && targetIndex > -1) {
            const [draggedBlock] = this.blocks.splice(draggedIndex, 1);
            this.blocks.splice(targetIndex, 0, draggedBlock);
            this.renderBlocks();
            this.triggerPreviewUpdate();
          }
        }
      });
      
      // Quick Controls for Image
      if (block.type === 'image') {
        const controls = document.createElement('div');
        controls.className = 'nav-item-controls';
        
        const btnTop = document.createElement('button');
        btnTop.innerText = 'Top';
        btnTop.onclick = (e) => { e.stopPropagation(); this.moveBlock(block.id, 'top'); };
        
        const btnUp = document.createElement('button');
        btnUp.innerText = '↑';
        btnUp.onclick = (e) => { e.stopPropagation(); this.moveBlock(block.id, 'up'); };
        
        const btnMid = document.createElement('button');
        btnMid.innerText = 'Mid';
        btnMid.onclick = (e) => { e.stopPropagation(); this.moveBlock(block.id, 'mid'); };
        
        const btnDown = document.createElement('button');
        btnDown.innerText = '↓';
        btnDown.onclick = (e) => { e.stopPropagation(); this.moveBlock(block.id, 'down'); };
        
        const btnBottom = document.createElement('button');
        btnBottom.innerText = 'Bottom';
        btnBottom.onclick = (e) => { e.stopPropagation(); this.moveBlock(block.id, 'bottom'); };
        
        controls.appendChild(btnTop);
        controls.appendChild(btnUp);
        controls.appendChild(btnMid);
        controls.appendChild(btnDown);
        controls.appendChild(btnBottom);
        
        el.appendChild(controls);
      }
      
      this.navBody.appendChild(el);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => Editor.init());


/* AMYFX_NOTIFY_GUARD_START */
(function(){
  if(window.__amyfxNotifyGuardLoaded)return;
  window.__amyfxNotifyGuardLoaded=true;

  const STORE='amyfx.notify.last.sent';
  const COOLDOWN=5*60*1000;
  const RESUME_MUTE=9000;
  const MAX_ITEMS=80;
  let muteUntil=0;

  function now(){return Date.now()}
  function norm(x){
    return String(x||'')
      .replace(/\d+([.,]\d+)?/g,'#')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,180);
  }
  function kind(t,b){
    const x=(String(t||'')+' '+String(b||'')).toLowerCase();
    if(x.includes('scanner terhubung'))return 'scanner_connected';
    if(x.includes('amy fx aktif'))return 'scanner_alive';
    if(x.includes('liquidity sweep'))return 'liquidity_sweep';
    if(x.includes('ssl')||x.includes('bsl'))return 'bsl_ssl_touched';
    return 'amyfx_alert';
  }
  function key(t,b){
    return kind(t,b)+'|'+norm(t)+'|'+norm(b);
  }
  function read(){
    try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}
  }
  function write(o){
    const arr=Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,MAX_ITEMS);
    localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(arr)));
  }
  function route(t,b){
    const k=kind(t,b);
    if(k==='liquidity_sweep')return 'Analyze';
    if(k==='bsl_ssl_touched')return 'Analyze';
    if(k==='scanner_connected'||k==='scanner_alive')return 'Dashboard';
    return 'Analyze';
  }
  function openRoute(t,b){
    const r=route(t,b);
    try{localStorage.setItem('amyfx.notification.route',r)}catch(e){}
    try{if(typeof setTab==='function')setTab(r)}catch(e){}
    try{window.focus()}catch(e){}
  }
  function allow(t,b){
    const n=now();
    const k=key(t,b);

    if(n<muteUntil && kind(t,b)!=='scanner_alive')return false;

    const last=read();
    const prev=last[k]||0;
    if(n-prev<COOLDOWN)return false;

    last[k]=n;
    write(last);
    return true;
  }

  document.addEventListener('visibilitychange',function(){
    if(!document.hidden){
      muteUntil=now()+RESUME_MUTE;
    }
  });

  window.addEventListener('pageshow',function(){
    muteUntil=now()+RESUME_MUTE;
  });

  try{
    if('Notification' in window && !window.Notification.__amyfxWrapped){
      const OriginalNotification=window.Notification;
      const WrappedNotification=function(title,opts){
        opts=opts||{};
        const body=opts.body||'';
        if(!allow(title,body))return null;
        const n=new OriginalNotification(title,opts);
        n.onclick=function(){openRoute(title,body)};
        return n;
      };
      Object.getOwnPropertyNames(OriginalNotification).forEach(function(k){
        try{WrappedNotification[k]=OriginalNotification[k]}catch(e){}
      });
      WrappedNotification.prototype=OriginalNotification.prototype;
      WrappedNotification.__amyfxWrapped=true;
      window.Notification=WrappedNotification;
    }
  }catch(e){}

  function wrapBridge(obj){
    if(!obj||obj.__amyfxNotifyBridgeWrapped)return;
    Object.keys(obj).forEach(function(k){
      if(!/notify|notification|alert|push/i.test(k))return;
      if(typeof obj[k]!=='function')return;
      const old=obj[k];
      obj[k]=function(){
        const args=[].slice.call(arguments);
        const title=args[0]||'Amy FX';
        const body=args[1]||args[0]||'';
        if(!allow(title,body))return null;
        try{return old.apply(this,args)}catch(e){return null}
      };
    });
    obj.__amyfxNotifyBridgeWrapped=true;
  }

  function wrapAll(){
    ['Android','AndroidBridge','AmyFX','AmyFx','Native','NotificationBridge','AppBridge'].forEach(function(n){
      try{wrapBridge(window[n])}catch(e){}
    });
  }

  wrapAll();
  setInterval(wrapAll,1500);

  window.__amyfxNotifyAllow=allow;
  window.__amyfxNotifyOpenRoute=openRoute;
})();
/* AMYFX_NOTIFY_GUARD_END */

