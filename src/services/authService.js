import jwt from "jsonwebtoken";
import axios from "axios";

export async function verifyToken(authHeader, env = process.env) {
  if (!authHeader) return null;
  const token = `${authHeader}`.replace(/^Bearer\s+/i, "");
  // delegar si hay USER_SERVICE_URL
  if (env.USER_SERVICE_URL) {
    try {
      const res = await axios.get(`${env.USER_SERVICE_URL}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 3000
      });
      return res.data.user || null;
    } catch (e) {
      // console.warn("delegated verify failed:", e.message);
    }
  }

  // fallback: verificar JWT localmente
  if (!env.JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return {
      id: payload.sub || payload.id || payload.userId,
      name: payload.name || payload.username || payload.user,
      email: payload.email
    };
  } catch (e) {
    return null;
  }
}
