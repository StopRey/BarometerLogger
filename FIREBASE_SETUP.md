# Налаштування Firebase для BarometerLogger

## Крок 1: Створення проекту Firebase

1. Перейдіть на [Firebase Console](https://console.firebase.google.com/)
2. Створіть новий проект або виберіть існуючий
3. Додайте Android додаток:
   - Натисніть "Add app" → Android
   - Введіть package name (знайдіть в `android/app/build.gradle` в `applicationId`)
   - Завантажте `google-services.json` і помістіть його в `android/app/`

4. Додайте iOS додаток (якщо потрібно):
   - Натисніть "Add app" → iOS
   - Введіть bundle ID
   - Завантажте `GoogleService-Info.plist` і помістіть його в `ios/BarometerLogger/`

## Крок 2: Налаштування Authentication

1. У Firebase Console перейдіть до "Authentication"
2. Увімкніть "Email/Password" метод авторизації
3. Натисніть "Enable" і збережіть

## Крок 3: Налаштування Firestore

1. У Firebase Console перейдіть до "Firestore Database"
2. Натисніть "Create database"
3. Виберіть режим "Start in test mode" (для розробки)
4. Виберіть регіон (наприклад, `europe-west`)
5. Натисніть "Enable"

## Крок 4: Налаштування правил безпеки Firestore

У Firebase Console перейдіть до **Firestore Database → Rules** і встановіть такі правила:

### Варіант 1: Правила для розробки (менш безпечні, але простіші)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Дозволяємо авторизованим користувачам повний доступ до своїх даних
    match /users/{userId} {
      // Доступ до документа користувача
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Доступ до підколекції readings
      match /readings/{readingId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### Варіант 2: Більш детальні правила (рекомендовано)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // Дозволяємо створювати та читати документ користувача
      allow create: if request.auth != null && request.auth.uid == userId;
      allow read, update: if request.auth != null && request.auth.uid == userId;
      allow delete: if request.auth != null && request.auth.uid == userId;
      
      // Правила для підколекції readings
      match /readings/{readingId} {
        // Дозволяємо створювати, читати, оновлювати та видаляти записи
        allow create: if request.auth != null 
                      && request.auth.uid == userId
                      && request.resource.data.userId == userId;
        allow read: if request.auth != null && request.auth.uid == userId;
        allow update: if request.auth != null 
                      && request.auth.uid == userId
                      && resource.data.userId == userId;
        allow delete: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### Варіант 3: Тестові правила (ТІЛЬКИ для розробки!)

**⚠️ УВАГА: Ці правила дозволяють будь-якому авторизованому користувачу читати/писати дані. Використовуйте ТІЛЬКИ для тестування!**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Кроки:**
1. Скопіюйте один з варіантів правил вище
2. Вставте в редактор правил у Firebase Console
3. Натисніть **"Publish"** (Опублікувати) для збереження змін
4. Перевірте, що правила збережені (може знадобитися кілька секунд)

**Якщо помилка `permission-denied` все ще виникає:**
- Перевірте, що користувач увійшов у систему (перевірте `request.auth != null`)
- Перевірте, що `userId` в коді відповідає `request.auth.uid`
- Спробуйте спочатку Варіант 3 для тестування, потім перейдіть на Варіант 1 або 2

## Крок 5: Встановлення залежностей (вже виконано)

```bash
npm install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore
```

## Крок 6: Налаштування Android

1. Переконайтеся, що `google-services.json` знаходиться в `android/app/`
2. У файлі `android/build.gradle` додайте:
```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

3. У файлі `android/app/build.gradle` в кінці додайте:
```gradle
apply plugin: 'com.google.gms.google-services'
```

## Крок 7: Налаштування iOS (якщо потрібно)

1. Встановіть CocoaPods:
```bash
cd ios
pod install
cd ..
```

2. Переконайтеся, що `GoogleService-Info.plist` знаходиться в `ios/BarometerLogger/`

## Крок 8: Запуск додатку

```bash
npm start
npm run android  # або npm run ios
```

## Примітки

- Для продакшн використання налаштуйте правила безпеки Firestore відповідно до ваших потреб
- Переконайтеся, що ваш package name/bundle ID відповідає налаштуванням у Firebase Console
- Якщо виникають проблеми з автентифікацією, перевірте, чи правильно налаштований `google-services.json`

