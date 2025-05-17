const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage is not available:', e);
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('localStorage is not available:', e);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('localStorage is not available:', e);
      return false;
    }
  }
};

export default storage;