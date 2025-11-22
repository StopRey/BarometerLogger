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
      await dbInstance.executeSql(`
        CREATE TABLE IF NOT EXISTS pressures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value REAL NOT NULL,
          timestamp INTEGER NOT NULL
        );
      `);
      console.log('SQLite: База даних готова');
    } catch (error) {
      console.error('SQLite Error (Init):', error);
    }
  },

  // 2. Додавання запису (INSERT)
  addReading: async (value) => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      const timestamp = Date.now();
      await dbInstance.executeSql(
        'INSERT INTO pressures (value, timestamp) VALUES (?, ?)',
        [value, timestamp]
      );
      // console.log(`SQLite: Записано ${value} hPa`);
    } catch (error) {
      console.error('SQLite Error (Insert):', error);
    }
  },

  // 3. Отримання історії (SELECT)
  // durationHours - за скільки останніх годин брати дані (1, 24 або 0 для всіх)
  getHistory: async (durationHours = 1) => {
    try {
      const dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      let query = 'SELECT * FROM pressures';
      let params = [];

      // Фільтр по часу
      if (durationHours > 0) {
        const cutoff = Date.now() - (durationHours * 60 * 60 * 1000);
        query += ' WHERE timestamp > ?';
        params.push(cutoff);
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