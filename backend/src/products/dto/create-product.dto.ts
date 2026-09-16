import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { UNIT_TYPES } from '../unit-types';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  // Constrained to the fixed list so the app can tell weight from count.
  @IsIn(UNIT_TYPES)
  unitType: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;
}
