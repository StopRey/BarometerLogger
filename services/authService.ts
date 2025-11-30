import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_KEY = '@barometer_user';

export interface User {
  uid: string;
  email: string | null;
}

export const authService = {
  // Реєстрація
  register: async (email: string, password: string): Promise<User> => {
    try {
      const userCredential = await auth().createUserWithEmailAndPassword(email, password);
      const user = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
      };
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Помилка реєстрації');
    }
  },

  // Вхід
  login: async (email: string, password: string): Promise<User> => {
    try {
      const userCredential = await auth().signInWithEmailAndPassword(email, password);
      const user = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
      };
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Помилка входу');
    }
  },

  // Вихід
  logout: async (): Promise<void> => {
    try {
      await auth().signOut();
      await AsyncStorage.removeItem(USER_KEY);
    } catch (error: any) {
      console.error('Logout error:', error);
      throw new Error(error.message || 'Помилка виходу');
    }
  },

  // Отримати поточного користувача
  getCurrentUser: async (): Promise<User | null> => {
    try {
      const user = auth().currentUser;
      if (user) {
        const userData = {
          uid: user.uid,
          email: user.email,
        };
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
        return userData;
      }
      
      // Спробувати отримати з AsyncStorage
      const stored = await AsyncStorage.getItem(USER_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  },

  // Перевірити чи авторизований
  isAuthenticated: (): boolean => {
    return auth().currentUser !== null;
  },

  // Слухач змін авторизації
  onAuthStateChanged: (callback: (user: User | null) => void) => {
    return auth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        const user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        };
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
        callback(user);
      } else {
        await AsyncStorage.removeItem(USER_KEY);
        callback(null);
      }
    });
  },
};

