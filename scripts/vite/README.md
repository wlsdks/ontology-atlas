# scripts/vite

Vite plugins of the app build. `atlas-index-html.ts` writes the boot script and the loading picture
in every language into `index.html`, and serves the picture's stylesheet as a virtual module (the
document may hold no `<style>`). `atlas-app-folder.ts` removes the website-only files, and the repository-only ones, from the
folder the installed app loads.
