// Builds dist/socialistem-preview.html: the member app as one self-contained page for the Claude preview
// (data and AI through Claude's artifact capabilities instead of the Node server).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const app = read('public/app.html');
const body = app.slice(app.indexOf('<body>') + 6, app.indexOf('</body>'))
  .replace('data-mode="server"', 'data-mode="artifact"')
  .replace('<script src="/assets/core.js"></script>', () => '<script>\n' + read('public/assets/core.js') + '\n</script>')
  .replace('<script src="/assets/app.js"></script>', () => '<script>\n' + read('public/assets/app.js') + '\n</script>');
const head = `<title>Socialistem</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap">
<style>
${read('public/assets/styles.css')}
</style>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'socialistem-preview.html');
fs.writeFileSync(out, head + body);
console.log('Built ' + out);
