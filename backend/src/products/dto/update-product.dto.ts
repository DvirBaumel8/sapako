import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { UNIT_TYPES } from '../unit-types';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  // Constrained to the fixed list so the app can tell weight from count.
  @IsIn(UNIT_TYPES)
  unitType?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
