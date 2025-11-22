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
  ActivityIndicator
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import RNFS from 'react-native-fs'; // Для експорту файлу
import { db } from './android/app/src/main/services/database'; // Наша БД

const App = () => {
  // --- СТАНИ (State) ---
  const [currentPressure, setCurrentPressure] = useState(1013); // Початковий тиск
  const [isRecording, setIsRecording] = useState(false); // Чи йде запис?
  const [history, setHistory] = useState([]); // Дані для графіка
  const [stats, setStats] = useState({ minVal: 0, maxVal: 0, avgVal: 0, count: 0 });
  const [timeRange, setTimeRange] = useState(1); // 1 година або 24 години
  const [loading, setLoading] = useState(true);

  // 1. Ініціалізація при запуску
  useEffect(() => {
    const init = async () => {
      await db.initDB();
      await refreshData();
      setLoading(false);
    };
    init();
  }, []);

  // 2. Логіка "Сенсора" і Запису
  useEffect(() => {
    let interval = null;

    if (isRecording) {
      // Завдання: "Періодичний запис даних"
      interval = setInterval(async () => {
        // СИМУЛЯЦІЯ БАРОМЕТРА
        // Генеруємо значення 1013 +/- 5 hPa
        const simulatedValue = +(1013 + (Math.random() * 10 - 5)).toFixed(1);
        
        setCurrentPressure(simulatedValue);
        
        // Запис у БД
        await db.addReading(simulatedValue);
        
        // Оновлюємо графік "на льоту"
        refreshData(); 

      }, 2000); // Пишемо кожні 2 секунди (щоб швидше побачити графік)
    } else {
      clearInterval(interval as unknown as number);
    }

    return () => { if (interval) clearInterval(interval); };
  }, [isRecording, timeRange]);

  // 3. Оновлення даних з БД
  const refreshData = async () => {
    const data = await db.getHistory(timeRange); // Отримати список
    const statistics = await db.getStats(timeRange); // Отримати мін/макс
    
    setHistory(data as any);
    setStats(statistics);
  };

  // 4. Функції керування
  const handleClear = async () => {
    await db.clearAll();
    await refreshData();
    Alert.alert("Очищено", "Історію видалено з бази даних.");
  };

  const handleExport = async () => {
    try {
      // Завдання: Експорт у CSV
      const allData = await db.getHistory(0); // 0 = вся історія
      if (allData.length === 0) {
        Alert.alert("Помилка", "Немає даних для експорту");
        return;
      }

      const header = "ID,Timestamp,Date,Pressure_hPa\n";
      const rows = allData.map(item => 
        `${item.id},${item.timestamp},"${new Date(item.timestamp).toLocaleString()}",${item.value}`
      ).join('\n');

      const path = `${RNFS.ExternalDirectoryPath}/barometer_data.csv`;
      await RNFS.writeFile(path, header + rows, 'utf8');
      
      Alert.alert("Успіх", `Файл збережено:\n${path}`);
    } catch (e) {
      console.error(e);
      Alert.alert("Помилка", "Не вдалося записати файл");
    }
  };

  // Інтерпретація погоди (Варіант 6)
  const getWeatherStatus = (val: number) => {
    if (val > 1020) return { text: "☀️ Ясно (Високий тиск)", color: "#orange" };
    if (val < 1000) return { text: "🌧️ Дощ/Шторм (Низький)", color: "#666" };
    return { text: "☁️ Хмарно/Стабільно", color: "#007AFF" };
  };

  // Підготовка даних для графіка
  const chartData = {
    labels: history.length > 0 
      ? history.filter((_, i) => i % 5 === 0).slice(-6).map((i: any) => new Date(i.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})) 
      : ["00:00"], // Щоб не падав, якщо порожньо
    datasets: [{ data: history.length > 0 ? history.map((i: any) => i.value) : [1013] }]
  };

  const weather = getWeatherStatus(currentPressure);

  if (loading) return <ActivityIndicator size="large" style={{flex:1}} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.header}>Barometer Logger (Lab 4)</Text>

        {/* 1. Блок поточного значення */}
        <View style={styles.card}>
          <Text style={styles.label}>Поточний атмосферний тиск</Text>
          <Text style={styles.value}>{currentPressure} <Text style={{fontSize: 20}}>hPa</Text></Text>
          <Text style={{textAlign: 'center', color: '#555', marginBottom: 10}}>
            {weather.text}
          </Text>

          <TouchableOpacity 
            style={[styles.btn, { backgroundColor: isRecording ? '#ff4444' : '#00C851' }]}
            onPress={() => setIsRecording(!isRecording)}
          >
            <Text style={styles.btnText}>
              {isRecording ? "⏹ ЗУПИНИТИ ЗАПИС" : "▶️ СТАРТ ЗАПИСУ"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 2. Блок Графіка */}
        <View style={styles.card}>
          <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom: 10}}>
            <Text style={styles.label}>Графік змін</Text>
            <View style={{flexDirection:'row'}}>
              <TouchableOpacity onPress={() => setTimeRange(1)} style={[styles.smBtn, timeRange===1 && styles.activeBtn]}>
                <Text style={timeRange===1 ? styles.activeText : styles.smText}>1 Год</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTimeRange(24)} style={[styles.smBtn, timeRange===24 && styles.activeBtn]}>
                <Text style={timeRange===24 ? styles.activeText : styles.smText}>24 Год</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <LineChart
            data={chartData}
            width={Dimensions.get("window").width - 40}
            height={220}
            yAxisSuffix=" hPa"
            chartConfig={{
              backgroundColor: "#fff",
              backgroundGradientFrom: "#fff",
              backgroundGradientTo: "#fff",
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              propsForDots: { r: "3" }
            }}
            bezier
            style={{ borderRadius: 16 }}
          />
        </View>

        {/* 3. Статистика (Береться з SQL) */}
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

        {/* 4. Кнопки керування БД */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, {backgroundColor: '#33b5e5', flex: 1, marginRight: 5}]} onPress={handleExport}>
            <Text style={styles.btnText}>💾 Експорт CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, {backgroundColor: '#ffbb33', flex: 1, marginLeft: 5}]} onPress={handleClear}>
            <Text style={styles.btnText}>🧹 Очистити</Text>
          </TouchableOpacity>
        </View>

        <View style={{height: 50}} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  header: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', margin: 20, color: '#333' },
  card: { backgroundColor: 'white', marginHorizontal: 15, marginBottom: 15, padding: 15, borderRadius: 12, elevation: 3 },
  label: { fontSize: 16, fontWeight: '600', color: '#444', marginBottom: 5 },
  value: { fontSize: 42, fontWeight: 'bold', textAlign: 'center', color: '#000' },
  btn: { padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  btnText: { color: 'white', fontWeight: 'bold' },
  row: { flexDirection: 'row', marginHorizontal: 15 },
  // Стилі для кнопок часу
  smBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 5, marginLeft: 5, borderWidth: 1, borderColor: '#ccc' },
  activeBtn: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  smText: { color: '#666', fontSize: 12 },
  activeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  // Статистика
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 },
  statItem: { width: '48%', backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  statLabel: { fontSize: 12, color: '#888' },
  statVal: { fontSize: 18, fontWeight: 'bold', color: '#333' },
});

export default App;