# SecureNet Designer
Aplicación con backend Flask y frontend React/Vite para diseñar topologías de red, gestionar políticas y exportar diseños a GNS3.

## Estructura del proyecto
- `backend/`: API Flask + SQLite, exportación a GNS3.
- `frontend/`: UI en React/Vite con React Flow.

## Requisitos previos
- Python 3.10+ con `pip` y `venv`.
- Node.js 18+ y npm.
- (Opcional) Servidor GNS3 si vas a exportar topologías:
  - `GNS3_SERVER_URL` (por defecto `http://localhost:3080`).
  - `GNS3_COMPUTE_ID` (por defecto `vm`, normalmente `local` en GNS3).

## Instalación y ejecución rápida
1) **Backend**
```bash
cd backend
python -m venv venv
# Windows
.\venv\Scripts\activate
# Linux/macOS
source venv/bin/activate
pip install -r requirements.txt
python app.py
```
La API queda en `http://127.0.0.1:5000` y crea `sqlite:///securenet.db` automáticamente.

2) **Frontend**
```bash
cd frontend
npm install
npm run dev
```
La UI queda en `http://localhost:5173`.

3) **Flujo típico**
- Levanta backend (`python app.py` en `backend/`).
- Levanta frontend (`npm run dev` en `frontend/`).
- Usa la UI; la API persiste datos en `backend/securenet.db`.
- Para exportar a GNS3, asegúrate de tener el servidor activo y configura las variables si no usas los valores por defecto.

## Scripts útiles
- Backend: ejecución directa `python app.py` (usa SQLite y crea tablas en el arranque).
- Frontend: `npm run lint`, `npm run build`, `npm run preview`.

## Notas
- Si quieres partir de una base limpia, elimina `backend/instance/securenet.db` tras apagar el servidor.
- Ajusta host/puerto según tu entorno si tienes servicios ocupando `5000` o `5173`.
