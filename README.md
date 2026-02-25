# 🚀 FulloChat - Next Generation P2P Communication Platform

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![PRs](https://img.shields.io/badge/PRs-welcome-orange)
![Made with](https://img.shields.io/badge/made%20with-love-red)

## 🌟 О проекте

**FulloChat** - это мощная платформа для P2P коммуникаций с полным шифрованием, которая позволяет пользователям общаться в реальном времени через аудио, видео и текстовые сообщения без необходимости регистрации на центральном сервере.

> 🏆 Проект получил высокую оценку от преподавателей и был представлен на кружке информатики!

### ✨ Ключевые возможности

| Функция | Описание |
|---------|----------|
| 🔒 **Сквозное шифрование** | Все сообщения и медиа-потоки защищены E2EE |
| 🎥 **Видеозвонки** | Высококачественное видео с возможностью увеличения |
| 🖥️ **Демонстрация экрана** | Показывайте свой экран в реальном времени |
| 👑 **Система модерации** | Создатели комнат могут мутить и выгонять участников |
| 🔨 **Система банов** | Админ-панель для управления пользователями |
| 📱 **Адаптивный дизайн** | Отлично работает на всех устройствах |
| ⚡ **Мгновенные сообщения** | Чат с уведомлениями |
| 🎨 **Кастомные аватарки** | Загружайте свои изображения (Base64) |
| 🌐 **P2P архитектура** | Прямые соединения без посредников |

## 🛠️ Технологический стек

<div align="center">

| Технология | Назначение |
|------------|------------|
| ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white) | Структура приложения |
| ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white) | Стилизация и анимации |
| ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black) | Логика приложения |
| ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white) | База данных и аутентификация |
| ![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white) | P2P соединения |
| ![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?style=for-the-badge&logo=github&logoColor=white) | Хостинг |

</div>

## 📋 Структура проекта

```
fullo-chat/
├── 📁 css/
│   └── style.css          # Главный файл стилей
├── 📁 js/
│   ├── supabase-config.js  # Конфигурация Supabase
│   ├── auth.js            # Аутентификация и профили
│   ├── peer.js            # WebRTC соединения
│   └── room.js            # Логика комнат
├── 📄 index.html           # Главная страница
├── 📄 README.md            # Документация
└── 📄 .gitignore           # Игнорируемые файлы
```

## 🚀 Быстрый старт

### 1. Клонирование репозитория

```bash
git clone https://github.com/studion2025/fullo-chat.git
cd fullo-chat
```

### 2. Настройка Supabase

1. Зарегистрируйтесь на [supabase.com](https://supabase.com)
2. Создайте новый проект
3. Выполните SQL скрипт из раздела [База данных](#-база-данных)
4. Настройте аутентификацию (отключите подтверждение email)
5. Скопируйте URL проекта и anon key

### 3. Настройка конфигурации

Создайте файл `js/supabase-config.js`:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### 4. Деплой на GitHub Pages

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

В настройках репозитория включите GitHub Pages и выберите ветку `main`.

## 🗄️ База данных

Выполните этот SQL скрипт в Supabase SQL Editor:

```sql
-- Таблица пользователей
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar TEXT,
    online BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'online',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    current_room TEXT,
    banned BOOLEAN DEFAULT false,
    ban_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица комнат
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    host_name TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    encrypted BOOLEAN DEFAULT true,
    participants UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица участников комнаты
CREATE TABLE room_participants (
    room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    avatar TEXT,
    is_host BOOLEAN DEFAULT false,
    online BOOLEAN DEFAULT false,
    muted BOOLEAN DEFAULT false,
    camera BOOLEAN DEFAULT false,
    screen BOOLEAN DEFAULT false,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

-- Таблица сообщений
CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    encrypted BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица администраторов
CREATE TABLE admins (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    super_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для оптимизации
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_messages_room ON messages(room_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
```

## 🎮 Использование

### 👤 Для обычных пользователей

1. **Регистрация/Вход**
   - Создайте аккаунт с email и паролем
   - Заполните профиль (имя, аватар)

2. **Создание комнаты**
   - Нажмите "✨ Создать новую комнату"
   - Получите 12-значный код
   - Поделитесь кодом с друзьями

3. **Подключение к комнате**
   - Введите код комнаты
   - Нажмите "🔗 Подключиться"

4. **Общение**
   - 🎤 Включайте/выключайте микрофон
   - 📷 Включайте камеру
   - 🖥️ Делитесь экраном
   - 💬 Общайтесь в чате
   - 🔍 Увеличивайте видео кликом

### 👑 Для создателей комнат

- 🔇 Заглушать участников
- 👢 Выгонять нарушителей
- 🗑️ Удалять комнату

### 🔨 Для администраторов

- Отдельная админ-панель для управления пользователями
- Бан (постоянный или временный)
- Просмотр статистики
- Мониторинг активности

## ⚙️ Конфигурация

### Отключение подтверждения email

В Supabase Dashboard:
1. Authentication → Providers → Email
2. Отключите "Confirm email"
3. Сохраните изменения

### Настройка админ-панели

1. Создайте отдельный репозиторий для админ-панели
2. Добавьте первого администратора через SQL:
```sql
INSERT INTO admins (user_id, email, super_admin) 
VALUES ('user-uuid', 'admin@example.com', true);
```

## 🤝 Участие в разработке

Мы приветствуем вклад в развитие проекта!

1. Форкните репозиторий
2. Создайте ветку (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📈 Планы развития

- [ ] 📹 Запись звонков
- [ ] 📁 Отправка файлов
- [ ] 🎨 Темы оформления
- [ ] 📱 Мобильное приложение
- [ ] 🔐 Двухфакторная аутентификация
- [ ] 🌐 Локализация (i18n)
- [ ] 📊 Расширенная статистика
- [ ] 🎮 Интерактивные доски

## 📞 Контакты и поддержка

- **Автор**: [@studion2025](https://github.com/studion2025)
- **Проект**: [FulloChat on GitHub](https://github.com/studion2025/fullo-chat)
- **Демо**: [FulloChat Live](https://studion2025.github.io/fullo-chat)

## 📄 Лицензия

Распространяется под лицензией MIT. Смотрите `LICENSE` для дополнительной информации.

---

<div align="center">

### 🌟 Если вам нравится проект, поставьте звезду на GitHub! 🌟

[![GitHub stars](https://img.shields.io/github/stars/studion2025/fullo-chat?style=social)](https://github.com/studion2025/fullo-chat/stargazers)

</div>

---

## 🎉 Благодарности

Особая благодарность:
- 👨‍🏫 Классному руководителю и кружку информатики
- 👨‍👦 Папе и дяде за поддержку и тестирование
- 🌐 Всем пользователям, помогающим улучшать FulloChat

---

<p align="center">Сделано с ❤️ для кружка информатики</p>
