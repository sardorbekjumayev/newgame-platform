import type { NextConfig } from "next";

// Brauzer API'ni shu domen orqali chaqiradi (/api/v1/*) — tashqi IP/domendan ochilganda ham ishlaydi, CORS kerak emas.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4900";
// Mijoz sayti: klub "share card" rasmi shu yerda yasaladi — panel o'z domeni orqali proksi qiladi (navigator.share uchun same-origin)
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:4910";

const nextConfig: NextConfig = {
  // Dev server'ni localhost'dan boshqa manzil (server IP/domen) orqali ochish: shu hostlarga /_next asset'lari beriladi.
  // .env.local → ALLOWED_DEV_ORIGINS=169.58.198.20,dev.example.uz
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` },
      { source: "/share-card/:id", destination: `${WEB_ORIGIN}/clubs/:id/share` },
    ];
  },
};

export default nextConfig;
