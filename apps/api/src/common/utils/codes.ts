import { randomInt } from 'crypto';

/** User ID: 7 xonali raqam (og'zaki aytish oson), 0 bilan boshlanmaydi. Unikalligi DB'da tekshiriladi. */
export const publicIdCandidate = () => String(randomInt(1_000_000, 10_000_000));
