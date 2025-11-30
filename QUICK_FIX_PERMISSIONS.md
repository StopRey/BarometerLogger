# Швидке виправлення помилки permission-denied

## Проблема
Помилка: `[firestore/permission-denied] The caller does not have permission to execute the specified operation.`

## Швидке рішення (5 хвилин)

### Крок 1: Відкрийте Firebase Console
1. Перейдіть на https://console.firebase.google.com/
2. Виберіть ваш проект

### Крок 2: Налаштуйте правила Firestore
1. У меню зліва виберіть **Firestore Database**
2. Перейдіть на вкладку **Rules** (Правила)
3. Замініть весь текст на:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /readings/{readingId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

4. Натисніть кнопку **"Publish"** (Опублікувати) внизу
5. Зачекайте 10-30 секунд

### Крок 3: Перезапустіть додаток
1. Закрийте додаток повністю
2. Запустіть знову: `npm run android`

### Крок 4: Перевірка
1. Увійдіть у додаток
2. Спробуйте синхронізувати дані
3. Помилка має зникнути

---

## Якщо помилка все ще є:

### Альтернативне рішення (для тестування):

Якщо вище не допомогло, використайте тестові правила (менш безпечні, але працюють):

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

**⚠️ УВАГА:** Ці правила дозволяють будь-якому авторизованому користувачу читати/писати дані. Використовуйте тільки для тестування!

---

## Перевірка налаштувань:

1. **Перевірте авторизацію:**
   - Користувач має бути увійшов у систему
   - Email/Password авторизація має бути увімкнена в Firebase Console

2. **Перевірте google-services.json:**
   - Файл має бути в `android/app/google-services.json`
   - Package name в файлі має відповідати `applicationId` в `android/app/build.gradle`

3. **Перевірте Firestore:**
   - Firestore Database має бути створена
   - Режим: Test mode або Production mode з правилами

---

## Детальна інструкція:
Дивіться `FIREBASE_SETUP.md` для повної інструкції з налаштування.

## Діагностика проблем:
Дивіться `FIREBASE_TROUBLESHOOTING.md` для детальної діагностики.

