// src/services/database.js
import SQLite from 'react-native-sqlite-storage';

// Вмикаємо Promise, щоб використовувати async/await (зручніше ніж callback)
SQLite.enablePromise(true);

const DB_NAME = 'barometer.db';

export const db = {
  // 1. Ініціалізація БД (Створення таблиці)
  initDB: async () => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      
      // Створюємо таблицю, якщо її немає
      // id - унікальний номер
      // value - значення тиску (hPa)
      // timestamp - час запису (в мілісекундах)
      // deviceId - унікальний ідентифікатор пристрою
      // deviceName - назва/модель пристрою
      // osVersion - версія ОС
      // userId - ідентифікатор користувача (для синхронізації)
      // synced - чи синхронізовано з хмарою
      // isDuplicate - чи це дублікат
      await dbInstance.executeSql(`
        CREATE TABLE IF NOT EXISTS pressures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value REAL NOT NULL,
          timestamp INTEGER NOT NULL,
          deviceId TEXT,
          deviceName TEXT,
          osVersion TEXT,
          userId TEXT,
          synced INTEGER DEFAULT 0,
          isDuplicate INTEGER DEFAULT 0
        );
      `);
      
      // Додаємо нові колонки до існуючої таблиці (якщо вони не існують)
      try {
        await dbInstance.executeSql(`ALTER TABLE pressures ADD COLUMN deviceId TEXT`);
      } catch (e) {
        // Колонка вже існує
      }
      try {
        await dbInstance.executeSql(`ALTER TABLE pressures ADD COLUMN deviceName TEXT`);
      } catch (e) {}
      try {
        await dbInstance.executeSql(`ALTER TABLE pressures ADD COLUMN osVersion TEXT`);
      } catch (e) {}
      try {
        await dbInstance.executeSql(`ALTER TABLE pressures ADD COLUMN userId TEXT`);
      } catch (e) {}
      try {
        await dbInstance.executeSql(`ALTER TABLE pressures ADD COLUMN synced INTEGER DEFAULT 0`);
      } catch (e) {}
      try {
        await dbInstance.executeSql(`ALTER TABLE pressures ADD COLUMN isDuplicate INTEGER DEFAULT 0`);
      } catch (e) {}
      console.log('SQLite: База даних готова');
    } catch (error) {
      console.error('SQLite Error (Init):', error);
    }
  },

  // 2. Додавання запису (INSERT)
  addReading: async (value, deviceInfo = null, userId = null) => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      const timestamp = Date.now();
      await dbInstance.executeSql(
        'INSERT INTO pressures (value, timestamp, deviceId, deviceName, osVersion, userId, synced) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          value, 
          timestamp,
          deviceInfo?.deviceId || null,
          deviceInfo?.deviceName || null,
          deviceInfo?.osVersion || null,
          userId || null,
          0 // не синхронізовано
        ]
      );
      // console.log(`SQLite: Записано ${value} hPa`);
    } catch (error) {
      console.error('SQLite Error (Insert):', error);
    }
  },

  // 3. Отримання історії (SELECT)
  // durationHours - за скільки останніх годин брати дані (1, 24 або 0 для всіх)
  // deviceIds - масив ID пристроїв для фільтрації (опціонально)
  getHistory: async (durationHours = 1, deviceIds = undefined) => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      let query = 'SELECT * FROM pressures';
      let params = [];
      let conditions = [];

      // Фільтр по часу
      if (durationHours > 0) {
        const cutoff = Date.now() - (durationHours * 60 * 60 * 1000);
        conditions.push('timestamp > ?');
        params.push(cutoff);
      }

      // Фільтр по пристроям
      if (deviceIds && deviceIds.length > 0) {
        const placeholders = deviceIds.map(() => '?').join(',');
        conditions.push(`deviceId IN (${placeholders})`);
        params.push(...deviceIds);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY timestamp ASC'; // Сортуємо від старих до нових для графіка

      const [results] = await dbInstance.executeSql(query, params);
      
      // Конвертуємо результат SQL у звичайний масив JS
      let items = [];
      for (let i = 0; i < results.rows.length; i++) {
        items.push(results.rows.item(i));
      }
      return items;
    } catch (error) {
      console.error('SQLite Error (Get):', error);
      return [];
    }
  },
  
  // Отримати унікальні пристрої
  getDevices: async () => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      const [results] = await dbInstance.executeSql(`
        SELECT DISTINCT deviceId, deviceName, osVersion 
        FROM pressures 
        WHERE deviceId IS NOT NULL
        ORDER BY deviceName
      `);
      
      let devices = [];
      for (let i = 0; i < results.rows.length; i++) {
        devices.push(results.rows.item(i));
      }
      return devices;
    } catch (error) {
      console.error('SQLite Error (GetDevices):', error);
      return [];
    }
  },
  
  // Отримати несинхронізовані записи
  getUnsyncedReadings: async () => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      const [results] = await dbInstance.executeSql(`
        SELECT * FROM pressures WHERE synced = 0 ORDER BY timestamp ASC
      `);
      
      let items = [];
      for (let i = 0; i < results.rows.length; i++) {
        items.push(results.rows.item(i));
      }
      return items;
    } catch (error) {
      console.error('SQLite Error (GetUnsynced):', error);
      return [];
    }
  },
  
  // Позначити записи як синхронізовані
  markAsSynced: async (ids) => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      if (ids.length === 0) return;
      
      const placeholders = ids.map(() => '?').join(',');
      await dbInstance.executeSql(
        `UPDATE pressures SET synced = 1 WHERE id IN (${placeholders})`,
        ids
      );
    } catch (error) {
      console.error('SQLite Error (MarkSynced):', error);
    }
  },
  
  // Додати записи з хмари (при завантаженні)
  addReadingsFromCloud: async (readings) => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      
      for (const reading of readings) {
        // Перевіряємо чи вже існує такий запис
        const [existing] = await dbInstance.executeSql(
          'SELECT id FROM pressures WHERE timestamp = ? AND deviceId = ?',
          [reading.timestamp, reading.deviceId]
        );
        
        if (existing.rows.length > 0) {
          // Оновлюємо існуючий запис, позначаємо як дублікат
          await dbInstance.executeSql(
            `UPDATE pressures SET 
              value = ?, deviceName = ?, osVersion = ?, synced = 1, isDuplicate = 1
              WHERE id = ?`,
            [reading.value, reading.deviceName, reading.osVersion, existing.rows.item(0).id]
          );
        } else {
          // Додаємо новий запис
          await dbInstance.executeSql(
            'INSERT INTO pressures (value, timestamp, deviceId, deviceName, osVersion, userId, synced) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              reading.value,
              reading.timestamp,
              reading.deviceId,
              reading.deviceName,
              reading.osVersion,
              reading.userId,
              1 // синхронізовано
            ]
          );
        }
      }
    } catch (error) {
      console.error('SQLite Error (AddFromCloud):', error);
    }
  },

  // 4. Статистика (MIN, MAX, AVG) - Вимога лаби
  getStats: async (durationHours = 24) => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      const cutoff = Date.now() - (durationHours * 60 * 60 * 1000);
      
      const [results] = await dbInstance.executeSql(`
        SELECT 
          MIN(value) as minVal, 
          MAX(value) as maxVal, 
          AVG(value) as avgVal,
          COUNT(id) as count
        FROM pressures 
        WHERE timestamp > ?
      `, [cutoff]);

      return results.rows.item(0); // Повертає об'єкт { minVal, maxVal, avgVal, count }
    } catch (error) {
      console.error('SQLite Error (Stats):', error);
      return { minVal: 0, maxVal: 0, avgVal: 0, count: 0 };
    }
  },

  // 5. Очищення старих даних (DELETE)
  clearOldData: async () => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      // Видаляємо все, що старіше 24 годин (вимога завдання)
      const cutoff = Date.now() - (24 * 60 * 60 * 1000);
      await dbInstance.executeSql('DELETE FROM pressures WHERE timestamp < ?', [cutoff]);
      console.log('SQLite: Старі дані очищено');
    } catch (error) {
      console.error('SQLite Error (Clear):', error);
    }
  },
  
  // Повне очищення (для кнопки "Очистити")
  clearAll: async () => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      await dbInstance.executeSql('DELETE FROM pressures'); 
      console.log('SQLite: Всі дані видалено');
    } catch (e) {
      console.error(e);
    }
  }
};