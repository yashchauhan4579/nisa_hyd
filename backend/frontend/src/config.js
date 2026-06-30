// API Configuration - Use same hostname as frontend, with backend port 8001
export const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8001`;

export default {
    API_URL,
};
