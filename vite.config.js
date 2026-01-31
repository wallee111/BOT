import { defineConfig } from 'vite';
import { resolve } from 'path';
import { glob } from 'glob';

// Find all HTML files in the root to use as entry points
const htmlFiles = glob.sync('*.html').reduce((entries, file) => {
    const name = file.replace(/\.html$/, '');
    entries[name] = resolve(__dirname, file);
    return entries;
}, {});

export default defineConfig({
    root: '.',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: htmlFiles,
        },
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        open: true
    }
});
