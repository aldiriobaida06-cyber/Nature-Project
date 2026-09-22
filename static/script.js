const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const container = document.querySelector('.grid-layout');

// NOTE: no Unsplash API key here anymore. The key now lives only on the
// server (see main.py: GET /api/photos), so it can never be read from
// the browser's Network tab or page source.

/* ---------- keyword filtering ---------- */

const BANNED_KEYWORDS = [
    'car', 'cars', 'vehicle', 'vehicles', 'crypto', 'bitcoin', 'ethereum', 'btc',
    'computer', 'laptop', 'bike', 'motorcycle', 'bicycle', 'train', 'plane', 'airplane',
    'rtx', 'gpu', 'monitor', 'screen', 'gadget', 'cartoon', 'illustration', 'vector', 'logo',
    'gaming', 'game', 'man', 'woman', 'person', 'people', 'girl', 'boy', 'human', 'fashion',
    'clothing', 'shoes', 'dress', 'model', 'house', 'building', 'city', 'street',
    'desktop', 'keyboard', 'phone', 'smartphone', 'iphone', 'technology', 'anime', 'manga',
    'interior', 'room', 'living room', 'kitchen', 'furniture', 'office', 'truck', 'trucks',
    'jeep', 'suv', 'automobile'
];

const NATURE_KEYWORDS = [
    'nature', 'landscape', 'forest', 'woods', 'tree', 'trees', 'mountain', 'mountains',
    'hill', 'hills', 'valley', 'river', 'lake', 'ocean', 'sea', 'beach', 'coast', 'cliff',
    'waterfall', 'canyon', 'desert', 'jungle', 'rainforest', 'wilderness', 'meadow', 'field',
    'garden', 'park', 'countryside', 'rural', 'scenic', 'outdoor', 'outdoors', 'sky', 'sunset',
    'sunrise', 'cloud', 'clouds', 'fog', 'mist', 'snow', 'ice', 'glacier', 'flower', 'flowers',
    'plant', 'plants', 'leaf', 'leaves', 'flora', 'fauna', 'wildlife', 'animal', 'animals',
    'bird', 'birds', 'grass', 'moss', 'rock', 'rocks', 'stone', 'island', 'peak', 'volcano',
    'autumn', 'winter', 'spring', 'summer', 'moon', 'stars', 'sun', 'earth', 'natural', 'green'
];

// Word-boundary match so 'man' doesn't match inside 'woman'/'mango',
// and 'car' doesn't match inside 'cartoon'/'scarf'.
function containsKeyword(text, keywords) {
    return keywords.some(keyword => {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
    });
}

function isNatureRelated(img) {
    const tagText = Array.isArray(img.tags)
        ? img.tags.map(t => t.title || '').join(' ')
        : '';

    const combinedText = `${img.description || ''} ${img.alt_description || ''} ${tagText}`.toLowerCase();

    if (containsKeyword(combinedText, BANNED_KEYWORDS)) {
        console.log('Image blocked due to banned keyword:', img.alt_description);
        return false;
    }

    return containsKeyword(combinedText, NATURE_KEYWORDS);
}

/* ---------- Unsplash search (via our own backend) ---------- */

async function fetchWallpapers(query) {
    try {
        const cleanQuery = query ? query.trim().toLowerCase() : 'nature';
        const scopedQuery = `${cleanQuery} nature landscape`;

        // Calls our FastAPI proxy instead of Unsplash directly, so the
        // Unsplash access key never has to leave the server.
        const url = `/api/photos?query=${encodeURIComponent(scopedQuery)}&per_page=12`;

        container.innerHTML = '';
        const loadingMsg = document.createElement('p');
        loadingMsg.style.textAlign = 'center';
        loadingMsg.style.color = 'white';
        loadingMsg.style.width = '100%';
        loadingMsg.textContent = 'Loading...';
        container.appendChild(loadingMsg);

        const response = await fetch(url);
        if (!response.ok) {
            console.warn('Server response was not ok');
            showError('Failed to load images from server.');
            return;
        }
        const data = await response.json();
        console.log('Data coming from the server', data);
        const rawResults = data.results || [];
        const natureResults = rawResults.filter(isNatureRelated);

        displayWallpapers(natureResults);

    } catch (error) {
        console.error('Error:', error);
        showError('Sorry, unable to load images at the moment.');
    }
}

function showError(message) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.style.color = 'red';
    p.style.textAlign = 'center';
    p.style.width = '100%';
    p.textContent = message;
    container.appendChild(p);
}

/* ---------- rendering (XSS-safe: no innerHTML with dynamic data) ---------- */

function buildWallpaperCard({ imageUrl, title, subtitle, downloadUrl }) {
    const card = document.createElement('div');
    card.className = 'card';

    const imageDiv = document.createElement('div');
    imageDiv.className = 'card-image';
    imageDiv.style.backgroundImage = `url("${imageUrl}")`;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'card-info';

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;

    const subtitleEl = document.createElement('p');
    subtitleEl.textContent = subtitle;

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.textContent = 'Download Full Size';
    downloadBtn.setAttribute('data-download-url', downloadUrl);

    infoDiv.append(titleEl, subtitleEl, downloadBtn);
    card.append(imageDiv, infoDiv);
    return card;
}

function displayWallpapers(images) {
    container.innerHTML = '';

    if (!images || images.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.style.textAlign = 'center';
        emptyState.style.width = '100%';
        emptyState.style.padding = '60px 20px';
        emptyState.style.color = '#94a3b8';

        const icon = document.createElement('div');
        icon.style.fontSize = '2.5rem';
        icon.style.marginBottom = '12px';
        icon.textContent = '🌿';

        const heading = document.createElement('h3');
        heading.style.color = '#f8fafc';
        heading.style.marginBottom = '8px';
        heading.style.fontSize = '1.2rem';
        heading.textContent = 'No Nature Wallpapers Found';

        const desc = document.createElement('p');
        desc.style.color = '#94a3b8';
        desc.style.maxWidth = '400px';
        desc.style.margin = '0 auto';
        desc.style.fontSize = '0.95rem';
        desc.textContent = 'We couldn\'t find a nature match for that search. Try a keyword like "forest", "mountains", "ocean" or "sunset" instead.';

        emptyState.append(icon, heading, desc);
        container.appendChild(emptyState);
        return;
    }

    images.forEach(img => {
        const card = buildWallpaperCard({
            imageUrl: img.urls.regular,
            title: img.description || img.alt_description || 'Nature Wallpaper',
            subtitle: `By ${img.user.name || img.user.username}`,
            downloadUrl: img.urls.full
        });
        container.appendChild(card);
    });
}

function prependWallpaperCard(wallpaper) {
    const card = buildWallpaperCard({
        imageUrl: wallpaper.image_url,
        title: wallpaper.title,
        subtitle: wallpaper.description || 'Uploaded by a Nature Haven visitor',
        downloadUrl: wallpaper.image_url
    });

    const wallpapersContainer = document.querySelector('.grid-layout');
    if (wallpapersContainer) {
        wallpapersContainer.prepend(card);
    } else {
        console.error('The image container was not found on the HTML page!');
    }
}

/* ---------- download handling ---------- */

container.addEventListener('click', async function (e) {
    const button = e.target.closest('.download-btn');
    if (button) {
        e.preventDefault();

        const imageUrl = button.getAttribute('data-download-url') || button.getAttribute('href');
        if (!imageUrl) return;

        const originalText = button.textContent;
        button.textContent = 'Downloading...';
        button.disabled = true;

        try {
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error('Network response was not ok');

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const downloadAnchor = document.createElement('a');
            downloadAnchor.href = blobUrl;
            downloadAnchor.download = `nature-haven-wallpaper-${Date.now()}.jpg`;
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            document.body.removeChild(downloadAnchor);
            window.URL.revokeObjectURL(blobUrl);

            showToast('Download successful! You can now set it as your device wallpaper from your downloads folder.');
        } catch (error) {
            console.error('Download failed:', error);
            showToast('Sorry, the download failed. Please try again.', true);
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }
});

function showToast(message, isError = false) {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification' + (isError ? ' toast-error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 3500);
}

/* ---------- search controls ---------- */

searchBtn.addEventListener('click', function () {
    const query = searchInput.value.trim().toLowerCase();

    if (query === '') {
        alert('Please enter a keyword to search!');
        return;
    }
    fetchWallpapers(query).catch(err => console.error(err));
});

searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});

/* ---------- contact form + admin messages panel ---------- */

document.addEventListener('DOMContentLoaded', function () {

    const usernameInput = document.getElementById('usernameInput');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    sendBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const text = messageInput.value.trim();

        if (!username || !text) {
            alert('Please enter your name and message first!');
            return;
        }
        const requestData = { username: username, text: text };

        try {
            // Relative path: works on localhost during development and on
            // whatever real domain this app ends up deployed to, with no
            // code changes needed.
            const response = await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            if (response.ok) {
                const result = await response.json();
                alert(`successfully: ${result.message}`);
                usernameInput.value = '';
                messageInput.value = '';
            } else {
                alert('An error occurred while sending data to the sever!');
            }
        } catch (error) {
            console.error('Error', error);
            alert('Could not connect to the server; ensure that Python is running!');
        }
    });

    const loadBtn = document.getElementById('loadBtn');
    const messagesContainer = document.getElementById('messagesContainer');

    if (loadBtn && messagesContainer) {
        loadBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/get-messages');
                if (response.ok) {
                    const messages = await response.json();
                    messagesContainer.innerHTML = '';

                    if (messages.length === 0) {
                        const empty = document.createElement('p');
                        empty.style.textAlign = 'center';
                        empty.style.color = '#999';
                        empty.textContent = 'No stored messages yet!';
                        messagesContainer.appendChild(empty);
                        return;
                    }

                    messages.forEach(msg => {
                        const messageElement = document.createElement('div');
                        messageElement.style.borderBottom = '1px solid #eee';
                        messageElement.style.padding = '10px 0';

                        const nameLabel = document.createElement('strong');
                        nameLabel.textContent = 'name: ';
                        const messageLabel = document.createElement('strong');
                        messageLabel.textContent = 'message: ';

                        // textContent (not innerHTML) so a username/message
                        // containing HTML/script can't execute in the page.
                        messageElement.append(
                            nameLabel,
                            document.createTextNode(msg.username),
                            document.createElement('br'),
                            messageLabel,
                            document.createTextNode(msg.text)
                        );
                        messagesContainer.appendChild(messageElement);
                    });
                } else {
                    alert('The server failed to read the data!');
                }
            } catch (error) {
                console.error('Error', error);
                alert('Connection error; ensure the server is running!');
            }
        });
    }
});

/* ---------- wallpaper upload ---------- */

const uploadForm = document.getElementById('uploadForm');
if (uploadForm) {
    uploadForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const titleInput = document.getElementById('uploadTitle');
        const descriptionInput = document.getElementById('uploadDescription');
        const fileInput = document.getElementById('uploadFile');
        const submitBtn = document.getElementById('uploadSubmitBtn');

        if (!fileInput.files || fileInput.files.length === 0) {
            alert('Please choose an image file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('title', titleInput.value.trim() || 'Untitled Wallpaper');
        formData.append('description', descriptionInput.value.trim());
        formData.append('file', fileInput.files[0]);

        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Uploading...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/upload-wallpaper', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Upload failed');
            }

            const newWallpaper = await response.json();
            prependWallpaperCard(newWallpaper);

            uploadForm.reset();
            showToast('Wallpaper uploaded and published successfully!');
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message || 'Something went wrong during upload.', true);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}










































































































































