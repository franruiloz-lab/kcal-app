const http = require('http');
const https = require('https');

const GROK_API_KEY = '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';
const PORT = 3000;

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/api/analyze') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            const { text } = JSON.parse(body);

            const grokPayload = JSON.stringify({
                model: 'grok-beta',
                messages: [{
                    role: 'user',
                    content: `Analiza esta frase sobre comida y extrae los alimentos con sus cantidades estimadas en gramos.

Frase: "${text}"

Responde SOLO con JSON en este formato exacto:
{"foods": [{"name": "nombre", "grams": número, "searchTerm": "término para buscar"}]}

Porciones típicas:
- Tostada: 50g
- Aceite (cucharada): 10g
- Huevo: 50g
- Manzana: 150g
- Plátano: 120g
- Yogur: 125g
- Leche (vaso): 200ml
- Café: 5g

Solo JSON, sin explicaciones.`
                }],
                temperature: 0.3,
                stream: false
            });

            const options = {
                hostname: 'api.x.ai',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROK_API_KEY}`,
                    'Content-Length': Buffer.byteLength(grokPayload)
                }
            };

            const grokReq = https.request(options, (grokRes) => {
                let data = '';

                grokRes.on('data', chunk => {
                    data += chunk;
                });

                grokRes.on('end', () => {
                    res.writeHead(grokRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(data);
                });
            });

            grokReq.on('error', (error) => {
                console.error('Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            });

            grokReq.write(grokPayload);
            grokReq.end();
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`✓ Servidor proxy corriendo en http://localhost:${PORT}`);
    console.log(`✓ Abre tu app en: file:///C:/Users/lklklkm/Desktop/KCAL%20APP/index.html`);
});
