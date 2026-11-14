import { Module } from '@nestjs/common';
import { ClubSettingsController } from './club-settings.controller';
import { ClubSettingsService } from './club-settings.service';

/** Operator: zonalar, tariflar, ish vaqti. */
@Module({ controllers: [ClubSettingsController], providers: [ClubSettingsService] })
export class ClubSettingsModule {}
