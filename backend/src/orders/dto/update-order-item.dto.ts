import { IsIn, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { UNIT_TYPES } from '../../products/unit-types';

export class UpdateOrderItemDto {
  // Not IsInt: weight units are fractional. Two decimal places matches the
  // column, and IsPositive still rejects zero and negatives.
  //
  // Optional because a unit change alone is a valid edit — the service
  // rejects a request that carries neither field.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  quantity?: number;

  // Per-item, not per-product: changing the unit here is a decision about
  // this one order and leaves the catalogue alone.
  @IsIn(UNIT_TYPES)
  @IsOptional()
  unitType?: string;
}
