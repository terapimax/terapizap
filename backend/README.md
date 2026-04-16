ZapFlow minimal backend

Requirements:
- Node.js (16+)

Setup:

1. cd backend
2. npm install
3. npm start

Endpoints:
- GET /api/messages
- POST /api/messages { title, content }
- DELETE /api/messages/:id
- GET /api/kanban
- POST /api/kanban/column { title }
- POST /api/leads { name, phone, email, product, value }
- GET /api/midias
- POST /api/midias (multipart form file field 'file', fields: title, caption)
