(function () {
    try {
        var t = localStorage.getItem('bot_theme_v1') || 'dark';
        document.documentElement.setAttribute('data-theme', t);
    } catch (_) {
        /* noop */
    }
})();
