const storage = new Map();

const AsyncStorage = {
  getItem: async (key) => storage.get(key) || null,
  setItem: async (key, val) => storage.set(key, val),
  removeItem: async (key) => storage.delete(key),
  clear: async () => storage.clear(),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
