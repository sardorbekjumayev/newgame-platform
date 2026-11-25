import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

/** Super admin: baza + yuklangan fayllar zaxira nusxasi (zip). */
@Module({ imports: [MediaModule], controllers: [BackupsController], providers: [BackupsService] })
export class BackupsModule {}
