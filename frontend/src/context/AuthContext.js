import React, { createContext, useState, useContext} from 'react';

const AuthContext = createContext();

// Provides logged-in user info to the whole app
export function AuthProvider({ children }) {
  function getStoredUser() {
  const storedUser = localStorage.getItem('felicityUser');

  if (storedUser) {
    return JSON.parse(storedUser);
  }

  return null;
}

const [user, setUser] = useState(getStoredUser());

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('felicityUser', JSON.stringify(userData));
  };

  // Partially update stored user (e.g. set onboardingDone after onboarding)
  const updateUser = (patch) => {
    setUser((prev) => {
      const updated = { ...prev, ...patch };
      localStorage.setItem('felicityUser', JSON.stringify(updated));
      return updated;
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('felicityUser');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook - makes it easy to use auth anywhere
export function useAuth() {
  return useContext(AuthContext);
}
