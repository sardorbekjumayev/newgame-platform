import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** Ommaviy katalog (mijozlar sayti): xarita, klub sahifasi, landing ma'lumotlari. */
@Module({ controllers: [CatalogController], providers: [CatalogService] })
export class CatalogModule {}
