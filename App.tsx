import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import RNFS from 'react-native-fs';
import { db } from './android/app/src/main/services/database';
import { authService, User } from './services/authService';
import { syncService } from './services/syncService';
import AuthScreen from './screens/AuthScreen';

// Кольори для різних пристроїв
const DEVICE_COLORS = [
  '#007AFF', // Синій
  '#FF3B30', // Червоний
  '#34C759', // Зелений
  '#FF9500', // Помаранчевий
  '#AF52DE', // Фіолетовий
  '#FF2D55', // Рожевий
  '#5AC8FA', // Світло-синій
  '#FFCC00', // Жовтий
];

interface Device {
  deviceId: string;
  deviceName: string;
  osVersion: string;
}

const App = () => {
  // --- СТАНИ (State) ---
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPressure, setCurrentPressure] = useState(1013);
  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState({ minVal: 0, maxVal: 0, avgVal: 0, count: 0 });
  const [timeRange, setTimeRange] = useState(1);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId: string; deviceName: string; osVersion: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  // 2. Завантаження списку пристроїв
  const loadDevices = useCallback(async () => {
    const deviceList = await db.getDevices();
    setDevices(deviceList);
    
    // Вибір всіх пристроїв за замовчуванням
    setSelectedDevices(prev => {
      if (deviceList.length > 0 && prev.size === 0) {
        return new Set(deviceList.map(d => d.deviceId));
      }
      return prev;
    });
  }, []);

  // 4. Оновлення даних з БД
  const refreshData = useCallback(async () => {
    const deviceIds = selectedDevices.size > 0 
      ? Array.from(selectedDevices) 
      : undefined;
    
    const data = await db.getHistory(timeRange, deviceIds as any);
    const statistics = await db.getStats(timeRange);
    
    setHistory(data);
    setStats(statistics);
  }, [timeRange, selectedDevices]);

  // 5. Синхронізація з хмарою
  const syncData = useCallback(async () => {
    if (!user || syncing) return;
    
    setSyncing(true);
    try {
      await syncService.sync(user.uid);
      await loadDevices();
      await refreshData();
      // Не показуємо Alert для успіху, щоб не заважати
      // Alert.alert('Успіх', 'Дані синхронізовано');
    } catch (error: any) {
      // Помилки тепер обробляються всередині syncService
      // Показуємо Alert тільки для критичних помилок
      if (error.code !== 'firestore/not-found' && error.code !== 'permission-denied') {
        Alert.alert('Помилка', error.message || 'Не вдалося синхронізувати дані');
      }
    } finally {
      setSyncing(false);
    }
  }, [user, syncing, loadDevices, refreshData]);

  // 1. Ініціалізація при запуску
  useEffect(() => {
    const init = async () => {
      await db.initDB();
      
      // Отримуємо інформацію про пристрій
      const info = await syncService.getDeviceInfo();
      setDeviceInfo(info);
      
      // Перевіряємо авторизацію
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        await loadDevices();
        await refreshData();
      }
      
      setLoading(false);
    };
    init();

    // Слухач змін авторизації
    const unsubscribe = authService.onAuthStateChanged((authUser) => {
      setUser(authUser);
      if (authUser) {
        loadDevices();
        refreshData();
      }
    });

    return () => unsubscribe();
  }, [loadDevices, refreshData]);

  // 3. Логіка "Сенсора" і Запису
  useEffect(() => {
    let interval: any = null;

    if (isRecording && deviceInfo && user) {
      interval = setInterval(async () => {
        const simulatedValue = +(1013 + (Math.random() * 10 - 5)).toFixed(1);
        setCurrentPressure(simulatedValue);
        
        // Запис у БД з метаданими пристрою
        await db.addReading(simulatedValue, deviceInfo as any, user.uid as any);
        
        // Автоматична синхронізація кожні 10 записів
        const allData = await db.getHistory(0);
        if (allData.length % 10 === 0 && user) {
          syncData();
        }
        
        refreshData();
      }, 2000);
    } else {
      if (interval) clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, deviceInfo, user, refreshData, syncData]);

  // Оновлення даних при зміні фільтрів
  useEffect(() => {
    refreshData();
  }, [selectedDevices, refreshData]);


  // 6. Обробка успішної авторизації
  const handleAuthSuccess = useCallback(async (authUser: User) => {
    setUser(authUser);
    await loadDevices();
    await refreshData();
    
    // Перша синхронізація після входу (тихо, без помилок для нового користувача)
    try {
      await syncService.sync(authUser.uid);
      await loadDevices();
      await refreshData();
    } catch (error: any) {
      // Ігноруємо помилки для нового користувача
      if (error.code !== 'firestore/not-found' && error.code !== 'permission-denied') {
        console.error('Помилка першої синхронізації:', error);
      }
    }
  }, [loadDevices, refreshData]);

  // 7. Вихід
  const handleLogout = async () => {
    try {
      await authService.logout();
      setUser(null);
      setHistory([]);
      setDevices([]);
      setSelectedDevices(new Set());
    } catch (error: any) {
      Alert.alert('Помилка', error.message);
    }
  };

  // 8. Функції керування
  const handleClear = async () => {
    Alert.alert(
      'Підтвердження',
      'Ви впевнені, що хочете видалити всі дані?',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: async () => {
            await db.clearAll();
            await refreshData();
            await loadDevices();
            Alert.alert('Очищено', 'Історію видалено з бази даних.');
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    try {
      const allData = await db.getHistory(0);
      if (allData.length === 0) {
        Alert.alert('Помилка', 'Немає даних для експорту');
        return;
      }

      const header = 'ID,Timestamp,Date,Pressure_hPa,DeviceId,DeviceName,OSVersion\n';
      const rows = allData
        .map(
          (item) =>
            `${item.id},${item.timestamp},"${new Date(item.timestamp).toLocaleString()}",${item.value},${item.deviceId || ''},${item.deviceName || ''},${item.osVersion || ''}`
        )
        .join('\n');

      const path = `${RNFS.ExternalDirectoryPath}/barometer_data.csv`;
      await RNFS.writeFile(path, header + rows, 'utf8');

      Alert.alert('Успіх', `Файл збережено:\n${path}`);
    } catch (e) {
      console.error(e);
      Alert.alert('Помилка', 'Не вдалося записати файл');
    }
  };

  // 9. Перемикання вибору пристрою
  const toggleDevice = useCallback((deviceId: string) => {
    setSelectedDevices(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(deviceId)) {
        newSelected.delete(deviceId);
      } else {
        newSelected.add(deviceId);
      }
      return newSelected;
    });
  }, []);

  // 10. Інтерпретація погоди
  const getWeatherStatus = (val: number) => {
    if (val > 1020) return { text: '☀️ Ясно (Високий тиск)', color: '#FF9500' };
    if (val < 1000) return { text: '🌧️ Дощ/Шторм (Низький)', color: '#666' };
    return { text: '☁️ Хмарно/Стабільно', color: '#007AFF' };
  };

  // 11. Підготовка даних для графіка з різними кольорами для пристроїв
  const prepareChartData = () => {
    if (history.length === 0) {
      return {
        labels: ['00:00'],
        datasets: [{ data: [1013], color: () => '#007AFF' }],
      };
    }

    // Групуємо дані по пристроях
    const deviceDataMap = new Map<string, any[]>();
    history.forEach((item: any) => {
      const deviceId = item.deviceId || 'unknown';
      if (!deviceDataMap.has(deviceId)) {
        deviceDataMap.set(deviceId, []);
      }
      deviceDataMap.get(deviceId)!.push(item);
    });

    // Створюємо datasets для кожного пристрою
    const datasets: any[] = [];
    let colorIndex = 0;
    
    deviceDataMap.forEach((items, deviceId) => {
      if (selectedDevices.size === 0 || selectedDevices.has(deviceId)) {
        const deviceIndex = devices.findIndex(d => d.deviceId === deviceId);
        const color = DEVICE_COLORS[deviceIndex % DEVICE_COLORS.length];
        
        datasets.push({
          data: items.map((i: any) => i.value),
          color: (opacity = 1) => color,
          strokeWidth: 2,
        });
      }
    });

    // Підготовка labels
    const labels = history
      .filter((_, i) => i % Math.max(1, Math.floor(history.length / 6)) === 0)
      .slice(-6)
      .map((i: any) =>
        new Date(i.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      );

    return { labels, datasets };
  };

  const chartData = prepareChartData();
  const weather = getWeatherStatus(currentPressure);

  // Екран авторизації
  if (!user) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.headerRow}>
          <Text style={styles.header}>Barometer Logger (Lab 6)</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Вийти</Text>
          </TouchableOpacity>
        </View>

        {/* Інформація про користувача */}
        <View style={styles.card}>
          <Text style={styles.userInfo}>Користувач: {user.email}</Text>
          {deviceInfo && (
            <Text style={styles.deviceInfo}>
              Пристрій: {deviceInfo.deviceName} ({deviceInfo.osVersion})
            </Text>
          )}
        </View>

        {/* Блок поточного значення */}
        <View style={styles.card}>
          <Text style={styles.label}>Поточний атмосферний тиск</Text>
          <Text style={styles.value}>
            {currentPressure} <Text style={{ fontSize: 20 }}>hPa</Text>
          </Text>
          <Text style={{ textAlign: 'center', color: '#555', marginBottom: 10 }}>
            {weather.text}
          </Text>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: isRecording ? '#ff4444' : '#00C851' }]}
            onPress={() => setIsRecording(!isRecording)}
          >
            <Text style={styles.btnText}>
              {isRecording ? '⏹ ЗУПИНИТИ ЗАПИС' : '▶️ СТАРТ ЗАПИСУ'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Блок Графіка */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={styles.label}>Графік змін</Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={() => setTimeRange(1)}
                style={[styles.smBtn, timeRange === 1 && styles.activeBtn]}
              >
                <Text style={timeRange === 1 ? styles.activeText : styles.smText}>1 Год</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTimeRange(24)}
                style={[styles.smBtn, timeRange === 24 && styles.activeBtn]}
              >
                <Text style={timeRange === 24 ? styles.activeText : styles.smText}>24 Год</Text>
              </TouchableOpacity>
            </View>
          </View>

          <LineChart
            data={chartData}
            width={Dimensions.get('window').width - 40}
            height={220}
            yAxisSuffix=" hPa"
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              propsForDots: { r: '3' },
            }}
            bezier
            style={{ borderRadius: 16 }}
          />
        </View>

        {/* Фільтр пристроїв */}
        {devices.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.label}>Фільтр пристроїв</Text>
            {devices.map((device, index) => {
              const isSelected = selectedDevices.has(device.deviceId);
              const color = DEVICE_COLORS[index % DEVICE_COLORS.length];
              return (
                <View key={device.deviceId} style={styles.deviceRow}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <Text style={styles.deviceName} numberOfLines={1}>
                    {device.deviceName || device.deviceId}
                  </Text>
                  <Text style={styles.deviceOS} numberOfLines={1}>
                    {device.osVersion}
                  </Text>
                  <Switch
                    value={isSelected}
                    onValueChange={() => toggleDevice(device.deviceId)}
                  />
                </View>
              );
            })}
          </View>
        )}

        {/* Статистика */}
        <View style={styles.card}>
          <Text style={styles.label}>Статистика (SQL Query)</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Мін.</Text>
              <Text style={styles.statVal}>{stats.minVal ? stats.minVal.toFixed(1) : '-'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Макс.</Text>
              <Text style={styles.statVal}>{stats.maxVal ? stats.maxVal.toFixed(1) : '-'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Середнє</Text>
              <Text style={styles.statVal}>{stats.avgVal ? stats.avgVal.toFixed(1) : '-'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Записів</Text>
              <Text style={styles.statVal}>{stats.count}</Text>
            </View>
          </View>
        </View>

        {/* Кнопки керування */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#33b5e5', flex: 1, marginRight: 5 }]}
            onPress={handleExport}
          >
            <Text style={styles.btnText}>💾 Експорт CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#ffbb33', flex: 1, marginLeft: 5 }]}
            onPress={handleClear}
          >
            <Text style={styles.btnText}>🧹 Очистити</Text>
          </TouchableOpacity>
        </View>

        {/* Кнопка синхронізації */}
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#9C27B0' }]}
            onPress={syncData}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>☁️ Синхронізувати з хмарою</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 10,
  },
  header: { fontSize: 22, fontWeight: 'bold', color: '#333', flex: 1 },
  logoutBtn: { padding: 8, paddingHorizontal: 12 },
  logoutText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: 'white',
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 15,
    borderRadius: 12,
    elevation: 3,
  },
  label: { fontSize: 16, fontWeight: '600', color: '#444', marginBottom: 5 },
  value: { fontSize: 42, fontWeight: 'bold', textAlign: 'center', color: '#000' },
  btn: { padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  btnText: { color: 'white', fontWeight: 'bold' },
  row: { flexDirection: 'row', marginHorizontal: 15 },
  smBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 5,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  activeBtn: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  smText: { color: '#666', fontSize: 12 },
  activeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  statItem: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  statLabel: { fontSize: 12, color: '#888' },
  statVal: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  userInfo: { fontSize: 14, color: '#666', marginBottom: 5 },
  deviceInfo: { fontSize: 12, color: '#999' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  deviceName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginRight: 10,
  },
  deviceOS: {
    fontSize: 12,
    color: '#999',
    marginRight: 10,
    flex: 1,
  },
});

export default App;

