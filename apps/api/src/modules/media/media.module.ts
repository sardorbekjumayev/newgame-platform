import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

/** Yuklangan fayllar: saqlash (STORAGE_DIR) va ommaga berish (GET /media/...). */
@Module({ controllers: [MediaController], providers: [MediaService], exports: [MediaService] })
export class MediaModule {}
