# Trainer OS

**English:**

Trainer OS streamlines your fitness coaching business by automating the most time-consuming administrative tasks. Stop juggling spreadsheets, notebooks, and payment tracking—everything you need is in one place, accessible right from your phone, even when you're offline in the gym or at a client's location.

The app simplifies your daily workflow: automatically generate recurring lessons from your schedule templates, track payments and distribute them across sessions, monitor client balances and outstanding debts, and get instant insights into your business performance. Your client data stays private and secure on your device, while you focus on what matters most—coaching.

**Русский:**

Trainer OS упрощает управление фитнес-бизнесом, автоматизируя самые трудоёмкие административные задачи. Забудьте о таблицах, блокнотах и ручном учёте платежей—всё необходимое в одном месте, доступно прямо с телефона, даже без интернета в зале или у клиента.

Приложение упрощает ежедневную работу: автоматически создаёт повторяющиеся занятия из шаблонов расписания, отслеживает платежи и распределяет их по сессиям, контролирует балансы клиентов и задолженности, предоставляет моментальную аналитику бизнеса. Данные клиентов остаются приватными и безопасными на вашем устройстве, пока вы сосредоточены на главном—тренировках.

## Features

- 📱 **Mobile-first design** - optimized for smartphones, adaptive for tablets and desktops
- 🔌 **Offline operation** - fully functional without internet connection
- 💾 **Local storage** - all data stored in IndexedDB on device
- 📅 **Schedule management** - automatic lesson generation from templates
- 💰 **Payment tracking** - automatic and manual payment distribution
- 📊 **Analytics** - debt calculations, balances, and statistics

## Technologies

- React 18 + TypeScript
- Vite
- Dexie.js (IndexedDB)
- Tailwind CSS
- PWA (Progressive Web App)
- date-fns

## Installation and Running

```bash
# Install dependencies
npm install

# Generate PWA icons (from SVG to PNG of various sizes)
npm run generate-icons

# Run in development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
trainer-os/
├── src/
│   ├── db/              # Database (IndexedDB schema and types)
│   ├── services/        # Domain services
│   ├── components/      # React components
│   ├── screens/         # Application screens
│   ├── utils/           # Utilities (calculations, dates, validation)
│   ├── App.tsx          # Main component
│   └── main.tsx         # Entry point
├── public/              # Static files (manifest, icons)
└── package.json
```

## Core Features

### Client Management
- Create and edit clients
- Statuses: active, on pause, archived
- Contacts and notes

### Schedule
- Create schedule templates (weekdays + time)
- Automatic lesson generation for N days ahead
- Manual creation and editing of lessons
- Rescheduling and cancellation of lessons

### Payments
- Create payments with payment method specification
- Automatic distribution to unpaid lessons
- Manual payment distribution
- Partial lesson payment

### Lesson Packages
- Create packages (e.g., "8 lessons = 2000 BYN")
- Automatic lesson price calculation from package
- Override price for individual lessons

### Calculations and Analytics
- Lesson payment statuses (paid, partially paid, unpaid)
- Client debt and balance calculations
- Monthly statistics overview
- List of clients with debts

## PWA

The application supports installation as a PWA:
- Add to home screen
- Offline operation
- Resource caching via Service Worker

## License

MIT
