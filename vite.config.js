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
            output: {
                // Manual chunk splitting for better caching
                manualChunks(id) {
                    // Firebase packages in separate chunk
                    if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
                        return 'vendor-firebase';
                    }
                    // Other vendor dependencies
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                    // Canvas-related code in separate chunk
                    if (id.includes('canvas-engine') || id.includes('canvas-cards') ||
                        id.includes('canvas-headers') || id.includes('canvas-selection')) {
                        return 'canvas';
                    }
                },
                // Optimize chunk naming for better caching
                chunkFileNames: 'assets/[name]-[hash].js',
                entryFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            },
        },
        emptyOutDir: true,
        // Increase chunk size warning limit (500kb is reasonable for modern apps)
        chunkSizeWarningLimit: 500,
        // Enable minification and tree-shaking
        minify: 'esbuild',
        target: 'es2020',
        // Optimize CSS
        cssCodeSplit: true,
        cssMinify: true,
        // Source maps for production debugging (optional, can disable for smaller builds)
        sourcemap: false,
    },
    server: {
        port: 5173,
        host: true, // Listen on all network interfaces (0.0.0.0)
        open: true
    },
    // Optimize deps
    optimizeDeps: {
        include: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
        exclude: [],
    },
});
