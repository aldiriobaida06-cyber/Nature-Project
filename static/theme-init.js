(function () {
    var theme = null;
    try {
        var saved = localStorage.getItem('greenWingsTheme');
        if (saved === 'light' || saved === 'dark') theme = saved;
    } catch (e) { /* storage unavailable */ }
    if (!theme) {
        theme = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f7f5' : '#0a0a0a');
})();