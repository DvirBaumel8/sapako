import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { UNIT_TYPES } from '../../products/unit-types';

export class AddOrderItemDto {
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ValidateIf((dto) => !dto.productId)
  @IsString()
  productNameSnapshot?: string;

  /**
   * Required only for an ad-hoc item (a barcode scan that matched nothing,
   * so there is no product row to take the unit from), but constrained to
   * the fixed list whenever it is present.
   *
   * The two conditions are deliberately separate. Guarding solely on
   * `!productId` would skip every check when a productId is given — which is
   * the path that carries a per-order unit override, so a free-text unit
   * could be written straight onto the item.
   */
  @ValidateIf((dto) => !dto.productId || dto.unitType !== undefined)
  @IsString()
  @IsIn(UNIT_TYPES)
  unitType?: string;

  // Not IsInt: weight units are fractional. Two decimal places matches the
  // column, and IsPositive still rejects zero and negatives.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity: number;
}
