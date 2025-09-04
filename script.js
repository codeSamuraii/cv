pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const VIEWPORT_HEIGHT_RATIO = 0.9;

let linkInfo = {};
let linkElements = [];
let activePreview = null;

async function loadLinkInfo() {
    try {
        const response = await fetch('links.json');
        linkInfo = await response.json();
    } catch (error) {
        console.error('Error loading links.json:', error);
        linkInfo = {};
    }
}

function createLinkPreviews() {
    const container = document.getElementById('link-previews');
    container.innerHTML = '';
    linkElements = [];
    
    // Separate links by style
    const mainLinks = [];
    const otherLinks = [];
    
    for (const [key, info] of Object.entries(linkInfo)) {
        const linkData = { key, info };
        if (info.style === 'main') {
            mainLinks.push(linkData);
        } else {
            otherLinks.push(linkData);
        }
    }
    
    // Create main links
    mainLinks.forEach(({ key, info }) => {
        createLinkPreview(key, info, container, false);
    });
    
    // Add separator if we have both types
    if (mainLinks.length > 0 && otherLinks.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'link-separator';
        container.appendChild(separator);
    }
    
    // Create other links
    otherLinks.forEach(({ key, info }) => {
        createLinkPreview(key, info, container, true);
    });
}

function createLinkPreview(key, info, container, isOther) {
    const preview = document.createElement('div');
    preview.className = isOther ? 'link-preview other' : 'link-preview';
    preview.dataset.key = key;
    
    // Build the full URL
    const url = key.startsWith('http') ? key : `https://${key}`;
    preview.dataset.url = url;
    
    let toolsHtml = '';
    if (info.tools && Array.isArray(info.tools)) {
        const toolItems = info.tools.map(tool => `<span class="tool-item">${tool}</span>`).join('');
        toolsHtml = `<div class="tools">${toolItems}</div>`;
    }
    
    preview.innerHTML = `
        <h3>${info.title}</h3>
        <p>${info.description}</p>
        ${toolsHtml}
    `;
    
    preview.addEventListener('click', () => {
        window.open(url, '_blank');
    });
    
    preview.addEventListener('mouseenter', (e) => {
        if (activePreview) {
            activePreview.classList.remove('active');
        }
        e.currentTarget.classList.add('active');
        activePreview = e.currentTarget;
    });
    
    preview.addEventListener('mouseleave', (e) => {
        e.currentTarget.classList.remove('active');
        if (activePreview === e.currentTarget) {
            activePreview = null;
        }
    });
    
    container.appendChild(preview);
    linkElements.push(preview);
}

function createLinkClickHandler(url) {
    return () => {
        window.open(url, '_blank');
    };
}

function createLinkMouseEnterHandler() {
    return (e) => {
        const { url } = e.target.dataset;
        
        // Find matching preview in sidebar
        const preview = linkElements.find(el => {
            const elUrl = el.dataset.url;
            const elKey = el.dataset.key;
            return url.includes(elKey) || elUrl === url;
        });
        
        if (preview) {
            if (activePreview) {
                activePreview.classList.remove('active');
            }
            preview.classList.add('active');
            activePreview = preview;
        }
    };
}

function createLinkMouseLeaveHandler() {
    return () => {
        if (activePreview) {
            activePreview.classList.remove('active');
            activePreview = null;
        }
    };
}

async function loadPDF() {
    await loadLinkInfo();
    createLinkPreviews();
    
    try {
        const loadingTask = pdfjsLib.getDocument('CV_Remi_Heneault.pdf');
        const pdf = await loadingTask.promise;
        
        document.getElementById('loading').style.display = 'none';
        
        const container = document.getElementById('pdf-container');
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'page-wrapper';
            
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page';
            pageContainer.id = `page-${pageNum}`;
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            // Render at higher resolution for better quality
            const scale = 2.0;
            const viewport = page.getViewport({ scale });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            // Calculate display size to fit in viewport
            const viewportHeight = window.innerHeight * VIEWPORT_HEIGHT_RATIO;
            const displayHeight = viewportHeight;
            const displayWidth = (viewport.width / viewport.height) * displayHeight;
            
            canvas.style.width = `${displayWidth}px`;
            canvas.style.height = `${displayHeight}px`;
            
            pageContainer.style.width = `${displayWidth}px`;
            pageContainer.style.height = `${displayHeight}px`;
            
            await page.render({
                canvasContext: context,
                viewport
            }).promise;
            
            pageContainer.appendChild(canvas);
            
            const annotations = await page.getAnnotations();
            
            annotations.forEach(annotation => {
                if (annotation.subtype === 'Link' && annotation.url) {
                    const { rect } = annotation;
                    const linkOverlay = document.createElement('div');
                    linkOverlay.className = 'link-overlay';
                    linkOverlay.dataset.url = annotation.url;
                    
                    // Calculate position with proper scaling
                    const [x1, y1, x2, y2] = rect;
                    
                    // Scale from PDF coordinates to display coordinates
                    const scaleX = displayWidth / viewport.width;
                    const scaleY = displayHeight / viewport.height;
                    
                    const left = x1 * scale * scaleX;
                    const bottom = y1 * scale * scaleY;
                    const width = (x2 - x1) * scale * scaleX;
                    const height = (y2 - y1) * scale * scaleY;
                    
                    // Convert from bottom to top positioning
                    const top = displayHeight - bottom - height;
                    
                    linkOverlay.style.position = 'absolute';
                    linkOverlay.style.left = `${left}px`;
                    linkOverlay.style.top = `${top}px`;
                    linkOverlay.style.width = `${width}px`;
                    linkOverlay.style.height = `${height}px`;
                    
                    linkOverlay.addEventListener('click', createLinkClickHandler(annotation.url));
                    linkOverlay.addEventListener('mouseenter', createLinkMouseEnterHandler());
                    linkOverlay.addEventListener('mouseleave', createLinkMouseLeaveHandler());
                    
                    pageContainer.appendChild(linkOverlay);
                }
            });
            
            pageWrapper.appendChild(pageContainer);
            container.appendChild(pageWrapper);
        }
        
    } catch (error) {
        console.error('Error loading PDF:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
    }
}

loadPDF();