export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const GROK_API_KEY = process.env.GROK_API_KEY || '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';

    try {
        const { text } = req.body;

        const grokResponse = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'grok-3-latest',
                search_parameters: {
                    mode: 'auto',
                    max_search_results: 10
                },
                messages: [{
                    role: 'user',
                    content: `Analiza esta comida y busca en internet los valores nutricionales exactos:

"${text}"

INSTRUCCIONES:
1. Identifica cada alimento mencionado
2. Estima la cantidad en gramos si no se especifica (usa porciones típicas españolas)
3. Busca en internet las calorías y macros reales de cada alimento
4. Calcula el total según los gramos

Responde SOLO con este JSON exacto:
{"foods": [{"name": "nombre del alimento", "grams": número, "kcal": número, "carbs": número, "protein": número, "fat": número}], "total": {"kcal": número, "carbs": número, "protein": número, "fat": número}}

Porciones típicas si no se especifica:
- Tostada/rebanada pan: 30g
- Aceite (chorrito): 10g
- Huevo: 60g
- Manzana/Naranja/Pera: 150g
- Plátano: 120g
- Yogur: 125g
- Vaso de leche: 200ml
- Café solo: 50ml
- Filete de carne: 150g
- Ración de arroz/pasta: 80g en crudo

Solo JSON, sin explicaciones ni texto adicional.`
                }],
                temperature: 0.2,
                stream: false
            })
        });

        const data = await grokResponse.json();
        return res.status(grokResponse.status).json(data);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
