# Trainer OS

**English:**

Trainer OS is a standalone offline application that works without internet. Install it on your phone and manage your fitness coaching business anywhere—in the gym, at client locations, or on the go.

Automate recurring lesson scheduling, track payments and distribute them across sessions, monitor client balances and debts, and analyze business performance. All data stays private on your device.

**Русский:**

Trainer OS — это отдельное офлайн-приложение, работающее без интернета. Установите его на телефон и управляйте фитнес-бизнесом где угодно—в зале, у клиентов или в дороге.

Автоматизируйте создание повторяющихся занятий, отслеживайте платежи и распределяйте их по сессиям, контролируйте балансы и долги клиентов, анализируйте показатели бизнеса. Все данные остаются приватными на вашем устройстве.

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
