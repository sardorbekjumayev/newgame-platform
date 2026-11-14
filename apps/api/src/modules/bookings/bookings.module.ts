import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

/** Mijoz bronlari va operator bronlar ro'yxati. */
@Module({ controllers: [BookingsController], providers: [BookingsService] })
export class BookingsModule {}
