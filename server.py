#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.request
import urllib.error

GROK_API_KEY = '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'
GROK_API_URL = 'https://api.x.ai/v1/chat/completions'
PORT = 3000

class ProxyHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/analyze':
            try:
                # Leer el cuerpo de la petición
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                request_data = json.loads(post_data.decode('utf-8'))

                text = request_data.get('text', '')

                # Preparar la petición a Grok
                grok_payload = {
                    "model": "grok-3-latest",
                    "search_parameters": {
                        "mode": "auto",
                        "max_search_results": 10
                    },
                    "messages": [{
                        "role": "user",
                        "content": f'''Analiza esta comida y busca en internet los valores nutricionales exactos:

"{text}"

INSTRUCCIONES:
1. Identifica cada alimento mencionado
2. Estima la cantidad en gramos si no se especifica (usa porciones típicas españolas)
3. Busca en internet las calorías y macros reales de cada alimento
4. Calcula el total según los gramos

Responde SOLO con este JSON exacto:
{{"foods": [{{"name": "nombre del alimento", "grams": número, "kcal": número, "carbs": número, "protein": número, "fat": número}}], "total": {{"kcal": número, "carbs": número, "protein": número, "fat": número}}}}

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

Solo JSON, sin explicaciones ni texto adicional.'''
                    }],
                    "temperature": 0.2,
                    "stream": False
                }

                # Hacer la petición a Grok
                req = urllib.request.Request(
                    GROK_API_URL,
                    data=json.dumps(grok_payload).encode('utf-8'),
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {GROK_API_KEY}'
                    }
                )

                with urllib.request.urlopen(req) as response:
                    grok_response = json.loads(response.read().decode('utf-8'))

                # Enviar respuesta
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(grok_response).encode('utf-8'))

            except urllib.error.HTTPError as e:
                error_body = e.read().decode('utf-8')
                print(f'Error de Grok API: {e.code} - {error_body}')

                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_body.encode('utf-8'))

            except Exception as e:
                print(f'Error: {str(e)}')

                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Mostrar logs en español
        print(f"[{self.log_date_time_string()}] {format % args}")

if __name__ == '__main__':
    server = HTTPServer(('localhost', PORT), ProxyHandler)
    print(f'✓ Servidor proxy corriendo en http://localhost:{PORT}')
    print(f'✓ Abre tu app: file:///C:/Users/lklklkm/Desktop/KCAL%20APP/index.html')
    print('✓ Presiona Ctrl+C para detener el servidor')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n✓ Servidor detenido')
        server.shutdown()
