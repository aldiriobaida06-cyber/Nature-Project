
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const container = document.querySelector('.grid-layout');
 const apiKey = `x1LHLKRr2IaRgjM_vYyMyufsxUrXs6nokQWeBcDDM8E`;

async function fetchWallpapers(query) {
    try {
        const url =  `https://api.unsplash.com/search/photos?query=${query}&client_id=${apiKey}`;
        container.innerHTML =   `<p style=" text-align: center;  color: white;width: 100%;">Loading...</p>`;

        const response = await fetch(url);
        if (!response.ok) {
            console.warn('Server response was not ok');
            container.innerHTML = `<p style="color: red; text-align: center; width: 100%;">Failed to load images from server.</p>`;
            return;
        }
        const data = await response.json();
        console.log("Data coming from the server", data);

        displayWallpapers(data.results);

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `<p style="color: red; text-align: center; width: 100%;">Sorry, unable to load images at the moment.</p>`;
    }
}

function displayWallpapers(images) {
    container.innerHTML = '';
    if (!images || images.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: white; width: 100%;">No images found for this keyword.</p>`;
        return;
    }
    images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-image" style="background-image: url('${img.urls.regular}');"></div>
            <div class="card-info">
                <h3>${img.description || img.alt_description || 'Nature Wallpaper'}</h3>
                <p>By ${img.user.name || img.user.username}</p>
                <button class="download-btn" data-download-url="${img.urls.full}">Download Full Size</button>
            </div>
        `;
        container.appendChild(card);
    });
}
container.addEventListener('click', function (e) {
    if (e.target.classList.contains('download-btn')) {
        const imageUrl = e.target.getAttribute('data-download-url');
        if (imageUrl) {
            const downloadAnchor = document.createElement('a');
            downloadAnchor.href = imageUrl;
            downloadAnchor.target = '_blank';
            downloadAnchor.rel = 'opener referrer';
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            document.body.removeChild(downloadAnchor);
        }
    }
});
searchBtn.addEventListener('click', function () {
    const query = searchInput.value.trim().toLowerCase();

    if (query === "") {
        alert("Please enter a keyword to search!");
        return;
    }
    fetchWallpapers(query).catch(err => console.error(err));
});

searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});
