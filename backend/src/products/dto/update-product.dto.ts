import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
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

  // Tri-state: omitted leaves the category untouched, a UUID assigns it, and
  // explicit null un-assigns it back to "uncategorized" — the toggle-list
  // bulk-assign screen needs that third state to remove a product from a
  // category, not just add it to one.
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  @IsOptional()
  categoryId?: string | null;
}
