# Вирішення проблем з Firebase

## Помилка: `firestore/permission-denied`

### Причини:
1. Правила безпеки Firestore не налаштовані або не опубліковані
2. Користувач не авторизований (`request.auth == null`)
3. `userId` не відповідає `request.auth.uid`

### Рішення:

#### Крок 1: Перевірте авторизацію
Переконайтеся, що користувач увійшов у систему:
- Перевірте, що екран авторизації пройдено
- Перевірте в консолі, що `auth().currentUser` не `null`

#### Крок 2: Перевірте правила Firestore

1. Відкрийте [Firebase Console](https://console.firebase.google.com/)
2. Виберіть ваш проект
3. Перейдіть до **Firestore Database → Rules**
4. Переконайтеся, що правила встановлені та опубліковані

**Швидке рішення для тестування:**
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

**Після зміни правил:**
- Натисніть **"Publish"**
- Зачекайте 10-30 секунд для застосування змін
- Перезапустіть додаток

#### Крок 3: Перевірте структуру даних

Переконайтеся, що структура даних відповідає правилам:
- Колекція: `users/{userId}/readings/{readingId}`
- `userId` в даних має відповідати `request.auth.uid`

#### Крок 4: Перевірте логи

У консолі додатку перевірте:
- Чи є помилки авторизації
- Чи правильно передається `userId`
- Чи правильно налаштований Firebase проект

### Діагностика

Додайте в код для діагностики:

```typescript
// У syncService.ts перед операціями Firestore
const currentUser = auth().currentUser;
console.log('Current user:', currentUser?.uid);
console.log('User ID for sync:', userId);
console.log('Are they equal?', currentUser?.uid === userId);
```

### Часті помилки:

1. **Правила не опубліковані** - завжди натискайте "Publish" після зміни правил
2. **Неправильний package name** - перевірте, що `google-services.json` відповідає `applicationId` в `build.gradle`
3. **Користувач не авторизований** - перевірте, що `auth().currentUser` не `null`
4. **Неправильна структура колекції** - має бути `users/{userId}/readings/{readingId}`

### Тестування правил

Використовуйте Firebase Console → Firestore → Rules → Rules Playground для тестування правил перед публікацією.

