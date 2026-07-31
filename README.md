# VØIDEN Messenger

Private encrypted messenger MVP.

Стек:

Backend:
- Python
- FastAPI
- PostgreSQL
- Redis
- WebSocket
- Alembic

Frontend:
- React
- Vite
- JavaScript

Infrastructure:
- Docker Compose
- Nginx


## Запуск проекта


### 1. Клонирование

git clone git@github.com:tatr12/secure-messenger.git

cd secure-messenger


### 2. Создать env

cp .env.example .env


Заполнить необходимые параметры.


### 3. Запуск backend

docker compose up -d


### 4. Frontend

cd e2ee-frontend

npm install

npm run dev


Frontend:
http://127.0.0.1:5173


Backend:
http://127.0.0.1:8000


## Важно

Не работать напрямую в main.

Создать свою ветку:

git checkout -b feature/my-feature


После изменений:

git add .

git commit -m "description"

git push origin feature/my-feature


Далее создать Pull Request в GitHub.
