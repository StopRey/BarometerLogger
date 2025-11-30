import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { db } from '../android/app/src/main/services/database';
import DeviceInfo from 'react-native-device-info';

export interface Reading {
  id?: number;
  value: number;
  timestamp: number;
  deviceId: string;
  deviceName: string;
  osVersion: string;
  userId: string;
  synced?: number;
  isDuplicate?: number;
}

export const syncService = {
  // Отримати інформацію про пристрій
  getDeviceInfo: async (): Promise<{ deviceId: string; deviceName: string; osVersion: string }> => {
    const deviceId = await DeviceInfo.getUniqueId();
    const deviceName = await DeviceInfo.getModel();
    const osVersion = `${await DeviceInfo.getSystemName()} ${await DeviceInfo.getSystemVersion()}`;
    
    return {
      deviceId,
      deviceName,
      osVersion,
    };
  },

  // Завантажити дані на сервер
  uploadToCloud: async (userId: string): Promise<void> => {
    try {
      // Перевіряємо авторизацію
      const currentUser = auth().currentUser;
      if (!currentUser || currentUser.uid !== userId) {
        throw new Error('Користувач не авторизований або userId не відповідає');
      }

      const unsyncedReadings = await db.getUnsyncedReadings();
      
      if (unsyncedReadings.length === 0) {
        console.log('Немає несинхронізованих даних');
        return;
      }

      // Створюємо або оновлюємо документ користувача
      const userDocRef = firestore().collection('users').doc(userId);
      await userDocRef.set({ 
        lastSync: firestore.FieldValue.serverTimestamp(),
        userId: userId,
        email: currentUser.email || '',
      }, { merge: true });

      const batch = firestore().batch();
      const readingsCollection = userDocRef.collection('readings');
      const batchSize = 500; // Firestore обмеження на batch
      let processedCount = 0;

      for (const reading of unsyncedReadings) {
        // Створюємо унікальний ID на основі timestamp та deviceId
        const docId = `${reading.timestamp}_${reading.deviceId || 'unknown'}`;
        const docRef = readingsCollection.doc(docId);

        // Новий запис (не перевіряємо існування, щоб уникнути помилок)
        // Якщо запис вже існує, він буде оновлений
        batch.set(docRef, {
          value: reading.value,
          timestamp: reading.timestamp,
          deviceId: reading.deviceId || '',
          deviceName: reading.deviceName || '',
          osVersion: reading.osVersion || '',
          userId: userId,
          isDuplicate: false,
          createdAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        processedCount++;

        // Якщо досягли обмеження batch, виконуємо commit
        if (processedCount >= batchSize) {
          await batch.commit();
          processedCount = 0;
        }
      }

      // Виконуємо останній batch, якщо є необроблені записи
      if (processedCount > 0) {
        await batch.commit();
      }
      
      // Позначаємо записи як синхронізовані
      const ids = unsyncedReadings.map(r => r.id).filter(id => id !== undefined) as number[];
      await db.markAsSynced(ids);
      
      console.log(`Синхронізовано ${unsyncedReadings.length} записів`);
    } catch (error: any) {
      console.error('Помилка завантаження на хмару:', error);
      // Не викидаємо помилку, щоб не блокувати роботу додатку
      if (error.code === 'firestore/not-found') {
        console.log('Колекція не існує, створюємо...');
        // Спробуємо створити колекцію, додавши перший запис
        return;
      }
      throw error;
    }
  },

  // Завантажити дані з сервера
  downloadFromCloud: async (userId: string): Promise<void> => {
    try {
      // Перевіряємо авторизацію
      const currentUser = auth().currentUser;
      if (!currentUser || currentUser.uid !== userId) {
        throw new Error('Користувач не авторизований або userId не відповідає');
      }

      const userDocRef = firestore().collection('users').doc(userId);
      const readingsCollection = userDocRef.collection('readings');

      // Перевіряємо чи існує документ користувача
      const userDoc = await userDocRef.get();
      if (!userDoc.exists) {
        console.log('Користувач не має даних на сервері');
        return;
      }

      // Отримуємо всі записи користувача
      const snapshot = await readingsCollection.get();
      
      if (snapshot.empty) {
        console.log('Немає даних на сервері');
        return;
      }

      const readings: Reading[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Перевіряємо наявність обов'язкових полів
        if (data.value !== undefined && data.timestamp !== undefined) {
          readings.push({
            value: data.value,
            timestamp: data.timestamp,
            deviceId: data.deviceId || '',
            deviceName: data.deviceName || '',
            osVersion: data.osVersion || '',
            userId: data.userId || userId,
            isDuplicate: data.isDuplicate ? 1 : 0,
          });
        }
      });

      if (readings.length === 0) {
        console.log('Немає валідних даних для завантаження');
        return;
      }

      // Додаємо записи до локальної БД
      await db.addReadingsFromCloud(readings);
      
      console.log(`Завантажено ${readings.length} записів з хмари`);
    } catch (error: any) {
      console.error('Помилка завантаження з хмари:', error);
      // Якщо колекція не існує, це нормально для нового користувача
      if (error.code === 'firestore/not-found' || error.code === 'permission-denied') {
        console.log('Колекція не існує або немає доступу - це нормально для нового користувача');
        return;
      }
      throw error;
    }
  },

  // Повна синхронізація (завантажити + завантажити)
  sync: async (userId: string): Promise<void> => {
    try {
      console.log('Початок синхронізації...');
      
      // Спочатку завантажуємо на сервер
      try {
        await syncService.uploadToCloud(userId);
      } catch (uploadError: any) {
        console.error('Помилка завантаження на сервер:', uploadError);
        // Продовжуємо навіть якщо завантаження не вдалося
      }
      
      // Потім завантажуємо з сервера
      try {
        await syncService.downloadFromCloud(userId);
      } catch (downloadError: any) {
        console.error('Помилка завантаження з сервера:', downloadError);
        // Продовжуємо навіть якщо завантаження не вдалося
      }
      
      console.log('Синхронізація завершена');
    } catch (error: any) {
      console.error('Помилка синхронізації:', error);
      // Не викидаємо помилку, щоб не блокувати роботу додатку
      // Користувач все одно може працювати з локальними даними
    }
  },
};

