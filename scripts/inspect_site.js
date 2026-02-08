const fs = require('fs');
const https = require('https');

https.get('https://sistemas.ciudaddecorrientes.gov.ar/usosuelo/', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        fs.writeFileSync('site_dump.html', data);
        console.log('Site dumped to site_dump.html');
    });
}).on('error', (err) => {
    console.error(err);
});
